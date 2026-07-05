import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({
      success: false,
      error: { code: "METHOD_NOT_ALLOWED", message: "Only GET is supported" }
    }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const checks: {
    component: string;
    status: "healthy" | "unhealthy" | "degraded";
    latency_ms: number;
    details?: Record<string, unknown>;
  }[] = [];

  // Check database
  const dbStart = Date.now();
  try {
    const { error } = await supabase.from("organizations").select("id").limit(1);
    const dbLatency = Date.now() - dbStart;

    checks.push({
      component: "database",
      status: error ? "unhealthy" : "healthy",
      latency_ms: dbLatency,
      details: error ? { error: error.message } : { connection: "active" }
    });
  } catch (e) {
    checks.push({
      component: "database",
      status: "unhealthy",
      latency_ms: Date.now() - dbStart,
      details: { error: String(e) }
    });
  }

  // Check auth
  const authStart = Date.now();
  try {
    const { data: { users }, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    const authLatency = Date.now() - authStart;

    checks.push({
      component: "auth",
      status: error ? "degraded" : "healthy",
      latency_ms: authLatency,
      details: { users_registered: users.length > 0 }
    });
  } catch {
    checks.push({
      component: "auth",
      status: "degraded",
      latency_ms: Date.now() - authStart
    });
  }

  // Check storage
  const storageStart = Date.now();
  try {
    const { error } = await supabase.storage.listBuckets();
    const storageLatency = Date.now() - storageStart;

    checks.push({
      component: "storage",
      status: error ? "degraded" : "healthy",
      latency_ms: storageLatency
    });
  } catch {
    checks.push({
      component: "storage",
      status: "degraded",
      latency_ms: Date.now() - storageStart
    });
  }

  // Overall status
  const hasUnhealthy = checks.some(c => c.status === "unhealthy");
  const hasDegraded = checks.some(c => c.status === "degraded");
  const overallStatus = hasUnhealthy ? "unhealthy" : hasDegraded ? "degraded" : "healthy";

  const statusCode = overallStatus === "healthy" ? 200 : overallStatus === "degraded" ? 200 : 503;

  return new Response(JSON.stringify({
    success: true,
    data: {
      status: overallStatus,
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      checks,
      uptime: Deno.env.get("DENO_DEPLOYMENT_ID") || "development"
    }
  }), {
    status: statusCode,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
