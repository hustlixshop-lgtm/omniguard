import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-API-Key",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface ScanRequest {
  repository: string;
  commit?: string;
  branch?: string;
  trigger?: string;
}

async function verifyAuth(authHeader: string | null): Promise<{
  valid: boolean;
  organizationId?: string;
  userId?: string;
}> {
  if (!authHeader?.startsWith("Bearer ")) return { valid: false };
  const token = authHeader.slice(7);

  if (token.includes(".") && token.split(".").length === 3) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return { valid: false };
      const { data: membership } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      return { valid: true, organizationId: membership?.organization_id, userId: user.id };
    } catch {
      return { valid: false };
    }
  }

  if (!token.startsWith("og_")) return { valid: false };

  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  const keyHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const keyPrefix = token.slice(0, 12);

  const { data: apiKey } = await supabase
    .from("api_keys")
    .select("organization_id, expires_at")
    .eq("key_hash", keyHash)
    .eq("key_prefix", keyPrefix)
    .eq("is_active", true)
    .maybeSingle();

  if (!apiKey) return { valid: false };
  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) return { valid: false };
  return { valid: true, organizationId: apiKey.organization_id };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.pathname.replace("/functions/v1/api-v1-scans", "");
  const auth = await verifyAuth(req.headers.get("Authorization"));

  if (!auth.valid) {
    return new Response(
      JSON.stringify({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing authentication" } }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const orgId = auth.organizationId;

  try {
    // POST /scans — create and queue scan
    if (req.method === "POST" && (path === "" || path === "/")) {
      const body: ScanRequest = await req.json();
      if (!body.repository) {
        return new Response(
          JSON.stringify({ success: false, error: { code: "BAD_REQUEST", message: "repository is required" } }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.repository);
      let repoQuery = supabase
        .from("repositories")
        .select("id, organization_id, name, full_name, default_branch")
        .eq("organization_id", orgId)
        .is("deleted_at", null);

      repoQuery = isUuid ? repoQuery.eq("id", body.repository) : repoQuery.eq("full_name", body.repository);

      const { data: repo, error: repoError } = await repoQuery.maybeSingle();
      if (repoError || !repo) {
        return new Response(
          JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "Repository not found or not accessible" } }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: scan, error: scanError } = await supabase
        .from("scans")
        .insert({
          repository_id: repo.id,
          organization_id: orgId,
          status: "queued",
          trigger: body.trigger || "api",
          branch: body.branch || repo.default_branch,
          commit_sha: body.commit || null,
          created_by: auth.userId || null,
        })
        .select()
        .single();

      if (scanError) throw scanError;

      await supabase.from("audit_logs").insert({
        organization_id: orgId,
        user_id: auth.userId || null,
        action: "scan_triggered",
        resource_type: "scan",
        resource_id: scan.id,
        resource_name: `${repo.full_name}:${scan.branch}`,
        metadata: { trigger: scan.trigger, commit: scan.commit_sha },
      });

      return new Response(
        JSON.stringify({
          success: true,
          data: { id: scan.id, repository: repo.full_name, branch: scan.branch, status: scan.status, created_at: scan.created_at },
        }),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /scans — list
    if (req.method === "GET" && (path === "" || path === "/")) {
      const status = url.searchParams.get("status");
      const repository_id = url.searchParams.get("repository_id");
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
      const offset = parseInt(url.searchParams.get("offset") || "0");

      let query = supabase
        .from("scans")
        .select(
          "id, status, trigger, branch, commit_sha, created_at, started_at, completed_at, duration_seconds, repositories!inner(full_name)",
          { count: "exact" }
        )
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) query = query.eq("status", status);
      if (repository_id) query = query.eq("repository_id", repository_id);

      const { data: scans, error, count } = await query;
      if (error) throw error;

      return new Response(
        JSON.stringify({
          success: true,
          data: scans?.map((s) => ({ ...s, repository: s.repositories })),
          meta: { total: count, limit, offset, has_more: (count || 0) > offset + limit },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /scans/:id
    if (req.method === "GET" && path.startsWith("/") && path.length > 1 && !path.includes("/retry")) {
      const scanId = path.slice(1);
      const { data: scan, error } = await supabase
        .from("scans")
        .select("*, repositories!inner(full_name, organization_id), findings(id, severity, title, scanner, status)")
        .eq("id", scanId)
        .eq("organization_id", orgId)
        .maybeSingle();

      if (error) throw error;
      if (!scan) {
        return new Response(
          JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "Scan not found" } }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data: { ...scan, repository: scan.repositories, findings: scan.findings } }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST /scans/:id/retry
    if (req.method === "POST" && path.match(/^\/[a-f0-9-]+\/retry$/)) {
      const scanId = path.split("/")[1];
      const { data: existingScan, error: findError } = await supabase
        .from("scans")
        .select("*, repositories!inner(full_name)")
        .eq("id", scanId)
        .eq("organization_id", orgId)
        .maybeSingle();

      if (findError || !existingScan) {
        return new Response(
          JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "Scan not found" } }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!["failed", "cancelled"].includes(existingScan.status)) {
        return new Response(
          JSON.stringify({ success: false, error: { code: "BAD_REQUEST", message: "Only failed or cancelled scans can be retried" } }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: newScan, error: retryError } = await supabase
        .from("scans")
        .insert({
          repository_id: existingScan.repository_id,
          organization_id: orgId,
          status: "queued",
          trigger: "retry",
          branch: existingScan.branch,
          commit_sha: existingScan.commit_sha,
          created_by: auth.userId || null,
        })
        .select()
        .single();

      if (retryError) throw retryError;

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: newScan.id,
            previous_scan_id: scanId,
            repository: existingScan.repositories.full_name,
            branch: newScan.branch,
            status: newScan.status,
          },
        }),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "Endpoint not found" } }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("api-v1-scans error:", error);
    return new Response(
      JSON.stringify({ success: false, error: { code: "INTERNAL_ERROR", message: error.message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
