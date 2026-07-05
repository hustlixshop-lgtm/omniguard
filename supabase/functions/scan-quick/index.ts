import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

/**
 * scan-quick: Fast file classification endpoint
 *
 * Used by:
 * - CLI pre-commit hook (batch of staged files)
 * - VS Code extension (quick classify on file open)
 *
 * Does NOT persist findings — returns inline results only.
 * For full persisted scans use api-v1-scans + scan-worker.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface IncomingFile {
  path: string;
  content: string; // plain text or base64
  base64?: boolean;
}

interface QuickFinding {
  scanner: string;
  rule_id: string;
  rule_name: string;
  severity: string;
  title: string;
  file_path: string;
  line_start: number;
  evidence: string;
  owasp: string[];
  cwe: string[];
}

interface QuickScanResponse {
  success: boolean;
  classification: "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence: number;
  findings: QuickFinding[];
  summary: { total: number; critical: number; high: number; medium: number; low: number; info: number };
  ai_classification?: string;
  duration_ms: number;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function verifyAuth(authHeader: string | null): Promise<{ valid: boolean; organizationId?: string }> {
  if (!authHeader?.startsWith("Bearer ")) return { valid: false };
  const token = authHeader.slice(7);

  // JWT
  if (token.includes(".") && token.split(".").length === 3) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return { valid: false };
      const { data: m } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      return { valid: true, organizationId: m?.organization_id };
    } catch {
      return { valid: false };
    }
  }

  // API key
  if (!token.startsWith("og_")) return { valid: false };
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  const keyHash = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const { data: apiKey } = await supabase
    .from("api_keys")
    .select("organization_id, expires_at")
    .eq("key_hash", keyHash)
    .eq("key_prefix", token.slice(0, 12))
    .eq("is_active", true)
    .maybeSingle();

  if (!apiKey) return { valid: false };
  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) return { valid: false };
  return { valid: true, organizationId: apiKey.organization_id };
}

// ─── Scanner patterns ─────────────────────────────────────────────────────────

const SECRET_PATTERNS: Array<{
  id: string;
  name: string;
  pattern: RegExp;
  severity: string;
  owasp: string[];
  cwe: string[];
}> = [
  { id: "SECRET-AWS-001", name: "AWS Access Key ID", pattern: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g, severity: "critical", owasp: ["A07:2021"], cwe: ["CWE-798"] },
  { id: "SECRET-GITHUB-001", name: "GitHub PAT", pattern: /ghp_[A-Za-z0-9]{36}/g, severity: "critical", owasp: ["A07:2021"], cwe: ["CWE-798"] },
  { id: "SECRET-GITHUB-002", name: "GitHub PAT (gho/ghu/ghs/ghr)", pattern: /gh[ouhsr]_[A-Za-z0-9]{36}/g, severity: "critical", owasp: ["A07:2021"], cwe: ["CWE-798"] },
  { id: "SECRET-OPENAI-001", name: "OpenAI API Key", pattern: /sk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}/g, severity: "critical", owasp: ["A07:2021"], cwe: ["CWE-798"] },
  { id: "SECRET-OPENAI-002", name: "OpenAI Project Key", pattern: /sk-proj-[A-Za-z0-9_-]{40,}/g, severity: "critical", owasp: ["A07:2021"], cwe: ["CWE-798"] },
  { id: "SECRET-ANTHROPIC-001", name: "Anthropic API Key", pattern: /sk-ant-[A-Za-z0-9\-_]{95,}/g, severity: "critical", owasp: ["A07:2021"], cwe: ["CWE-798"] },
  { id: "SECRET-STRIPE-001", name: "Stripe Secret Key", pattern: /sk_live_[0-9a-zA-Z]{24}/g, severity: "critical", owasp: ["A07:2021"], cwe: ["CWE-798"] },
  { id: "SECRET-SLACK-001", name: "Slack Token", pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}/g, severity: "high", owasp: ["A07:2021"], cwe: ["CWE-798"] },
  { id: "SECRET-SSH-001", name: "SSH Private Key", pattern: /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/g, severity: "critical", owasp: ["A07:2021"], cwe: ["CWE-798"] },
  { id: "SECRET-DB-001", name: "Database URL with credentials", pattern: /(postgres|postgresql|mysql|mongodb|redis):\/\/[^:\s]+:[^@\s]+@[^\s]+/gi, severity: "critical", owasp: ["A07:2021"], cwe: ["CWE-798"] },
  { id: "SECRET-JWT-001", name: "JWT Secret in code", pattern: /jwt[_\-]?secret["']?\s*[:=]\s*["']([A-Za-z0-9\-_!@#$%^&*]{20,})["']/gi, severity: "critical", owasp: ["A07:2021"], cwe: ["CWE-798"] },
  { id: "SECRET-PASSWORD-001", name: "Hardcoded Password", pattern: /(?:password|passwd|pwd)\s*[:=]\s*["']([^"'\s]{8,})["']/gi, severity: "high", owasp: ["A07:2021"], cwe: ["CWE-798"] },
  { id: "SECRET-GCP-001", name: "GCP Service Account Key", pattern: /"private_key":\s*"-----BEGIN (?:RSA )?PRIVATE KEY-----/g, severity: "critical", owasp: ["A07:2021"], cwe: ["CWE-798"] },
];

const SAST_PATTERNS: Array<{
  id: string;
  name: string;
  pattern: RegExp;
  severity: string;
  owasp: string[];
  cwe: string[];
  languages: string[];
}> = [
  { id: "SAST-SQL-001", name: "SQL Injection", pattern: /(?:execute|query|run)\s*\(\s*["'`][^"'`]*(?:SELECT|INSERT|UPDATE|DELETE)[^"'`]*"\s*\+/gi, severity: "critical", owasp: ["A03:2021"], cwe: ["CWE-89"], languages: ["js", "ts", "py", "java", "php", "rb"] },
  { id: "SAST-SQL-002", name: "SQL Injection (f-string)", pattern: /cursor\.execute\s*\(\s*f["'][^"']*\{/g, severity: "critical", owasp: ["A03:2021"], cwe: ["CWE-89"], languages: ["py"] },
  { id: "SAST-XSS-001", name: "Cross-Site Scripting (innerHTML)", pattern: /\.innerHTML\s*=\s*(?!["'`][^"'`]*["'`])/g, severity: "high", owasp: ["A03:2021"], cwe: ["CWE-79"], languages: ["js", "ts"] },
  { id: "SAST-XSS-002", name: "Cross-Site Scripting (dangerouslySetInnerHTML)", pattern: /dangerouslySetInnerHTML\s*=\s*\{/g, severity: "high", owasp: ["A03:2021"], cwe: ["CWE-79"], languages: ["jsx", "tsx"] },
  { id: "SAST-CMD-001", name: "Command Injection (eval)", pattern: /\beval\s*\([^)]*\+/g, severity: "critical", owasp: ["A03:2021"], cwe: ["CWE-78"], languages: ["js", "ts", "py", "php", "rb"] },
  { id: "SAST-CMD-002", name: "Command Injection (exec with concatenation)", pattern: /(?:child_process\.exec|os\.system|subprocess\.call)\s*\([^)]*\+/g, severity: "critical", owasp: ["A03:2021"], cwe: ["CWE-78"], languages: ["js", "ts", "py"] },
  { id: "SAST-PATH-001", name: "Path Traversal", pattern: /path\.(?:join|resolve)\s*\([^)]*req\./g, severity: "high", owasp: ["A01:2021"], cwe: ["CWE-22"], languages: ["js", "ts"] },
  { id: "SAST-SSRF-001", name: "Server-Side Request Forgery", pattern: /(?:fetch|axios\.get|axios\.post|requests\.get|requests\.post)\s*\([^)]*req\.(?:query|body|params)/g, severity: "critical", owasp: ["A10:2021"], cwe: ["CWE-918"], languages: ["js", "ts", "py"] },
  { id: "SAST-CRYPTO-001", name: "Weak Cryptography (MD5)", pattern: /(?:crypto\.createHash\s*\(\s*["']md5["']|hashlib\.md5\s*\()/gi, severity: "high", owasp: ["A02:2021"], cwe: ["CWE-328"], languages: ["js", "ts", "py"] },
  { id: "SAST-CRYPTO-002", name: "Weak Cryptography (SHA1)", pattern: /(?:crypto\.createHash\s*\(\s*["']sha1["']|hashlib\.sha1\s*\()/gi, severity: "medium", owasp: ["A02:2021"], cwe: ["CWE-328"], languages: ["js", "ts", "py"] },
  { id: "SAST-DESER-001", name: "Unsafe Deserialization (pickle)", pattern: /pickle\.loads?\s*\(/g, severity: "critical", owasp: ["A08:2021"], cwe: ["CWE-502"], languages: ["py"] },
  { id: "SAST-JWT-001", name: "JWT Algorithm None", pattern: /algorithm[s]?\s*[:=]\s*["']none["']/gi, severity: "critical", owasp: ["A07:2021"], cwe: ["CWE-287"], languages: ["js", "ts", "py", "java"] },
];

function getFileExtension(filePath: string): string {
  return filePath.split(".").pop()?.toLowerCase() || "";
}

function isBinary(content: string): boolean {
  return content.includes("\0") || (content.match(/[\x00-\x08\x0e-\x1f\x7f-\x9f]/g) || []).length / content.length > 0.1;
}

function maskSecret(value: string): string {
  if (value.length <= 8) return "*".repeat(value.length);
  return value.slice(0, 4) + "*".repeat(Math.max(value.length - 8, 4)) + value.slice(-4);
}

function scanFileContent(file: { path: string; content: string }): QuickFinding[] {
  if (isBinary(file.content)) return [];

  const findings: QuickFinding[] = [];
  const ext = getFileExtension(file.path);
  const lines = file.content.split("\n");

  // Run secret patterns on all file types
  for (const rule of SECRET_PATTERNS) {
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    const seen = new Set<number>();

    while ((match = rule.pattern.exec(file.content)) !== null) {
      const lineNum = file.content.substring(0, match.index).split("\n").length;
      if (seen.has(lineNum)) continue;
      seen.add(lineNum);

      const lineContent = lines[lineNum - 1]?.trim() || "";
      // Skip test files and comment lines
      if (/test|spec|mock|example|sample/i.test(file.path)) continue;
      if (/^\s*(\/\/|#|\*)/.test(lineContent)) continue;

      findings.push({
        scanner: "secret",
        rule_id: rule.id,
        rule_name: rule.name,
        severity: rule.severity,
        title: `${rule.name} detected`,
        file_path: file.path,
        line_start: lineNum,
        evidence: maskSecret(match[0]),
        owasp: rule.owasp,
        cwe: rule.cwe,
      });
    }
  }

  // Run SAST patterns based on file extension
  for (const rule of SAST_PATTERNS) {
    if (rule.languages.length > 0 && !rule.languages.includes(ext)) continue;

    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    const seen = new Set<number>();

    while ((match = rule.pattern.exec(file.content)) !== null) {
      const lineNum = file.content.substring(0, match.index).split("\n").length;
      if (seen.has(lineNum)) continue;
      seen.add(lineNum);

      const lineContent = lines[lineNum - 1]?.trim() || "";
      if (/^\s*(\/\/|#|\*)/.test(lineContent)) continue;

      findings.push({
        scanner: "sast",
        rule_id: rule.id,
        rule_name: rule.name,
        severity: rule.severity,
        title: `${rule.name} detected`,
        file_path: file.path,
        line_start: lineNum,
        evidence: match[0].substring(0, 120),
        owasp: rule.owasp,
        cwe: rule.cwe,
      });
    }
  }

  return findings;
}

async function classifyWithAI(findings: QuickFinding[]): Promise<{ classification: string; confidence: number } | null> {
  if (!anthropicApiKey || findings.length === 0) return null;

  const severe = findings.filter((f) => f.severity === "critical" || f.severity === "high");
  if (severe.length === 0) return { classification: "LOW", confidence: 0.9 };

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 100,
        messages: [
          {
            role: "user",
            content: `Security classifier. Rate risk: SAFE|LOW|MEDIUM|HIGH|CRITICAL.

Findings:
${severe.slice(0, 8).map((f) => `[${f.severity.toUpperCase()}] ${f.rule_name} in ${f.file_path}:${f.line_start}`).join("\n")}

JSON only: {"classification":"LEVEL","confidence":0.0-1.0}`,
          },
        ],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || "{}");
    return { classification: json.classification || "HIGH", confidence: json.confidence || 0.7 };
  } catch {
    return null;
  }
}

function computeClassification(findings: QuickFinding[]): "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (findings.length === 0) return "SAFE";
  if (findings.some((f) => f.severity === "critical")) return "CRITICAL";
  if (findings.some((f) => f.severity === "high")) return "HIGH";
  if (findings.some((f) => f.severity === "medium")) return "MEDIUM";
  return "LOW";
}

// ─── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const startTime = Date.now();
  const auth = await verifyAuth(req.headers.get("Authorization"));

  if (!auth.valid) {
    return new Response(JSON.stringify({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing authentication" } }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();

    // Accept both { files: [{path, content}] } and { file: {path, content} } (single file)
    let files: IncomingFile[] = [];
    if (Array.isArray(body.files)) {
      files = body.files;
    } else if (body.file) {
      files = [body.file];
    } else if (body.path && body.content !== undefined) {
      // Direct path/content shorthand
      files = [{ path: body.path, content: body.content }];
    }

    if (files.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: { code: "BAD_REQUEST", message: "Provide files array or file object" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Limit to 50 files per request
    files = files.slice(0, 50);

    // Decode base64 content where flagged
    const decodedFiles = files.map((f) => ({
      path: f.path,
      content: f.base64 ? new TextDecoder().decode(Uint8Array.from(atob(f.content), (c) => c.charCodeAt(0))) : f.content,
    }));

    // Run scanners
    const allFindings: QuickFinding[] = [];
    for (const file of decodedFiles) {
      if (!file.content || file.content.length > 2_000_000) continue; // skip empty / >2MB
      allFindings.push(...scanFileContent(file));
    }

    // AI classification (optional, async)
    let aiClassification: { classification: string; confidence: number } | null = null;
    if (body.ai !== false) {
      aiClassification = await classifyWithAI(allFindings);
    }

    const rulesClassification = computeClassification(allFindings);
    const finalClassification = (aiClassification?.classification as typeof rulesClassification) || rulesClassification;

    const summary = {
      total: allFindings.length,
      critical: allFindings.filter((f) => f.severity === "critical").length,
      high: allFindings.filter((f) => f.severity === "high").length,
      medium: allFindings.filter((f) => f.severity === "medium").length,
      low: allFindings.filter((f) => f.severity === "low").length,
      info: allFindings.filter((f) => f.severity === "info").length,
    };

    const response: QuickScanResponse = {
      success: true,
      classification: finalClassification,
      confidence: aiClassification?.confidence ?? 0.85,
      findings: allFindings,
      summary,
      ai_classification: aiClassification?.classification,
      duration_ms: Date.now() - startTime,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("scan-quick error:", error);
    return new Response(
      JSON.stringify({ success: false, error: { code: "INTERNAL_ERROR", message: error.message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
