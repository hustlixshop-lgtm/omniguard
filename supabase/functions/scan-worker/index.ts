import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const WORKER_ID = `worker-${Deno.env.get("DENO_DEPLOYMENT_ID") || crypto.randomUUID()}`;
const WORKER_TYPE = "scanner";
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

// Secret detection patterns
const SECRET_PATTERNS = [
  { id: "SECRET-AWS-001", name: "AWS Access Key ID", pattern: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g, severity: "critical" },
  { id: "SECRET-GITHUB-001", name: "GitHub Personal Access Token", pattern: /ghp_[A-Za-z0-9]{36}/g, severity: "critical" },
  { id: "SECRET-OPENAI-001", name: "OpenAI API Key", pattern: /sk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}/g, severity: "critical" },
  { id: "SECRET-ANTHROPIC-001", name: "Anthropic API Key", pattern: /sk-ant-[A-Za-z0-9\-_]{95,}/g, severity: "critical" },
  { id: "SECRET-SLACK-001", name: "Slack API Token", pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}/g, severity: "high" },
  { id: "SECRET-JWT-001", name: "JWT Secret", pattern: /jwt[_\-]?secret["']?\s*[:=]\s*["']([A-Za-z0-9\-_]{20,})["']/gi, severity: "critical" },
  { id: "SECRET-SSH-001", name: "SSH Private Key", pattern: /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/g, severity: "critical" },
  { id: "SECRET-DB-001", name: "Database Connection String", pattern: /(postgres|postgresql|mysql|mongodb|redis):\/\/[^:]+:[^@]+@[^\/]+/gi, severity: "critical" },
  { id: "SECRET-PASSWORD-001", name: "Hardcoded Password", pattern: /(?:password|passwd|pwd)["']?\s*[:=]\s*["']([^"'\s]{8,})["']/gi, severity: "high" },
];

// SAST patterns
const SAST_PATTERNS = [
  { id: "SAST-SQL-001", name: "SQL Injection", pattern: /execute\s*\(\s*['"`]\s*SELECT.+?\+\s*\w+/g, severity: "critical", owasp: ["A03:2021"], cwe: ["CWE-89"] },
  { id: "SAST-XSS-001", name: "Cross-Site Scripting", pattern: /innerHTML\s*=\s*[^`]*\+/g, severity: "high", owasp: ["A03:2021"], cwe: ["CWE-79"] },
  { id: "SAST-CMD-001", name: "Command Injection", pattern: /eval\s*\(\s*[^`]*\+\s*/g, severity: "critical", owasp: ["A03:2021"], cwe: ["CWE-78"] },
  { id: "SAST-PATH-001", name: "Path Traversal", pattern: /path\.join\s*\([^)]*req\./g, severity: "high", owasp: ["A01:2021"], cwe: ["CWE-22"] },
  { id: "SAST-SSRF-001", name: "Server-Side Request Forgery", pattern: /fetch\s*\([^)]*req\./g, severity: "critical", owasp: ["A10:2021"], cwe: ["CWE-918"] },
  { id: "SAST-CRYPTO-001", name: "Weak Cryptography", pattern: /(?:MD5|SHA1)\s*\(/g, severity: "high", owasp: ["A02:2021"], cwe: ["CWE-328"] },
];

interface ScanFile {
  path: string;
  content: string;
}

interface Finding {
  scanner: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  evidence: string;
  file_path: string;
  line_start: number;
  line_end: number;
  rule_id: string;
  rule_name: string;
  owasp: string[];
  cwe: string[];
  mitre: string[];
  risk_score: number;
  confidence_score: number;
}

async function sendHeartbeat(status: string, currentScanId?: string) {
  try {
    await supabase.from("worker_heartbeats").upsert({
      worker_id: WORKER_ID,
      worker_type: WORKER_TYPE,
      status,
      current_scan_id: currentScanId || null,
      last_heartbeat: new Date().toISOString()
    }, { onConflict: "worker_id" });
  } catch (error) {
    console.error("Heartbeat failed:", error);
  }
}

async function claimNextScan(): Promise<{ scanId: string; repositoryId: string; organizationId: string } | null> {
  try {
    const { data, error } = await supabase.rpc("claim_next_scan", { p_worker_id: WORKER_ID });

    if (error) {
      console.error("RPC error:", error);
      return null;
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      return null;
    }

    const row = Array.isArray(data) ? data[0] : data;
    return {
      scanId: row.scan_id,
      repositoryId: row.repository_id,
      organizationId: row.organization_id
    };
  } catch (err) {
    console.error("claimNextScan error:", err);
    return null;
  }
}

async function runScans(files: ScanFile[]): Promise<{ findings: Finding[]; summary: Record<string, number> }> {
  const findings: Finding[] = [];

  for (const file of files) {
    // Skip binary files
    if (file.content.includes("\0")) continue;

    const lines = file.content.split("\n");

    // Run secret detection
    for (const { id, name, pattern, severity } of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(file.content)) !== null) {
        const lineNumber = file.content.substring(0, match.index).split("\n").length;
        const masked = maskSecret(match[0]);

        findings.push({
          scanner: "secret",
          category: name,
          severity,
          title: `${name} detected`,
          description: `Potential ${name.toLowerCase()} found in code`,
          evidence: masked,
          file_path: file.path,
          line_start: lineNumber,
          line_end: lineNumber,
          rule_id: id,
          rule_name: name,
          owasp: ["A07:2021 - Identification and Authentication Failures"],
          cwe: ["CWE-798"],
          mitre: [],
          risk_score: severity === "critical" ? 100 : severity === "high" ? 70 : 40,
          confidence_score: 0.85
        });
      }
    }

    // Run SAST
    for (const { id, name, pattern, severity, owasp, cwe } of SAST_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(file.content)) !== null) {
        const lineNumber = file.content.substring(0, match.index).split("\n").length;

        findings.push({
          scanner: "sast",
          category: name,
          severity,
          title: `${name} vulnerability`,
          description: `Potential ${name.toLowerCase()} vulnerability detected`,
          evidence: match[0].substring(0, 100),
          file_path: file.path,
          line_start: lineNumber,
          line_end: lineNumber,
          rule_id: id,
          rule_name: name,
          owasp,
          cwe,
          mitre: [],
          risk_score: severity === "critical" ? 100 : severity === "high" ? 70 : 40,
          confidence_score: 0.8
        });
      }
    }
  }

  const summary = {
    total: findings.length,
    critical: findings.filter(f => f.severity === "critical").length,
    high: findings.filter(f => f.severity === "high").length,
    medium: findings.filter(f => f.severity === "medium").length,
    low: findings.filter(f => f.severity === "low").length,
    info: findings.filter(f => f.severity === "info").length
  };

  return { findings, summary };
}

