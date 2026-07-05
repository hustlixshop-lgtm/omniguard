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
  auth: { autoRefreshToken: false, persistSession: false }
});

interface Finding {
  id: string;
  organization_id: string;
  repository_id: string;
  severity: string;
  title: string;
  description: string | null;
  file_path: string | null;
  line_start: number | null;
  scanner: string;
  status: string;
  cvss_score: number | null;
  cve_id: string | null;
  remediation: string | null;
  ai_summary: string | null;
  ai_remediation: string | null;
  created_at: string;
  updated_at: string;
}

async function verifyApiKey(authHeader: string | null): Promise<{ valid: boolean; organizationId?: string; userId?: string }> {
  if (!authHeader?.startsWith("Bearer ")) {
    return { valid: false };
  }

  const token = authHeader.slice(7);

  // Check if it's a JWT (user session) or API key
  if (token.includes(".") && token.split(".").length === 3) {
    // JWT token - validate with Supabase
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return { valid: false };
      }

      // Get user's default organization
      const { data: membership } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at")
        .limit(1)
        .maybeSingle();

      return {
        valid: true,
        organizationId: membership?.organization_id,
        userId: user.id
      };
    } catch {
      return { valid: false };
    }
  }

  // API key format: og_live_xxxxx
  if (!token.startsWith("og_")) {
    return { valid: false };
  }

  // Hash the key and look it up
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const keyHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  const keyPrefix = token.slice(0, 12);

  const { data: apiKey, error } = await supabase
    .from("api_keys")
    .select("organization_id, expires_at")
    .eq("key_hash", keyHash)
    .eq("key_prefix", keyPrefix)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !apiKey) {
    return { valid: false };
  }

  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
    return { valid: false };
  }

  return { valid: true, organizationId: apiKey.organization_id };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace("/functions/v1/api-v1-findings", "");

  // Verify authentication
  const authResult = await verifyApiKey(req.headers.get("Authorization"));

  if (!authResult.valid) {
    return new Response(JSON.stringify({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Invalid or missing authentication" }
    }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const orgId = authResult.organizationId;

  try {
    // GET /findings - List findings for organization
    if (req.method === "GET" && (path === "" || path === "/")) {
      const severity = url.searchParams.get("severity");
      const status = url.searchParams.get("status");
      const scanner = url.searchParams.get("scanner");
      const repository_id = url.searchParams.get("repository_id");
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
      const offset = parseInt(url.searchParams.get("offset") || "0");

      let query = supabase
        .from("findings")
        .select("id, severity, title, file_path, line_start, scanner, status, cvss_score, cve_id, created_at, repositories!inner(full_name)", { count: "exact" })
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (severity) query = query.eq("severity", severity);
      if (status) query = query.eq("status", status);
      if (scanner) query = query.eq("scanner", scanner);
      if (repository_id) query = query.eq("repository_id", repository_id);

      const { data: findings, error, count } = await query;

      if (error) {
        throw error;
      }

      return new Response(JSON.stringify({
        success: true,
        data: findings?.map(f => ({
          ...f,
          repository: f.repositories
        })),
        meta: {
          total: count,
          limit,
          offset,
          has_more: (count || 0) > offset + limit
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // GET /findings/:id - Get single finding
    if (req.method === "GET" && path.startsWith("/") && path.length > 1) {
      const findingId = path.slice(1);

      const { data: finding, error } = await supabase
        .from("findings")
        .select(`
          *,
          repositories!inner(full_name, organization_id)
        `)
        .eq("id", findingId)
        .eq("organization_id", orgId)
        .maybeSingle();

      if (error) throw error;

      if (!finding) {
        return new Response(JSON.stringify({
          success: false,
          error: { code: "NOT_FOUND", message: "Finding not found" }
        }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Verify the repository belongs to this organization
      if (finding.repositories.organization_id !== orgId) {
        return new Response(JSON.stringify({
          success: false,
          error: { code: "FORBIDDEN", message: "Access denied" }
        }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        data: {
          ...finding,
          repository: { full_name: finding.repositories.full_name }
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // PATCH /findings/:id - Update finding status
    if (req.method === "PATCH" && path.startsWith("/") && path.length > 1) {
      const findingId = path.slice(1);
      const body = await req.json();

      const allowedUpdates = ["status", "assigned_to", "resolution_note"];
      const updates: Record<string, unknown> = {};

      for (const key of allowedUpdates) {
        if (body[key] !== undefined) {
          updates[key] = body[key];
        }
      }

      if (body.status === "resolved") {
        updates.resolved_at = new Date().toISOString();
      }

      const { data: finding, error } = await supabase
        .from("findings")
        .update(updates)
        .eq("id", findingId)
        .eq("organization_id", orgId)
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({
        success: true,
        data: finding
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // POST /findings/:id/suppress
    if (req.method === "POST" && path.match(/^\/[a-f0-9-]+\/suppress$/)) {
      const findingId = path.split("/")[1];
      const body = await req.json().catch(() => ({}));
      const reason = body.reason?.slice(0, 500);

      if (!reason) {
        return new Response(JSON.stringify({
          success: false,
          error: { code: "BAD_REQUEST", message: "reason is required" }
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: finding, error: fetchErr } = await supabase
        .from("findings")
        .select("id, status")
        .eq("id", findingId)
        .eq("organization_id", orgId)
        .maybeSingle();

      if (fetchErr || !finding) {
        return new Response(JSON.stringify({
          success: false,
          error: { code: "NOT_FOUND", message: "Finding not found" }
        }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: updated, error: updateErr } = await supabase
        .from("findings")
        .update({
          status: "suppressed",
          suppressed_by: authResult.userId || null,
          suppressed_at: new Date().toISOString(),
          suppress_reason: reason,
        })
        .eq("id", findingId)
        .eq("organization_id", orgId)
        .select()
        .single();

      if (updateErr) throw updateErr;

      return new Response(JSON.stringify({ success: true, data: updated }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET /findings/:id/ai-remediation — get or generate AI remediation for a finding
    if (req.method === "GET" && path.match(/^\/[a-f0-9-]+\/ai-remediation$/)) {
      const findingId = path.split("/")[1];

      const { data: finding, error: fetchErr } = await supabase
        .from("findings")
        .select("id, title, description, evidence, severity, rule_id, rule_name, file_path, line_start, ai_remediation, remediation")
        .eq("id", findingId)
        .eq("organization_id", orgId)
        .maybeSingle();

      if (fetchErr || !finding) {
        return new Response(JSON.stringify({
          success: false,
          error: { code: "NOT_FOUND", message: "Finding not found" }
        }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Return cached AI remediation if available
      if (finding.ai_remediation) {
        return new Response(JSON.stringify({
          success: true,
          data: { finding_id: findingId, ai_remediation: finding.ai_remediation, remediation: finding.remediation, cached: true }
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Generate AI remediation on demand
      const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!anthropicKey) {
        return new Response(JSON.stringify({
          success: true,
          data: { finding_id: findingId, ai_remediation: null, remediation: finding.remediation, cached: false, reason: "AI not configured" }
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      try {
        const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 1000,
            messages: [{
              role: "user",
              content: `You are a security expert. Provide a concise remediation for this vulnerability.

Finding: ${finding.title}
Severity: ${finding.severity}
Rule: ${finding.rule_name}
File: ${finding.file_path}:${finding.line_start}
Description: ${finding.description}
Evidence: ${finding.evidence}

Provide:
1. What is wrong and why it's dangerous
2. Step-by-step fix with code example
3. Testing suggestion

Keep it under 600 words.`,
            }],
          }),
          signal: AbortSignal.timeout(25_000),
        });

        let aiRemediation: string | null = null;
        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          aiRemediation = aiData.content?.[0]?.text || null;
          if (aiRemediation) {
            await supabase.from("findings").update({ ai_remediation: aiRemediation }).eq("id", findingId);
          }
        }

        return new Response(JSON.stringify({
          success: true,
          data: { finding_id: findingId, ai_remediation: aiRemediation, remediation: finding.remediation, cached: false }
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch {
        return new Response(JSON.stringify({
          success: true,
          data: { finding_id: findingId, ai_remediation: null, remediation: finding.remediation, cached: false }
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    return new Response(JSON.stringify({
      success: false,
      error: { code: "NOT_FOUND", message: "Endpoint not found" }
    }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("API error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message }
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
