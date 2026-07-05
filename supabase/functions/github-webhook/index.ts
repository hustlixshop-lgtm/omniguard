import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, X-GitHub-Event, X-GitHub-Delivery, X-Hub-Signature-256",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface GitHubPushEvent {
  ref: string;
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: { login: string };
    default_branch: string;
    private: boolean;
    description?: string;
    language?: string;
  };
  after: string;
  before: string;
  commits: Array<{
    id: string;
    message: string;
    author: { name: string; email: string };
    added: string[];
    removed: string[];
    modified: string[];
  }>;
  sender: { login: string };
}

interface GitHubPullRequestEvent {
  action: string;
  pull_request: {
    number: number;
    title: string;
    head: { sha: string; ref: string };
    base: { ref: string };
  };
  repository: {
    id: number;
    full_name: string;
  };
  sender: { login: string };
}

async function verifySignature(secret: string, payload: string, signature: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return signature === `sha256=${expected}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const githubEvent = req.headers.get("X-GitHub-Event");
    const signature = req.headers.get("X-Hub-Signature-256");

    if (!githubEvent) {
      return new Response(JSON.stringify({ error: "Missing X-GitHub-Event header" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await req.text();

    if (githubEvent === "ping") {
      return new Response(JSON.stringify({ received: true, message: "OmniGuard webhook endpoint active" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (githubEvent === "push") {
      const event: GitHubPushEvent = JSON.parse(payload);

      // Skip branch deletions
      if (event.after === "0000000000000000000000000000000000000000") {
        return new Response(JSON.stringify({ received: true, message: "Branch deletion ignored" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: repo, error: repoError } = await supabase
        .from("repositories")
        .select("id, organization_id, webhook_secret, created_by, full_name, default_branch")
        .eq("provider", "github")
        .eq("provider_id", String(event.repository.id))
        .is("deleted_at", null)
        .maybeSingle();

      if (repoError || !repo) {
        console.log("Repository not found:", event.repository.full_name);
        return new Response(JSON.stringify({ received: true, message: "Repository not registered with OmniGuard" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify webhook signature
      if (repo.webhook_secret && signature) {
        const valid = await verifySignature(repo.webhook_secret, payload, signature);
        if (!valid) {
          return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const branch = event.ref.replace("refs/heads/", "");
      const allChangedFiles = event.commits.flatMap((c) => [...c.added, ...c.modified, ...c.removed]);

      // Create scan record — worker will pick this up from scan_queue
      const { data: scan, error: scanError } = await supabase
        .from("scans")
        .insert({
          repository_id: repo.id,
          organization_id: repo.organization_id,
          status: "queued",
          trigger: "webhook",
          branch,
          commit_sha: event.after,
          commit_message: event.commits[0]?.message || "Push event",
          commit_author: event.sender.login,
          created_by: repo.created_by,
          metadata: {
            changed_files: allChangedFiles.slice(0, 500),
            commits: event.commits.length,
            pusher: event.sender.login,
          },
        })
        .select()
        .single();

      if (scanError) {
        console.error("Failed to create scan:", scanError);
        return new Response(JSON.stringify({ error: "Failed to create scan record" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update repo sync time
      await supabase
        .from("repositories")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("id", repo.id);

      await supabase.from("audit_logs").insert({
        organization_id: repo.organization_id,
        action: "webhook_received",
        resource_type: "scan",
        resource_id: scan.id,
        resource_name: `${repo.full_name}:${branch}`,
        metadata: {
          commits: event.commits.length,
          pusher: event.sender.login,
          before: event.before,
          after: event.after,
          changed_files_count: allChangedFiles.length,
        },
      });

      return new Response(
        JSON.stringify({ received: true, scan_id: scan.id, repository: repo.full_name, branch, commits: event.commits.length }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (githubEvent === "pull_request") {
      const event: GitHubPullRequestEvent = JSON.parse(payload);

      if (!["opened", "synchronize", "reopened"].includes(event.action)) {
        return new Response(JSON.stringify({ received: true, message: `PR action '${event.action}' not processed` }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: repo } = await supabase
        .from("repositories")
        .select("id, organization_id, webhook_secret, created_by, full_name")
        .eq("provider", "github")
        .eq("provider_id", String(event.repository.id))
        .is("deleted_at", null)
        .maybeSingle();

      if (!repo) {
        return new Response(JSON.stringify({ received: true, message: "Repository not registered" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (repo.webhook_secret && signature) {
        const valid = await verifySignature(repo.webhook_secret, payload, signature);
        if (!valid) {
          return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const { data: scan } = await supabase
        .from("scans")
        .insert({
          repository_id: repo.id,
          organization_id: repo.organization_id,
          status: "queued",
          trigger: "pull_request",
          branch: event.pull_request.head.ref,
          commit_sha: event.pull_request.head.sha,
          commit_message: `PR #${event.pull_request.number}: ${event.pull_request.title}`,
          commit_author: event.sender.login,
          created_by: repo.created_by,
          metadata: {
            pr_number: event.pull_request.number,
            pr_title: event.pull_request.title,
            base_branch: event.pull_request.base.ref,
          },
        })
        .select()
        .single();

      await supabase.from("audit_logs").insert({
        organization_id: repo.organization_id,
        action: "pr_scan_triggered",
        resource_type: "scan",
        resource_id: scan?.id,
        resource_name: `${repo.full_name} PR#${event.pull_request.number}`,
        metadata: { action: event.action, pr_number: event.pull_request.number },
      });

      return new Response(
        JSON.stringify({ received: true, scan_id: scan?.id, pr_number: event.pull_request.number }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ received: true, message: `Event '${githubEvent}' acknowledged` }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: "Internal server error", details: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
