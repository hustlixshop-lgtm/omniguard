import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

/**
 * OmniGuard Scan Worker — Multi-Layer AI Orchestrator
 *
 * Layer 1: Haiku/GPT-4o-mini — fast file triage (classify ALL findings, cheap)
 * Layer 2: Sonnet/GPT-4o     — deep analysis of critical/high (explain + remediate)
 * Layer 3: Opus/GPT-4o       — architecture review + executive summary (scan-level)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
const openaiKey = Deno.env.get("OPENAI_API_KEY");
const aiProvider = Deno.env.get("AI_PROVIDER") || "anthropic";

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const WORKER_ID = `worker-${Deno.env.get("DENO_DEPLOYMENT_ID") || crypto.randomUUID().slice(0, 8)}`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScanFile { path: string; content: string; size: number }

interface RawFinding {
  scanner: string; rule_id: string; rule_name: string; category: string
  severity: string; title: string; description: string; evidence: string
  file_path: string; line_start: number; line_end: number
  owasp: string[]; cwe: string[]; risk_score: number; confidence_score: number
  remediation?: string
}

// ─── Secret patterns ──────────────────────────────────────────────────────────

const SECRET_PATTERNS = [
  { id: "SECRET-AWS-001", name: "AWS Access Key ID", pattern: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g, severity: "critical", description: "AWS Access Key ID. Rotate immediately via AWS IAM." },
  { id: "SECRET-AWS-002", name: "AWS Secret Access Key", pattern: /(?:aws_secret|AWS_SECRET)[_\-]?(?:access_key|ACCESS_KEY)["']?\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi, severity: "critical", description: "AWS Secret Access Key. Rotate immediately." },
  { id: "SECRET-GITHUB-001", name: "GitHub Personal Access Token", pattern: /gh[pousr]_[A-Za-z0-9]{36}/g, severity: "critical", description: "GitHub PAT. Revoke at github.com/settings/tokens." },
  { id: "SECRET-OPENAI-001", name: "OpenAI API Key", pattern: /sk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}/g, severity: "critical", description: "OpenAI key. Rotate at platform.openai.com." },
  { id: "SECRET-OPENAI-002", name: "OpenAI Project Key", pattern: /sk-proj-[A-Za-z0-9_-]{40,}/g, severity: "critical", description: "OpenAI project key. Rotate immediately." },
  { id: "SECRET-ANTHROPIC-001", name: "Anthropic API Key", pattern: /sk-ant-[A-Za-z0-9\-_]{95,}/g, severity: "critical", description: "Anthropic key. Rotate at console.anthropic.com." },
  { id: "SECRET-STRIPE-001", name: "Stripe Live Secret Key", pattern: /sk_live_[0-9a-zA-Z]{24,}/g, severity: "critical", description: "Stripe live key. Rotate at dashboard.stripe.com." },
  { id: "SECRET-STRIPE-002", name: "Stripe Test Secret Key", pattern: /sk_test_[0-9a-zA-Z]{24,}/g, severity: "medium", description: "Stripe test key. Avoid committing test credentials." },
  { id: "SECRET-SLACK-001", name: "Slack Token", pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}/g, severity: "high", description: "Slack token. Revoke at api.slack.com." },
  { id: "SECRET-SSH-001", name: "SSH Private Key", pattern: /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/g, severity: "critical", description: "SSH private key. Remove and rotate." },
  { id: "SECRET-DB-001", name: "Database Connection String", pattern: /(postgres|postgresql|mysql|mongodb|redis):\/\/[^:\s]+:[^@\s]+@[^\s'"]{5,}/gi, severity: "critical", description: "Database credentials in source. Use env vars." },
  { id: "SECRET-JWT-001", name: "JWT Secret", pattern: /jwt[_\-]?secret["']?\s*[:=]\s*["']([A-Za-z0-9\-_!@#$%^&*]{20,})["']/gi, severity: "critical", description: "JWT signing secret. Rotate and use env vars." },
  { id: "SECRET-PASSWORD-001", name: "Hardcoded Password", pattern: /(?:^|[^a-z])(?:password|passwd|pwd)\s*[:=]\s*["']([^"'\s]{8,})["']/gim, severity: "high", description: "Hardcoded password. Use secrets manager." },
  { id: "SECRET-GCP-001", name: "GCP Service Account Key", pattern: /"private_key":\s*"-----BEGIN (?:RSA )?PRIVATE KEY-----/g, severity: "critical", description: "GCP service account key. Delete and recreate." },
  { id: "SECRET-NPM-001", name: "NPM Token", pattern: /\/\/registry\.npmjs\.org\/:_authToken=[A-Za-z0-9\-]{36}/g, severity: "high", description: "NPM auth token. Revoke at npmjs.com." },
  { id: "SECRET-DISCORD-001", name: "Discord Bot Token", pattern: /[MN][A-Za-z\d]{23}\.[\w-]{6}\.[\w-]{27}/g, severity: "high", description: "Discord bot token. Regenerate in Developer Portal." },
];

const SAST_PATTERNS = [
  { id: "SAST-SQL-001", name: "SQL Injection", pattern: /(?:execute|query|run)\s*\(\s*["'`][^"'`]*(?:SELECT|INSERT|UPDATE|DELETE|DROP)[^"'`]*["'`]\s*\+/gi, severity: "critical", cwe: ["CWE-89"], owasp: ["A03:2021"], description: "SQL query built by string concatenation. Use parameterized queries." },
  { id: "SAST-SQL-002", name: "SQL Injection (Python)", pattern: /(?:cursor\.execute|conn\.execute)\s*\(\s*f["'][^"']*\{/g, severity: "critical", cwe: ["CWE-89"], owasp: ["A03:2021"], description: "SQL f-string injection. Use cursor.execute(sql, params)." },
  { id: "SAST-XSS-001", name: "XSS (innerHTML)", pattern: /\.innerHTML\s*[+]?=\s*(?:[^"'`;\n]{1,60}(?:req\.|request\.|params\.|query\.|body\.|user\.|input|$\{))/gm, severity: "high", cwe: ["CWE-79"], owasp: ["A03:2021"], description: "innerHTML with dynamic data enables XSS. Use textContent or DOMPurify." },
  { id: "SAST-XSS-002", name: "XSS (document.write)", pattern: /document\.write\s*\([^)]*(?:\+|\${)/g, severity: "high", cwe: ["CWE-79"], owasp: ["A03:2021"], description: "document.write with dynamic data. Use DOM manipulation." },
  { id: "SAST-CMD-001", name: "Command Injection (eval)", pattern: /\beval\s*\([^)]*(?:req\.|request\.|params\.|query\.|body\.|\$_(?:GET|POST|REQUEST)|input)/gi, severity: "critical", cwe: ["CWE-78"], owasp: ["A03:2021"], description: "eval() with user input allows RCE." },
  { id: "SAST-CMD-002", name: "Command Injection (exec)", pattern: /(?:child_process\.exec|execSync|os\.system|subprocess\.(?:call|run|Popen))\s*\([^)]*(?:req\.|request\.|params\.|query\.|body\.)/gi, severity: "critical", cwe: ["CWE-78"], owasp: ["A03:2021"], description: "Shell command with user input allows RCE." },
  { id: "SAST-SSRF-001", name: "SSRF", pattern: /(?:fetch|axios\.(?:get|post|put|request)|requests\.(?:get|post)|http\.get)\s*\([^)]*(?:req\.|request\.|params\.|query\.|body\.)/gi, severity: "critical", cwe: ["CWE-918"], owasp: ["A10:2021"], description: "HTTP request to user-controlled URL. Validate against allowlist." },
  { id: "SAST-PATH-001", name: "Path Traversal", pattern: /(?:path\.(?:join|resolve)|open|fs\.(?:read|write)File)\s*\([^)]*(?:req\.|request\.|params\.|query\.|body\.)/gi, severity: "high", cwe: ["CWE-22"], owasp: ["A01:2021"], description: "File path from user input. Canonicalize and validate." },
  { id: "SAST-CRYPTO-001", name: "Weak Hash (MD5)", pattern: /(?:crypto\.createHash\s*\(\s*["']md5["']|hashlib\.md5\s*\(|MessageDigest\.getInstance\s*\(\s*["']MD5["'])/gi, severity: "high", cwe: ["CWE-328"], owasp: ["A02:2021"], description: "MD5 is broken. Use SHA-256 or bcrypt for passwords." },
  { id: "SAST-CRYPTO-002", name: "Weak Hash (SHA-1)", pattern: /(?:crypto\.createHash\s*\(\s*["']sha1["']|hashlib\.sha1\s*\()/gi, severity: "medium", cwe: ["CWE-328"], owasp: ["A02:2021"], description: "SHA-1 is deprecated. Use SHA-256." },
  { id: "SAST-DESER-001", name: "Unsafe Deserialization", pattern: /pickle\.loads?\s*\(/g, severity: "critical", cwe: ["CWE-502"], owasp: ["A08:2021"], description: "pickle.load() with untrusted data allows arbitrary code execution." },
  { id: "SAST-JWT-001", name: "JWT Algorithm None", pattern: /algorithm[s]?\s*[:=]\s*["']none["']/gi, severity: "critical", cwe: ["CWE-287"], owasp: ["A07:2021"], description: "JWT 'none' algorithm allows signature bypass." },
  { id: "SAST-REDIRECT-001", name: "Open Redirect", pattern: /(?:res\.redirect|response\.redirect)\s*\([^)]*(?:req\.|request\.|params\.|query\.|body\.)/gi, severity: "medium", cwe: ["CWE-601"], owasp: ["A01:2021"], description: "Redirect to user-controlled URL. Validate against allowlist." },
];

// ─── IaC patterns ──────────────────────────────────────────────────────────────

const IAC_PATTERNS = [
  { id: "IAC-S3-001", name: "S3 Bucket Public ACL", pattern: /acl\s*=\s*["']public-read(?:-write)?["']/gi, severity: "critical", description: "S3 bucket allows public access." },
  { id: "IAC-SG-001", name: "Security Group Open to World", pattern: /ingress\s*\{[^}]*cidr_blocks\s*=\s*\["0\.0\.0\.0\/0"\]/gs, severity: "high", description: "Security group allows unrestricted inbound." },
  { id: "IAC-RDS-001", name: "RDS Publicly Accessible", pattern: /publicly_accessible\s*=\s*true/gi, severity: "critical", description: "RDS instance is publicly accessible." },
  { id: "IAC-ENC-001", name: "Unencrypted Storage", pattern: /encrypted\s*=\s*false/gi, severity: "high", description: "Storage encryption is disabled." },
  { id: "IAC-DOCKER-ROOT", name: "Dockerfile Root User", pattern: /^USER\s+root\s*$/mi, severity: "high", description: "Container runs as root. Add non-root USER." },
  { id: "IAC-DOCKER-LATEST", name: "Dockerfile :latest Tag", pattern: /^FROM\s+\S+:latest/mi, severity: "medium", description: "Using :latest. Pin to specific version." },
  { id: "IAC-DOCKER-SECRET", name: "Secret in Dockerfile ENV", pattern: /^ENV\s+\w*(?:SECRET|PASSWORD|TOKEN|KEY|PASS)\w*\s+\S+/mi, severity: "critical", description: "Secret baked into Docker image." },
  { id: "IAC-K8S-PRIV", name: "Privileged K8s Container", pattern: /privileged:\s*true/gi, severity: "critical", description: "Pod runs in privileged mode." },
  { id: "IAC-K8S-HOSTNET", name: "K8s Host Network", pattern: /hostNetwork:\s*true/gi, severity: "high", description: "Pod uses host network namespace." },
  { id: "IAC-SSL-001", name: "SSL Enforcement Disabled", pattern: /ssl_enforcement_enabled\s*=\s*false/gi, severity: "high", description: "SSL is disabled on database." },
];

// ─── Utility ──────────────────────────────────────────────────────────────────

function maskSecret(v: string): string {
  if (v.length <= 8) return "*".repeat(v.length);
  return v.slice(0, 4) + "*".repeat(Math.max(v.length - 8, 4)) + v.slice(-4);
}

function isBinary(c: string): boolean {
  return c.includes("\0") || (c.match(/[\x00-\x08\x0e-\x1f\x7f]/g) || []).length / Math.max(c.length, 1) > 0.05;
}

const SCANNABLE_EXT = new Set(["js","jsx","ts","tsx","py","java","go","rb","php","cs","rs","c","cpp","tf","hcl","yaml","yml","json","toml","ini","env","sh","bash","sql","graphql","md","txt"]);
const SKIP_PATHS = ["node_modules/",".git/","dist/","build/","__pycache__/",".venv/","vendor/","coverage/",".next/","out/","target/"];

function shouldScan(path: string, size: number): boolean {
  if (size > 500_000) return false;
  const lower = path.toLowerCase();
  if (SKIP_PATHS.some(p => lower.includes(p))) return false;
  if (/\.env(\.|$)|secrets?(\.|$)|credentials?(\.|$)/i.test(lower)) return true;
  return SCANNABLE_EXT.has(lower.split(".").pop() || "");
}

// ─── Layer 1: Fast regex scanners (all findings) ──────────────────────────────

function runSecretScanner(files: ScanFile[]): RawFinding[] {
  const findings: RawFinding[] = [];
  for (const file of files) {
    if (isBinary(file.content)) continue;
    for (const rule of SECRET_PATTERNS) {
      rule.pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      const seen = new Set<number>();
      while ((m = rule.pattern.exec(file.content)) !== null) {
        const line = file.content.substring(0, m.index).split("\n").length;
        if (seen.has(line)) continue; seen.add(line);
        const lineText = file.content.split("\n")[line - 1]?.trim() || "";
        if (/^\s*(\/\/|#|\*)/.test(lineText)) continue;
        if (/(?:test|example|sample|demo|placeholder|changeme|your[-_]|xxx)/i.test(m[0])) continue;
        findings.push({
          scanner: "secret", rule_id: rule.id, rule_name: rule.name, category: "Exposed Secret",
          severity: rule.severity, title: `${rule.name} detected`, description: rule.description,
          evidence: maskSecret(m[0]), file_path: file.path, line_start: line, line_end: line,
          owasp: ["A07:2021 - Identification and Authentication Failures"], cwe: ["CWE-798"],
          risk_score: rule.severity === "critical" ? 95 : rule.severity === "high" ? 70 : 45,
          confidence_score: 0.88, remediation: "Remove from code. Use environment variables or secrets manager. Rotate the compromised credential immediately.",
        });
      }
    }
  }
  return findings;
}

function runSASTScanner(files: ScanFile[]): RawFinding[] {
  const findings: RawFinding[] = [];
  for (const file of files) {
    if (isBinary(file.content)) continue;
    for (const rule of SAST_PATTERNS) {
      rule.pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      const seen = new Set<number>();
      while ((m = rule.pattern.exec(file.content)) !== null) {
        const line = file.content.substring(0, m.index).split("\n").length;
        if (seen.has(line)) continue; seen.add(line);
        const lineText = file.content.split("\n")[line - 1]?.trim() || "";
        if (/^\s*(\/\/|#|\*)/.test(lineText)) continue;
        findings.push({
          scanner: "sast", rule_id: rule.id, rule_name: rule.name, category: rule.name,
          severity: rule.severity, title: `${rule.name} detected`, description: rule.description,
          evidence: m[0].substring(0, 200), file_path: file.path, line_start: line, line_end: line,
          owasp: rule.owasp, cwe: rule.cwe,
          risk_score: rule.severity === "critical" ? 90 : rule.severity === "high" ? 65 : 40,
          confidence_score: 0.80,
        });
      }
    }
  }
  return findings;
}

function runIaCScanner(files: ScanFile[]): RawFinding[] {
  const findings: RawFinding[] = [];
  const iacFiles = files.filter(f => {
    const l = f.path.toLowerCase();
    return l.endsWith(".tf") || l.endsWith(".hcl") || /dockerfile/i.test(l) ||
      l.includes("docker-compose") || l.includes("cloudformation") || l.includes("kubernetes") || l.includes("/k8s/");
  });
  for (const file of iacFiles) {
    for (const rule of IAC_PATTERNS) {
      rule.pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      const seen = new Set<number>();
      while ((m = rule.pattern.exec(file.content)) !== null) {
        const line = file.content.substring(0, m.index).split("\n").length;
        if (seen.has(line)) continue; seen.add(line);
        findings.push({
          scanner: "iac", rule_id: rule.id, rule_name: rule.name, category: "Infrastructure Misconfiguration",
          severity: rule.severity, title: rule.name, description: rule.description,
          evidence: m[0].substring(0, 150), file_path: file.path, line_start: line, line_end: line,
          owasp: ["A05:2021 - Security Misconfiguration"], cwe: ["CWE-16"],
          risk_score: rule.severity === "critical" ? 85 : rule.severity === "high" ? 60 : 35,
          confidence_score: 0.92,
        });
      }
    }
  }
  return findings;
}

async function runDependencyScanner(files: ScanFile[]): Promise<RawFinding[]> {
  const findings: RawFinding[] = [];
  for (const file of files) {
    const lower = file.path.toLowerCase();
    if (!lower.endsWith("package.json") && !lower.endsWith("requirements.txt") &&
        !lower.endsWith("go.mod") && !lower.endsWith("cargo.toml")) continue;
    if (lower.includes("node_modules/")) continue;

    const deps: Array<{ name: string; version: string; ecosystem: string }> = [];
    if (lower.endsWith("package.json")) {
      try {
        const pkg = JSON.parse(file.content);
        const all = { ...pkg.dependencies, ...pkg.devDependencies };
        for (const [name, ver] of Object.entries(all)) {
          deps.push({ name, version: String(ver).replace(/[^0-9.]/g, ""), ecosystem: "npm" });
        }
      } catch { continue; }
    } else if (lower.endsWith("requirements.txt")) {
      for (const line of file.content.split("\n")) {
        const m = /^([A-Za-z0-9_.-]+)/.exec(line.trim());
        if (m) deps.push({ name: m[1], version: "*", ecosystem: "pypi" });
      }
    }

    for (let i = 0; i < Math.min(deps.length, 60); i += 20) {
      const batch = deps.slice(i, i + 20).filter(d => d.version && d.version !== "*");
      if (!batch.length) continue;
      try {
        const res = await fetch("https://api.osv.dev/v1/querybatch", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queries: batch.map(d => ({ package: { name: d.name, ecosystem: d.ecosystem === "npm" ? "npm" : "PyPI" }, version: d.version })) }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) continue;
        const data = await res.json();
        for (let j = 0; j < (data.results || []).length; j++) {
          const result = data.results[j]; const dep = batch[j];
          for (const vuln of (result?.vulns || []).slice(0, 3)) {
            const cvss = vuln.severity?.find((s: {score: number}) => s.score)?.score;
            const sev = cvss ? (cvss >= 9 ? "critical" : cvss >= 7 ? "high" : cvss >= 4 ? "medium" : "low") : "medium";
            findings.push({
              scanner: "dependency", rule_id: vuln.id || "DEP-001", rule_name: vuln.id || "Known Vulnerability",
              category: "Vulnerable Dependency", severity: sev,
              title: `${dep.name} - ${vuln.id || "Known Vulnerability"}`,
              description: vuln.summary || vuln.details?.slice(0, 300) || "Known vulnerability.",
              evidence: `${dep.name}@${dep.version}`, file_path: file.path, line_start: 1, line_end: 1,
              owasp: ["A06:2021 - Vulnerable and Outdated Components"], cwe: ["CWE-1035"],
              risk_score: cvss ? Math.round(cvss * 10) : 50, confidence_score: 0.95,
              remediation: `Update ${dep.name} to latest patched version.`,
            });
          }
        }
      } catch { continue; }
    }
  }
  return findings;
}

// ─── Layer 1 AI: Fast triage (Haiku / GPT-4o-mini) ────────────────────────────

async function layer1Classify(findings: RawFinding[]): Promise<Array<{ id: string; falsePositive: boolean; confidence: number; reason: string }>> {
  if (!anthropicKey && !openaiKey) return [];
  const critical = findings.filter(f => f.severity === "critical" || f.severity === "high");
  if (!critical.length) return [];

  const prompt = `You are a security triage bot. Classify each finding as true positive or false positive based on context.

Findings:
${critical.slice(0, 15).map((f, i) => `${i}. [${f.severity.toUpperCase()}] ${f.rule_name} in ${f.file_path}:${f.line_start}
   Evidence: ${f.evidence}
   Context: ${f.description}`).join("\n\n")}

Respond with JSON array only:
[{"index":0,"falsePositive":false,"confidence":0.9,"reason":"Real AWS key pattern"}]`;

  try {
    let text = "";
    if (aiProvider === "anthropic" && anthropicKey) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-3-5-haiku-20241022", max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
        signal: AbortSignal.timeout(15_000),
      });
      if (r.ok) text = (await r.json()).content?.[0]?.text || "";
    } else if (openaiKey) {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
        body: JSON.stringify({ model: "gpt-4o-mini", max_tokens: 500, response_format: { type: "json_object" },
          messages: [{ role: "system", content: "Security triage. Return JSON array only." }, { role: "user", content: prompt }] }),
        signal: AbortSignal.timeout(15_000),
      });
      if (r.ok) text = (await r.json()).choices?.[0]?.message?.content || "";
    }
    if (!text) return [];
    const arr = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] || "[]");
    return arr.map((item: { index: number; falsePositive: boolean; confidence: number; reason: string }) => ({
      id: `${item.index}`, // mapped back to finding by index
      falsePositive: item.falsePositive || false,
      confidence: item.confidence || 0.7,
      reason: item.reason || "",
    }));
  } catch { return []; }
}

// ─── Layer 2 AI: Deep analysis (Sonnet / GPT-4o) ──────────────────────────────

async function layer2Analyze(finding: RawFinding, fileContent: string): Promise<{ explanation: string; remediation: string; confidence: number }> {
  if (!anthropicKey && !openaiKey) return { explanation: finding.description, remediation: finding.remediation || "", confidence: 0.5 };

  const lines = fileContent.split("\n");
  const contextLines = lines.slice(Math.max(0, finding.line_start - 5), Math.min(lines.length, finding.line_start + 10)).join("\n");

  const prompt = `Security engineer reviewing a ${finding.severity} vulnerability.

Finding: ${finding.title}
Rule: ${finding.rule_id} - ${finding.rule_name}
Location: ${finding.file_path}:${finding.line_start}
OWASP: ${finding.owasp.join(", ")}
CWE: ${finding.cwe.join(", ")}
Evidence: ${finding.evidence}

Code context:
\`\`\`
${contextLines}
\`\`\`

Provide:
1. Why this is dangerous (2-3 sentences)
2. Concrete fix with code example
3. How to test the fix

Be specific to the actual code shown. Maximum 400 words.`;

  try {
    let text = "";
    if (aiProvider === "anthropic" && anthropicKey) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-3-5-sonnet-20241022", max_tokens: 800, messages: [{ role: "user", content: prompt }] }),
        signal: AbortSignal.timeout(25_000),
      });
      if (r.ok) text = (await r.json()).content?.[0]?.text || "";
    } else if (openaiKey) {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
        body: JSON.stringify({ model: "gpt-4o", max_tokens: 800,
          messages: [{ role: "system", content: "Security engineer providing specific remediation." }, { role: "user", content: prompt }] }),
        signal: AbortSignal.timeout(25_000),
      });
      if (r.ok) text = (await r.json()).choices?.[0]?.message?.content || "";
    }
    return { explanation: text.split("\n\n")[0] || finding.description, remediation: text, confidence: 0.85 };
  } catch { return { explanation: finding.description, remediation: finding.remediation || "", confidence: 0.5 }; }
}

// ─── Layer 3 AI: Executive summary (Opus / GPT-4o) ────────────────────────────

async function layer3Summarize(allFindings: RawFinding[], repoName: string): Promise<string> {
  if (!anthropicKey && !openaiKey) return "";
  if (allFindings.length === 0) return "";

  const critCount = allFindings.filter(f => f.severity === "critical").length;
  const highCount = allFindings.filter(f => f.severity === "high").length;
  const scanners = [...new Set(allFindings.map(f => f.scanner))];

  const prompt = `CISO-level security summary for ${repoName}.

Scan results: ${allFindings.length} total findings
- ${critCount} Critical · ${highCount} High · ${allFindings.filter(f => f.severity === "medium").length} Medium · ${allFindings.filter(f => f.severity === "low").length} Low
- Scanners run: ${scanners.join(", ")}

Top 10 critical/high findings:
${allFindings.filter(f => f.severity === "critical" || f.severity === "high").slice(0, 10).map(f => `• [${f.severity.toUpperCase()}] ${f.title} — ${f.file_path}:${f.line_start}`).join("\n")}

Write a 3-paragraph executive summary covering:
1. Overall risk posture
2. Most critical issues and business impact  
3. Immediate recommended actions

Plain text only, no headers.`;

  try {
    if (aiProvider === "anthropic" && anthropicKey) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-opus-4-5", max_tokens: 600, messages: [{ role: "user", content: prompt }] }),
        signal: AbortSignal.timeout(30_000),
      });
      if (r.ok) return (await r.json()).content?.[0]?.text || "";
    } else if (openaiKey) {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
        body: JSON.stringify({ model: "gpt-4o", max_tokens: 600,
          messages: [{ role: "system", content: "CISO writing executive security summaries." }, { role: "user", content: prompt }] }),
        signal: AbortSignal.timeout(30_000),
      });
      if (r.ok) return (await r.json()).choices?.[0]?.message?.content || "";
    }
  } catch { /* non-fatal */ }
  return "";
}

