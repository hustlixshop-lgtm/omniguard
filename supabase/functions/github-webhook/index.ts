import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

/**
 * GitHub Webhook Handler + PR Blocking via GitHub Checks API
 *
 * Handles push and pull_request events.
 * For PRs: creates a "pending" GitHub Check Run immediately, then invokes the
 * scan-worker. After the scan completes (via DB polling), updates the Check
 * Run to pass or fail — blocking the PR merge if critical findings are found.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-GitHub-Event, X-GitHub-Delivery, X-Hub-Signature-256",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function verifySignature(secret: string, payload: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expected = "sha256=" + Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  return signature === expected;
}

async function getGitHubToken(organizationId: string): Promise<string | null> {
  const { data } = await supabase.from("integrations").select("config").eq("organization_id", organizationId).eq("provider", "github").eq("status", "active").maybeSingle();
  return (data?.config as Record<string, string>)?.access_token || Deno.env.get("GITHUB_TOKEN") || null;
}

// Create a GitHub Check Run on the PR commit
async function createCheckRun(token: string, fullName: string, sha: string, scanId: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${fullName}/check-runs`, {
      method: "POST",
      headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json", "User-Agent": "OmniGuard/1.0", "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "OmniGuard Security Scan",
        head_sha: sha,
        status: "in_progress",
        started_at: new Date().toISOString(),
        output: { title: "Scanning for security issues...", summary: `OmniGuard is running a security scan (ID: ${scanId}). Results will appear shortly.` },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) { console.error("GitHub check-run create failed:", await res.text()); return null; }
    const data = await res.json();
    return data.id;
  } catch (e) { console.error("createCheckRun error:", e); return null; }
}

// Update the Check Run with scan results (pass/fail/action_required)
async function updateCheckRun(token: string, fullName: string, checkRunId: number, findings: {
  total: number; critical: number; high: number; medium: number; low: number
}, failOn: string): Promise<void> {
  const shouldFail = (
    failOn === "critical" ? findings.critical > 0 :
    failOn === "high" ? findings.critical > 0 || findings.high > 0 :
    failOn === "medium" ? findings.critical > 0 || findings.high > 0 || findings.medium > 0 :
    findings.total > 0
  );

  const conclusion = shouldFail ? "action_required" : "success";
  const title = shouldFail
    ? `${findings.critical} critical · ${findings.high} high findings — merge blocked`
    : findings.total > 0
    ? `${findings.total} findings (none blocking)`
    : "✓ No security issues found";

  const summaryLines = [
    `**OmniGuard Security Scan Results**\n`,
    `| Severity | Count |`,
    `|----------|-------|`,
    `| 🔴 Critical | ${findings.critical} |`,
    `| 🟠 High | ${findings.high} |`,
    `| 🟡 Medium | ${findings.medium} |`,
    `| 🟢 Low | ${findings.low} |`,
    `| **Total** | **${findings.total}** |`,
    "",
    shouldFail
      ? `\n⛔ **Merge blocked.** Resolve critical/high findings before merging.\nView details in the [OmniGuard Dashboard](${supabaseUrl.replace("https://", "https://").replace(".supabase.co", ".supabase.co").replace(/\/.*/, "")}/findings).`
      : `\n✅ **Safe to merge.** No blocking security issues found.`,
  ].join("\n");

  try {
    await fetch(`https://api.github.com/repos/${fullName}/check-runs/${checkRunId}`, {
      method: "PATCH",
      headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json", "User-Agent": "OmniGuard/1.0", "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "completed",
        completed_at: new Date().toISOString(),
        conclusion,
        output: { title, summary: summaryLines },
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) { console.error("updateCheckRun error:", e); }
}