async function classifyWithAI(findings: Finding[], files: ScanFile[]): Promise<{ classification: string; confidence: number } | null> {
  if (!anthropicApiKey) {
    return null;
  }

  try {
    const criticalAndHigh = findings.filter(f => f.severity === "critical" || f.severity === "high");
    if (criticalAndHigh.length === 0) {
      return { classification: "SAFE", confidence: 0.9 };
    }

    const prompt = `You are a security classifier. Analyze these findings and classify the overall security risk.

Critical/High findings:
${criticalAndHigh.slice(0, 10).map(f => `- [${f.severity.toUpperCase()}] ${f.title} (${f.file_path}:${f.line_start})`).join("\n")}

Respond with JSON: { "classification": "SAFE|LOW|MEDIUM|HIGH|CRITICAL", "confidence": 0.0-1.0 }

Only respond with the JSON.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 100,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || "{}");

    return {
      classification: json.classification || "LOW",
      confidence: json.confidence || 0.5
    };
  } catch (error) {
    console.error("AI classification failed:", error);
    return null;
  }
}

function maskSecret(value: string): string {
  if (value.length <= 8) return "*".repeat(value.length);
  return value.slice(0, 4) + "*".repeat(value.length - 8) + value.slice(-4);
}

async function processScanFiles(scanId: string, repositoryId: string): Promise<ScanFile[]> {
  // For MVP, we'll get files from the scan metadata
  // In production, this would clone/update the repo
  const { data: repository } = await supabase
    .from("repositories")
    .select("webhook_secret, last_sync_at")
    .eq("id", repositoryId)
    .single();

  // Get sample files from storage or webhook data
  // For now, return empty - actual implementation would fetch from git
  const { data: artifacts } = await supabase.storage
    .from("scan-artifacts")
    .list(`${scanId}/files`, { limit: 100 });

  const files: ScanFile[] = [];

  if (artifacts && artifacts.length > 0) {
    for (const artifact of artifacts.slice(0, 100)) {
      const { data: content } = await supabase.storage
        .from("scan-artifacts")
        .download(`${scanId}/files/${artifact.name}`);

      if (content) {
        files.push({
          path: artifact.name,
          content: await content.text()
        });
      }
    }
  }

  return files;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method === "GET") {
    // Health check / status endpoint
    const url = new URL(req.url);

    if (url.pathname.endsWith("/health")) {
      return new Response(JSON.stringify({
        worker_id: WORKER_ID,
        status: "healthy",
        timestamp: new Date().toISOString()
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (url.pathname.endsWith("/process")) {
      // Trigger scan processing
      const job = await claimNextScan();

      if (!job) {
        return new Response(JSON.stringify({ message: "No pending scans" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const startTime = Date.now();

      try {
        // Update scan status to running
        await supabase.from("scans").update({
          status: "running",
          started_at: new Date().toISOString(),
          worker_id: WORKER_ID
        }).eq("id", job.scanId);

        await sendHeartbeat("busy", job.scanId);

        // Get files to scan (mock for MVP - in production, fetch from repository)
        // For demo, scan provided files or create sample
        const { data: scanData } = await supabase
          .from("scans")
          .select("metadata")
          .eq("id", job.scanId)
          .single();

        let files: ScanFile[] = scanData?.metadata?.files || [];

        // If no files provided, get files from repository webhooks or create sample
        if (files.length === 0) {
          // Sample files for demo
          files = [
            { path: "config/database.py", content: 'import os\n\ndb_url = "postgres://admin:password123@db.example.com/app"' },
            { path: "src/api.js", content: 'app.get("/user", (req, res) => {\n  const query = "SELECT * FROM users WHERE id = " + req.query.id;\n  db.execute(query);\n});' },
            { path: ".env", content: "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nAWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" }
          ];
        }

        // Run scanners
        const { findings, summary } = await runScans(files);

        // AI classification
        let aiResult = null;
        if (findings.length > 0) {
          aiResult = await classifyWithAI(findings, files);
        }

        // Save findings to database
        if (findings.length > 0) {
          const insertData = findings.map(f => ({
            organization_id: job.organizationId,
            repository_id: job.repositoryId,
            scan_id: job.scanId,
            scanner: f.scanner,
            category: f.category,
            severity: f.severity,
            title: f.title,
            description: f.description,
            evidence: f.evidence,
            file_path: f.file_path,
            line_start: f.line_start,
            line_end: f.line_end,
            rule_id: f.rule_id,
            rule_name: f.rule_name,
            owasp: f.owasp,
            cwe: f.cwe,
            mitre: [],
            status: "open",
            risk_score: f.risk_score,
            confidence_score: f.confidence_score,
            ai_summary: aiResult ? `AI Classification: ${aiResult.classification} (${(aiResult.confidence * 100).toFixed(0)}%)` : null
          }));

          await supabase.from("findings").insert(insertData);
        }

        // Update scan as completed
        const duration = Math.round((Date.now() - startTime) / 1000);
        await supabase.from("scans").update({
          status: "completed",
          completed_at: new Date().toISOString(),
          duration_seconds: duration,
          summary: {
            files_scanned: files.length,
            ...summary,
            ai_classification: aiResult?.classification
          }
        }).eq("id", job.scanId);

        // Update repository risk score
        const avgRisk = findings.length > 0
          ? Math.round(findings.reduce((sum, f) => sum + f.risk_score, 0) / findings.length)
          : 0;
        await supabase.from("repositories").update({
          risk_score: avgRisk,
          last_scan_at: new Date().toISOString()
        }).eq("id", job.repositoryId);

        // Create audit log
        await supabase.from("audit_logs").insert({
          organization_id: job.organizationId,
          action: "scan_completed",
          resource_type: "scan",
          resource_id: job.scanId,
          resource_name: `${job.scanId}`,
          metadata: { findings: findings.length, duration_seconds: duration }
        });

        // Create notifications for critical findings
        const criticalFindings = findings.filter(f => f.severity === "critical");
        if (criticalFindings.length > 0) {
          const { data: members } = await supabase
            .from("organization_members")
            .select("user_id")
            .eq("organization_id", job.organizationId)
            .in("role", ["owner", "admin"]);

          if (members && members.length > 0) {
            const notifications = members.map(m => ({
              organization_id: job.organizationId,
              user_id: m.user_id,
              type: "critical_finding",
              title: `${criticalFindings.length} Critical Security Findings`,
              body: `OmniGuard found ${criticalFindings.length} critical vulnerabilities in your codebase.`,
              data: { scan_id: job.scanId, repository_id: job.repositoryId }
            }));

            await supabase.from("notifications").insert(notifications);
          }
        }

        await sendHeartbeat("idle");

        return new Response(JSON.stringify({
          success: true,
          scan_id: job.scanId,
          findings: findings.length,
          summary,
          ai_classification: aiResult?.classification,
          duration_seconds: duration
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

      } catch (error) {
        console.error("Scan processing failed:", error);

        await supabase.from("scans").update({
          status: "failed",
          error_message: error.message,
          completed_at: new Date().toISOString()
        }).eq("id", job.scanId);

        await sendHeartbeat("error");

        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