// ─── GitHub file fetcher ──────────────────────────────────────────────────────

async function fetchFilesFromGitHub(
  fullName: string, branch: string, commitSha: string | null,
  token: string, changedFiles?: string[]
): Promise<ScanFile[]> {
  const headers = { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json", "User-Agent": "OmniGuard/1.0" };
  const ref = commitSha || branch;
  const files: ScanFile[] = [];

  if (changedFiles?.length) {
    const toFetch = changedFiles.filter(f => shouldScan(f, 0)).slice(0, 100);
    for (const fp of toFetch) {
      try {
        const r = await fetch(`https://api.github.com/repos/${fullName}/contents/${fp}?ref=${ref}`, { headers, signal: AbortSignal.timeout(10_000) });
        if (!r.ok) continue;
        const d = await r.json();
        if (d.encoding === "base64" && d.content) {
          const content = atob(d.content.replace(/\n/g, ""));
          if (shouldScan(fp, content.length)) files.push({ path: fp, content, size: content.length });
        }
      } catch { continue; }
    }
    return files;
  }

  try {
    const treeRes = await fetch(`https://api.github.com/repos/${fullName}/git/trees/${ref}?recursive=1`, { headers, signal: AbortSignal.timeout(15_000) });
    if (!treeRes.ok) return files;
    const tree = await treeRes.json();
    const candidates = (tree.tree || []).filter((i: {type: string; path: string; size: number}) =>
      i.type === "blob" && shouldScan(i.path, i.size)
    ).slice(0, 200);

    for (let i = 0; i < candidates.length; i += 10) {
      const batch = candidates.slice(i, i + 10);
      const results = await Promise.allSettled(batch.map(async (item: {path: string; sha: string}) => {
        const r = await fetch(`https://api.github.com/repos/${fullName}/git/blobs/${item.sha}`, { headers, signal: AbortSignal.timeout(8_000) });
        if (!r.ok) return null;
        const d = await r.json();
        if (d.encoding === "base64") return { path: item.path, content: atob(d.content.replace(/\n/g, "")), size: d.size || 0 };
        return null;
      }));
      for (const r of results) if (r.status === "fulfilled" && r.value) files.push(r.value);
    }
  } catch (e) { console.error("GitHub tree fetch failed:", e); }
  return files;
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────

async function heartbeat(status: string, scanId?: string) {
  try {
    await supabase.from("worker_heartbeats").upsert({
      worker_id: WORKER_ID, worker_type: "scanner", status,
      current_scan_id: scanId || null, last_heartbeat: new Date().toISOString(),
      metadata: { version: "1.0.0", ai_provider: aiProvider },
    }, { onConflict: "worker_id" });
  } catch { /* non-fatal */ }
}

// ─── Main scan orchestration ──────────────────────────────────────────────────

async function processScan(scanId: string, repositoryId: string, organizationId: string): Promise<void> {
  const t0 = Date.now();
  await supabase.from("scans").update({ status: "running", started_at: new Date().toISOString(), worker_id: WORKER_ID }).eq("id", scanId);
  await heartbeat("busy", scanId);

  try {
    const { data: scan } = await supabase.from("scans").select("branch, commit_sha, metadata").eq("id", scanId).single();
    const { data: repo } = await supabase.from("repositories").select("id, owner, name, full_name, default_branch, provider").eq("id", repositoryId).single();
    if (!repo) throw new Error("Repository not found");

    let files: ScanFile[] = [];

    if (repo.provider === "github") {
      const { data: integration } = await supabase.from("integrations").select("config").eq("organization_id", organizationId).eq("provider", "github").eq("status", "active").maybeSingle();
      const token = (integration?.config as Record<string, string>)?.access_token || Deno.env.get("GITHUB_TOKEN");
      if (token) {
        const changedFiles = (scan?.metadata as Record<string, unknown>)?.changed_files as string[] | undefined;
        files = await fetchFilesFromGitHub(repo.full_name, scan?.branch || repo.default_branch, scan?.commit_sha || null, token, changedFiles);
        console.log(`[scan-worker] Fetched ${files.length} files from ${repo.full_name}`);
      }
    }

    if (!files.length) {
      const { data: artifacts } = await supabase.storage.from("scan-artifacts").list(`${scanId}/files`, { limit: 200 });
      if (artifacts?.length) {
        for (const a of artifacts.slice(0, 150)) {
          const { data: blob } = await supabase.storage.from("scan-artifacts").download(`${scanId}/files/${a.name}`);
          if (blob) { const c = await blob.text(); files.push({ path: a.name, content: c, size: c.length }); }
        }
      }
    }

    if (!files.length) {
      await supabase.from("scans").update({ status: "completed", completed_at: new Date().toISOString(), duration_seconds: Math.round((Date.now()-t0)/1000),
        summary: { files_scanned: 0, total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0, note: "No files available. Configure GitHub integration with a PAT." } }).eq("id", scanId);
      await heartbeat("idle"); return;
    }

    // ── Layer 1: Run all regex scanners in parallel ────────────────────────
    const [secretFindings, sastFindings, iacFindings, depFindings] = await Promise.all([
      Promise.resolve(runSecretScanner(files)),
      Promise.resolve(runSASTScanner(files)),
      Promise.resolve(runIaCScanner(files)),
      runDependencyScanner(files),
    ]);
    const allRaw = [...secretFindings, ...sastFindings, ...iacFindings, ...depFindings];
    console.log(`[scan-worker] Layer 1 complete: ${allRaw.length} raw findings`);

    // ── Layer 1 AI: Haiku triage — filter false positives ─────────────────
    const triageResults = await layer1Classify(allRaw);
    const fpIndices = new Set(triageResults.filter(r => r.falsePositive).map(r => parseInt(r.id)));
    const verified = allRaw.map((f, i) => ({ ...f, is_fp: fpIndices.has(i) })).filter(f => !f.is_fp);
    console.log(`[scan-worker] Layer 1 AI: ${allRaw.length - verified.length} false positives removed, ${verified.length} real findings`);

    // Build file content map for Layer 2 context
    const fileMap = new Map(files.map(f => [f.path, f.content]));

    // ── Layer 2 AI: Sonnet deep analysis for critical/high ────────────────
    const criticalHigh = verified.filter(f => f.severity === "critical" || f.severity === "high").slice(0, 10);
    const layer2Results = new Map<string, { explanation: string; remediation: string }>();

    if (criticalHigh.length > 0) {
      for (const finding of criticalHigh) {
        const fileContent = fileMap.get(finding.file_path) || "";
        const analysis = await layer2Analyze(finding, fileContent);
        const key = `${finding.rule_id}:${finding.file_path}:${finding.line_start}`;
        layer2Results.set(key, analysis);
      }
      console.log(`[scan-worker] Layer 2 AI: analyzed ${criticalHigh.length} critical/high findings`);
    }

    // ── Layer 3 AI: Opus executive summary for the whole scan ─────────────
    const executiveSummary = await layer3Summarize(verified, repo.full_name);
    if (executiveSummary) console.log("[scan-worker] Layer 3 AI: executive summary generated");

    // ── Persist findings ──────────────────────────────────────────────────
    if (verified.length > 0) {
      const rows = verified.map(f => {
        const key = `${f.rule_id}:${f.file_path}:${f.line_start}`;
        const l2 = layer2Results.get(key);
        return {
          organization_id: organizationId, repository_id: repositoryId, scan_id: scanId,
          scanner: f.scanner, category: f.category, severity: f.severity,
          title: f.title, description: f.description, evidence: f.evidence,
          file_path: f.file_path, line_start: f.line_start, line_end: f.line_end,
          rule_id: f.rule_id, rule_name: f.rule_name, owasp: f.owasp, cwe: f.cwe, mitre: [],
          status: "open", risk_score: f.risk_score, confidence_score: f.confidence_score,
          remediation: f.remediation || null,
          ai_summary: l2?.explanation || null,
          ai_remediation: l2?.remediation || null,
        };
      });
      for (let i = 0; i < rows.length; i += 50) await supabase.from("findings").insert(rows.slice(i, i+50));
    }

    // ── Update scan record with summary + executive summary ───────────────
    const dur = Math.round((Date.now()-t0)/1000);
    const summary = {
      files_scanned: files.length,
      total: verified.length,
      critical: verified.filter(f => f.severity === "critical").length,
      high: verified.filter(f => f.severity === "high").length,
      medium: verified.filter(f => f.severity === "medium").length,
      low: verified.filter(f => f.severity === "low").length,
      info: verified.filter(f => f.severity === "info").length,
      false_positives_removed: allRaw.length - verified.length,
      ai_layer1_used: triageResults.length > 0,
      ai_layer2_used: layer2Results.size > 0,
      ai_layer3_used: !!executiveSummary,
      executive_summary: executiveSummary || undefined,
    };
    await supabase.from("scans").update({ status: "completed", completed_at: new Date().toISOString(), duration_seconds: dur, summary }).eq("id", scanId);

    // ── Update repo risk score ────────────────────────────────────────────
    const avgRisk = verified.length > 0 ? Math.min(100, Math.round(verified.reduce((s, f) => s+f.risk_score, 0) / verified.length)) : 0;
    await supabase.from("repositories").update({ risk_score: avgRisk, last_scan_at: new Date().toISOString() }).eq("id", repositoryId);
    await supabase.from("audit_logs").insert({ organization_id: organizationId, action: "scan_completed", resource_type: "scan", resource_id: scanId,
      metadata: { findings: verified.length, duration_seconds: dur, files_scanned: files.length, ai_layers_used: [triageResults.length > 0, layer2Results.size > 0, !!executiveSummary] } });

    // ── Notify admins of critical findings ────────────────────────────────
    if (summary.critical > 0) {
      const { data: admins } = await supabase.from("organization_members").select("user_id").eq("organization_id", organizationId).in("role", ["owner", "admin"]);
      if (admins?.length) {
        await supabase.from("notifications").insert(admins.map(a => ({
          organization_id: organizationId, user_id: a.user_id, type: "critical_finding",
          title: `${summary.critical} Critical Finding${summary.critical>1?"s":""} in ${repo.full_name}`,
          body: `OmniGuard found ${summary.critical} critical vulnerability${summary.critical>1?"ies":"y"} in ${repo.full_name}. ${executiveSummary ? executiveSummary.split(". ")[0] + "." : "Immediate attention required."}`,
          data: { scan_id: scanId, repository_id: repositoryId, critical_count: summary.critical },
        })));
      }
    }

    await heartbeat("idle");
  } catch (err) {
    console.error(`[scan-worker] Scan ${scanId} failed:`, err);
    await supabase.from("scans").update({ status: "failed", error_message: err instanceof Error ? err.message : String(err), completed_at: new Date().toISOString(), duration_seconds: Math.round((Date.now()-t0)/1000) }).eq("id", scanId);
    await heartbeat("error");
    throw err;
  }
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname.endsWith("/health")) {
    return new Response(JSON.stringify({ worker_id: WORKER_ID, status: "healthy", ai_provider: aiProvider, anthropic_configured: !!anthropicKey, openai_configured: !!openaiKey, timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (req.method === "GET" && url.pathname.endsWith("/process")) {
    const { data, error } = await supabase.rpc("claim_next_scan", { p_worker_id: WORKER_ID });
    if (error) return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const job = Array.isArray(data) ? data[0] : data;
    if (!job?.scan_id) return new Response(JSON.stringify({ success: true, message: "No pending scans" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    await processScan(job.scan_id, job.repository_id, job.organization_id);
    return new Response(JSON.stringify({ success: true, scan_id: job.scan_id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (req.method === "POST" && url.pathname.endsWith("/process")) {
    const body = await req.json().catch(() => ({}));
    if (!body.scan_id || !body.repository_id || !body.organization_id) {
      return new Response(JSON.stringify({ error: "scan_id, repository_id, organization_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    await processScan(body.scan_id, body.repository_id, body.organization_id);
    return new Response(JSON.stringify({ success: true, scan_id: body.scan_id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