// Poll for scan completion and update the Check Run
// This runs as a background task — fire and forget
async function pollAndUpdateCheck(token: string, fullName: string, checkRunId: number, scanId: string, failOn: string): Promise<void> {
  const MAX_WAIT_SECONDS = 180;
  const POLL_INTERVAL_MS = 5_000;
  const start = Date.now();

  while (Date.now() - start < MAX_WAIT_SECONDS * 1000) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const { data: scan } = await supabase.from("scans").select("status, summary").eq("id", scanId).single();
    if (!scan) break;

    if (scan.status === "completed" || scan.status === "failed") {
      const summary = (scan.summary as Record<string, number>) || {};
      await updateCheckRun(token, fullName, checkRunId, {
        total: summary.total || 0,
        critical: summary.critical || 0,
        high: summary.high || 0,
        medium: summary.medium || 0,
        low: summary.low || 0,
      }, failOn);
      return;
    }
  }

  // Timed out — update check as failed
  await fetch(`https://api.github.com/repos/${fullName}/check-runs/${checkRunId}`, {
    method: "PATCH",
    headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json", "User-Agent": "OmniGuard/1.0", "Content-Type": "application/json" },
    body: JSON.stringify({ status: "completed", completed_at: new Date().toISOString(), conclusion: "timed_out",
      output: { title: "Scan timed out", summary: "OmniGuard scan did not complete within 3 minutes." } }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {});
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const githubEvent = req.headers.get("X-GitHub-Event");
    const signature = req.headers.get("X-Hub-Signature-256");

    if (!githubEvent) return new Response(JSON.stringify({ error: "Missing X-GitHub-Event" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const payload = await req.text();
    if (githubEvent === "ping") return new Response(JSON.stringify({ received: true, message: "OmniGuard webhook active" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // ── Push event ────────────────────────────────────────────────────────
    if (githubEvent === "push") {
      const event = JSON.parse(payload);
      if (event.after === "0000000000000000000000000000000000000000") {
        return new Response(JSON.stringify({ received: true, message: "Branch deletion ignored" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: repo } = await supabase.from("repositories").select("id, organization_id, webhook_secret, created_by, full_name, default_branch").eq("provider", "github").eq("provider_id", String(event.repository.id)).is("deleted_at", null).maybeSingle();
      if (!repo) return new Response(JSON.stringify({ received: true, message: "Repository not registered" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      if (repo.webhook_secret && signature) {
        if (!await verifySignature(repo.webhook_secret, payload, signature)) {
          return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      const branch = event.ref.replace("refs/heads/", "");
      const changedFiles = event.commits?.flatMap((c: {added: string[]; modified: string[]; removed: string[]}) => [...c.added, ...c.modified, ...c.removed]) || [];

      const { data: scan } = await supabase.from("scans").insert({
        repository_id: repo.id, organization_id: repo.organization_id, status: "queued",
        trigger: "webhook", branch, commit_sha: event.after,
        commit_message: event.commits?.[0]?.message || "Push event",
        commit_author: event.sender?.login, created_by: repo.created_by,
        metadata: { changed_files: changedFiles.slice(0, 500), commits: event.commits?.length || 0, pusher: event.sender?.login },
      }).select().single();

      if (scan) {
        await supabase.from("repositories").update({ last_sync_at: new Date().toISOString() }).eq("id", repo.id);
        await supabase.from("audit_logs").insert({ organization_id: repo.organization_id, action: "webhook_received", resource_type: "scan", resource_id: scan.id, resource_name: `${repo.full_name}:${branch}`, metadata: { commits: event.commits?.length, pusher: event.sender?.login } });

        // Invoke worker
        fetch(`${supabaseUrl}/functions/v1/scan-worker/process`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({ scan_id: scan.id, repository_id: repo.id, organization_id: repo.organization_id }),
        }).catch(() => {});
      }

      return new Response(JSON.stringify({ received: true, scan_id: scan?.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Pull Request event ─────────────────────────────────────────────────
    if (githubEvent === "pull_request") {
      const event = JSON.parse(payload);
      if (!["opened", "synchronize", "reopened"].includes(event.action)) {
        return new Response(JSON.stringify({ received: true, message: `PR action '${event.action}' not processed` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: repo } = await supabase.from("repositories").select("id, organization_id, webhook_secret, created_by, full_name").eq("provider", "github").eq("provider_id", String(event.repository.id)).is("deleted_at", null).maybeSingle();
      if (!repo) return new Response(JSON.stringify({ received: true, message: "Repository not registered" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      if (repo.webhook_secret && signature) {
        if (!await verifySignature(repo.webhook_secret, payload, signature)) {
          return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      const { data: scan } = await supabase.from("scans").insert({
        repository_id: repo.id, organization_id: repo.organization_id, status: "queued",
        trigger: "pull_request", branch: event.pull_request.head.ref, commit_sha: event.pull_request.head.sha,
        commit_message: `PR #${event.pull_request.number}: ${event.pull_request.title}`,
        commit_author: event.sender?.login, created_by: repo.created_by,
        metadata: { pr_number: event.pull_request.number, pr_title: event.pull_request.title, base_branch: event.pull_request.base.ref },
      }).select().single();

      if (!scan) return new Response(JSON.stringify({ received: true, message: "Failed to create scan" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      await supabase.from("audit_logs").insert({ organization_id: repo.organization_id, action: "pr_scan_triggered", resource_type: "scan", resource_id: scan.id, resource_name: `${repo.full_name} PR#${event.pull_request.number}`, metadata: { action: event.action, pr_number: event.pull_request.number } });

      // Create GitHub Check Run to block merging while scan runs
      const token = await getGitHubToken(repo.organization_id);
      let checkRunId: number | null = null;
      if (token) {
        checkRunId = await createCheckRun(token, repo.full_name, event.pull_request.head.sha, scan.id);
      }

      // Get org fail_on setting (default: high blocks PRs)
      const { data: org } = await supabase.from("organizations").select("settings").eq("id", repo.organization_id).single();
      const failOn = (org?.settings as Record<string, string>)?.pr_fail_on || "high";

      // Invoke worker immediately
      fetch(`${supabaseUrl}/functions/v1/scan-worker/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
        body: JSON.stringify({ scan_id: scan.id, repository_id: repo.id, organization_id: repo.organization_id }),
      }).catch(() => {});

      // Poll for completion and update Check Run (background)
      if (token && checkRunId) {
        pollAndUpdateCheck(token, repo.full_name, checkRunId, scan.id, failOn).catch(e => console.error("pollAndUpdateCheck failed:", e));
      }

      return new Response(JSON.stringify({ received: true, scan_id: scan.id, check_run_id: checkRunId, pr_number: event.pull_request.number }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ received: true, message: `Event '${githubEvent}' acknowledged` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal error", details: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
