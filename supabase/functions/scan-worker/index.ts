import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

/**
 * OmniGuard Scan Worker
 *
 * Processes queued scans from scan_queue.
 * Fetches real repository files via GitHub API (or stored artifacts).
 * Runs secret, SAST, IaC, and dependency scanners.
 * Calls Claude Haiku for AI classification + remediation hints.
 * Writes findings to database.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const WORKER_ID = `worker-${Deno.env.get("DENO_DEPLOYMENT_ID") || crypto.randomUUID().slice(0, 8)}`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScanFile {
  path: string;
  content: string;
  size: number;
}

interface RawFinding {
  scanner: string;
  rule_id: string;
  rule_name: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  evidence: string;
  file_path: string;
  line_start: number;
  line_end: number;
  owasp: string[];
  cwe: string[];
  risk_score: number;
  confidence_score: number;
  remediation?: string;
}

// ─── Secret patterns ──────────────────────────────────────────────────────────

const SECRET_PATTERNS = [
  { id: "SECRET-AWS-001", name: "AWS Access Key ID", pattern: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g, severity: "critical", description: "AWS Access Key ID found in source code. Rotate immediately." },
  { id: "SECRET-AWS-002", name: "AWS Secret Access Key", pattern: /(?:aws_secret|AWS_SECRET)[_\-]?(?:access_key|ACCESS_KEY)["']?\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi, severity: "critical", description: "AWS Secret Access Key found in source code." },
  { id: "SECRET-GITHUB-001", name: "GitHub Personal Access Token", pattern: /gh[pousr]_[A-Za-z0-9]{36}/g, severity: "critical", description: "GitHub PAT found. Revoke at github.com/settings/tokens." },
  { id: "SECRET-OPENAI-001", name: "OpenAI API Key", pattern: /sk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}/g, severity: "critical", description: "OpenAI API key found. Rotate at platform.openai.com." },
  { id: "SECRET-OPENAI-002", name: "OpenAI Project Key", pattern: /sk-proj-[A-Za-z0-9_-]{40,}/g, severity: "critical", description: "OpenAI project key found. Rotate immediately." },
  { id: "SECRET-ANTHROPIC-001", name: "Anthropic API Key", pattern: /sk-ant-[A-Za-z0-9\-_]{95,}/g, severity: "critical", description: "Anthropic API key found. Rotate at console.anthropic.com." },
  { id: "SECRET-STRIPE-001", name: "Stripe Live Secret Key", pattern: /sk_live_[0-9a-zA-Z]{24,}/g, severity: "critical", description: "Stripe live secret key found. Rotate at dashboard.stripe.com." },
  { id: "SECRET-STRIPE-002", name: "Stripe Test Secret Key", pattern: /sk_test_[0-9a-zA-Z]{24,}/g, severity: "medium", description: "Stripe test secret key found. Avoid committing test keys." },
  { id: "SECRET-SLACK-001", name: "Slack API Token", pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}/g, severity: "high", description: "Slack token found. Revoke at api.slack.com." },
  { id: "SECRET-SSH-001", name: "SSH Private Key", pattern: /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/g, severity: "critical", description: "SSH private key found. Remove and rotate." },
  { id: "SECRET-DB-001", name: "Database Connection String", pattern: /(postgres|postgresql|mysql|mongodb|redis):\/\/[^:\s]+:[^@\s]+@[^\s'"]{5,}/gi, severity: "critical", description: "Database connection string with credentials found." },
  { id: "SECRET-JWT-001", name: "JWT Secret", pattern: /jwt[_\-]?secret["']?\s*[:=]\s*["']([A-Za-z0-9\-_!@#$%^&*]{20,})["']/gi, severity: "critical", description: "JWT signing secret found in code. Rotate and use environment variables." },
  { id: "SECRET-PASSWORD-001", name: "Hardcoded Password", pattern: /(?:^|[^a-z])(?:password|passwd|pwd)\s*[:=]\s*["']([^"'\s]{8,})["']/gim, severity: "high", description: "Hardcoded password found. Use environment variables or secrets manager." },
  { id: "SECRET-GCP-001", name: "GCP Service Account Key", pattern: /"private_key":\s*"-----BEGIN (?:RSA )?PRIVATE KEY-----/g, severity: "critical", description: "GCP service account private key found. Delete key and create new one." },
  { id: "SECRET-NPM-001", name: "NPM Auth Token", pattern: /\/\/registry\.npmjs\.org\/:_authToken=[A-Za-z0-9\-]{36}/g, severity: "high", description: "NPM auth token found. Revoke at npmjs.com." },
  { id: "SECRET-DISCORD-001", name: "Discord Bot Token", pattern: /[MN][A-Za-z\d]{23}\.[\w-]{6}\.[\w-]{27}/g, severity: "high", description: "Discord bot token found. Regenerate in Discord Developer Portal." },
];

const SAST_PATTERNS = [
  { id: "SAST-SQL-001", name: "SQL Injection", pattern: /(?:execute|query|run)\s*\(\s*["'`][^"'`]*(?:SELECT|INSERT|UPDATE|DELETE|DROP)[^"'`]*["'`]\s*\+/gi, severity: "critical", cwe: ["CWE-89"], owasp: ["A03:2021"], description: "SQL query built by string concatenation. Use parameterized queries." },
  { id: "SAST-SQL-002", name: "SQL Injection (Python f-string)", pattern: /(?:cursor\.execute|conn\.execute)\s*\(\s*f["'][^"']*\{/g, severity: "critical", cwe: ["CWE-89"], owasp: ["A03:2021"], description: "SQL query uses f-string with user data. Use parameterized queries." },
  { id: "SAST-XSS-001", name: "Cross-Site Scripting (innerHTML)", pattern: /\.innerHTML\s*[+]?=\s*(?:.*?\+|(?!["'`][^"'`]*["'`]\s*;))/gm, severity: "high", cwe: ["CWE-79"], owasp: ["A03:2021"], description: "innerHTML set with dynamic data. Use textContent or sanitize with DOMPurify." },
  { id: "SAST-XSS-002", name: "Cross-Site Scripting (document.write)", pattern: /document\.write\s*\([^)]*(?:\+|\${)/g, severity: "high", cwe: ["CWE-79"], owasp: ["A03:2021"], description: "document.write with dynamic data enables XSS." },
  { id: "SAST-CMD-001", name: "Command Injection (eval)", pattern: /\beval\s*\([^)]*(?:req\.|request\.|params\.|query\.|body\.|\$_(?:GET|POST|REQUEST)|input)/gi, severity: "critical", cwe: ["CWE-78"], owasp: ["A03:2021"], description: "eval() with user-controlled input allows code injection." },
  { id: "SAST-CMD-002", name: "Command Injection (exec)", pattern: /(?:child_process\.exec|execSync|os\.system|subprocess\.(?:call|run|Popen))\s*\([^)]*(?:req\.|request\.|params\.|query\.|body\.)/gi, severity: "critical", cwe: ["CWE-78"], owasp: ["A03:2021"], description: "Shell command executed with user-controlled input." },
  { id: "SAST-SSRF-001", name: "Server-Side Request Forgery", pattern: /(?:fetch|axios\.(?:get|post|put|request)|requests\.(?:get|post)|http\.get)\s*\([^)]*(?:req\.|request\.|params\.|query\.|body\.)/gi, severity: "critical", cwe: ["CWE-918"], owasp: ["A10:2021"], description: "HTTP request made with user-controlled URL. Validate and allowlist URLs." },
  { id: "SAST-PATH-001", name: "Path Traversal", pattern: /(?:path\.(?:join|resolve)|open|fs\.(?:read|write)File)\s*\([^)]*(?:req\.|request\.|params\.|query\.|body\.)/gi, severity: "high", cwe: ["CWE-22"], owasp: ["A01:2021"], description: "File path constructed from user input. Validate and canonicalize paths." },
  { id: "SAST-CRYPTO-001", name: "Weak Hash (MD5)", pattern: /(?:crypto\.createHash\s*\(\s*["']md5["']|hashlib\.md5\s*\(|MessageDigest\.getInstance\s*\(\s*["']MD5["'])/gi, severity: "high", cwe: ["CWE-328"], owasp: ["A02:2021"], description: "MD5 is cryptographically broken. Use SHA-256 or SHA-3." },
  { id: "SAST-CRYPTO-002", name: "Weak Hash (SHA-1)", pattern: /(?:crypto\.createHash\s*\(\s*["']sha1["']|hashlib\.sha1\s*\(|MessageDigest\.getInstance\s*\(\s*["']SHA-?1["'])/gi, severity: "medium", cwe: ["CWE-328"], owasp: ["A02:2021"], description: "SHA-1 is deprecated. Use SHA-256 or SHA-3." },
  { id: "SAST-DESER-001", name: "Unsafe Deserialization (pickle)", pattern: /pickle\.loads?\s*\(/g, severity: "critical", cwe: ["CWE-502"], owasp: ["A08:2021"], description: "pickle.load() with untrusted data allows arbitrary code execution." },
  { id: "SAST-JWT-001", name: "JWT Algorithm None", pattern: /algorithm[s]?\s*[:=]\s*["']none["']/gi, severity: "critical", cwe: ["CWE-287"], owasp: ["A07:2021"], description: "JWT 'none' algorithm allows signature bypass. Always specify RS256 or HS256." },
  { id: "SAST-OPEN-REDIRECT-001", name: "Open Redirect", pattern: /(?:res\.redirect|response\.redirect)\s*\([^)]*(?:req\.|request\.|params\.|query\.|body\.)/gi, severity: "medium", cwe: ["CWE-601"], owasp: ["A01:2021"], description: "Redirect to user-controlled URL. Validate against allowlist." },
];

// ─── File utility ─────────────────────────────────────────────────────────────

const SCANNABLE_EXTENSIONS = new Set([
  "js", "jsx", "ts", "tsx", "py", "java", "go", "rb", "php", "cs", "rs", "c", "cpp",
  "tf", "hcl", "yaml", "yml", "json", "xml", "toml", "ini", "env", "sh", "bash",
  "dockerfile", "md", "txt", "sql", "graphql",
]);

const SKIP_PATHS = [
  "node_modules/", ".git/", "dist/", "build/", "__pycache__/", ".venv/", "vendor/",
  "coverage/", ".next/", "out/", "target/", ".gradle/",
];

function shouldScanFile(path: string, size: number): boolean {
  if (size > 500_000) return false; // Skip files > 500KB
  const lower = path.toLowerCase();
  if (SKIP_PATHS.some((p) => lower.includes(p))) return false;
  const ext = lower.split(".").pop() || "";
  // Always scan files with sensitive names regardless of extension
  if (/\.env(\.|$)|secrets?(\.|$)|credential/i.test(lower)) return true;
  return SCANNABLE_EXTENSIONS.has(ext);
}

function isBinary(content: string): boolean {
  const sample = content.slice(0, 512);
  const nonPrintable = (sample.match(/[\x00-\x08\x0e-\x1f\x7f]/g) || []).length;
  return nonPrintable / sample.length > 0.05;
}

function maskSecret(value: string): string {
  if (value.length <= 8) return "*".repeat(value.length);
  return value.slice(0, 4) + "*".repeat(Math.max(value.length - 8, 4)) + value.slice(-4);
}

// ─── Scanner ──────────────────────────────────────────────────────────────────

function runSecretScanner(files: ScanFile[]): RawFinding[] {
  const findings: RawFinding[] = [];

  for (const file of files) {
    if (isBinary(file.content)) continue;

    for (const rule of SECRET_PATTERNS) {
      rule.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      const seenLines = new Set<number>();

      while ((match = rule.pattern.exec(file.content)) !== null) {
        const lineNum = file.content.substring(0, match.index).split("\n").length;
        if (seenLines.has(lineNum)) continue;
        seenLines.add(lineNum);

        const lineContent = file.content.split("\n")[lineNum - 1]?.trim() || "";
        if (/^\s*(\/\/|#|\*|\*)/.test(lineContent)) continue;
        if (/(?:test|example|sample|demo|placeholder|changeme|your[-_]|xxx)/i.test(match[0])) continue;

        findings.push({
          scanner: "secret",
          rule_id: rule.id,
          rule_name: rule.name,
          category: "Exposed Secret",
          severity: rule.severity,
          title: `${rule.name} detected`,
          description: rule.description,
          evidence: maskSecret(match[0]),
          file_path: file.path,
          line_start: lineNum,
          line_end: lineNum,
          owasp: ["A07:2021 - Identification and Authentication Failures"],
          cwe: ["CWE-798"],
          risk_score: rule.severity === "critical" ? 95 : rule.severity === "high" ? 70 : 45,
          confidence_score: 0.88,
          remediation: "Remove secret from code. Store in environment variables or a secrets manager (AWS Secrets Manager, Vault, Doppler). Rotate the compromised credential immediately.",
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
      let match: RegExpExecArray | null;
      const seenLines = new Set<number>();

      while ((match = rule.pattern.exec(file.content)) !== null) {
        const lineNum = file.content.substring(0, match.index).split("\n").length;
        if (seenLines.has(lineNum)) continue;
        seenLines.add(lineNum);

        const lineContent = file.content.split("\n")[lineNum - 1]?.trim() || "";
        if (/^\s*(\/\/|#|\*)/.test(lineContent)) continue;

        findings.push({
          scanner: "sast",
          rule_id: rule.id,
          rule_name: rule.name,
          category: rule.name,
          severity: rule.severity,
          title: `${rule.name} vulnerability`,
          description: rule.description,
          evidence: match[0].substring(0, 200),
          file_path: file.path,
          line_start: lineNum,
          line_end: lineNum,
          owasp: rule.owasp,
          cwe: rule.cwe,
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
  const iacFiles = files.filter((f) => {
    const lower = f.path.toLowerCase();
    return lower.endsWith(".tf") || lower.endsWith(".hcl") || /dockerfile$/i.test(lower) ||
      lower.endsWith("docker-compose.yml") || lower.endsWith("docker-compose.yaml") ||
      lower.includes("cloudformation") || lower.includes("k8s") || lower.includes("kubernetes");
  });

  const iacPatterns = [
    { id: "IAC-S3-001", pattern: /acl\s*=\s*["']public-read(?:-write)?["']/gi, name: "S3 Bucket Public ACL", severity: "critical", description: "S3 bucket allows public access. Remove public ACL and use bucket policies." },
    { id: "IAC-EC2-001", pattern: /ingress\s*\{[^}]*cidr_blocks\s*=\s*\["0\.0\.0\.0\/0"\]/gs, name: "Security Group Open to World", severity: "high", description: "Security group allows unrestricted inbound access. Restrict to known IPs." },
    { id: "IAC-RDS-001", pattern: /publicly_accessible\s*=\s*true/gi, name: "RDS Publicly Accessible", severity: "critical", description: "RDS instance is publicly accessible. Disable and use VPC." },
    { id: "IAC-ENC-001", pattern: /encrypted\s*=\s*false/gi, name: "Unencrypted Storage", severity: "high", description: "Storage resource has encryption disabled. Enable encryption at rest." },
    { id: "IAC-DOCKER-001", pattern: /^USER\s+root\s*$/mi, name: "Dockerfile Root User", severity: "high", description: "Container runs as root. Add a non-root USER instruction." },
    { id: "IAC-DOCKER-002", pattern: /^FROM\s+\S+:latest/mi, name: "Dockerfile Latest Tag", severity: "medium", description: "Using :latest tag. Pin to a specific version for reproducible builds." },
    { id: "IAC-DOCKER-003", pattern: /^ENV\s+\w*(?:SECRET|PASSWORD|TOKEN|KEY|PASS)\w*\s+\S+/mi, name: "Secret in Dockerfile ENV", severity: "critical", description: "Secret in ENV instruction is baked into image. Use Docker secrets or runtime env." },
    { id: "IAC-K8S-001", pattern: /privileged:\s*true/gi, name: "Privileged Kubernetes Container", severity: "critical", description: "Pod runs in privileged mode. Remove privileged: true or use securityContext." },
    { id: "IAC-K8S-002", pattern: /hostNetwork:\s*true/gi, name: "Kubernetes Host Network", severity: "high", description: "Pod uses host network namespace. Set hostNetwork: false." },
    { id: "IAC-SSL-001", pattern: /ssl_enforcement_enabled\s*=\s*false/gi, name: "SSL Enforcement Disabled", severity: "high", description: "SSL enforcement is disabled. Enable SSL/TLS for all database connections." },
  ];

  for (const file of iacFiles) {
    for (const rule of iacPatterns) {
      rule.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      const seenLines = new Set<number>();

      while ((match = rule.pattern.exec(file.content)) !== null) {
        const lineNum = file.content.substring(0, match.index).split("\n").length;
        if (seenLines.has(lineNum)) continue;
        seenLines.add(lineNum);

        findings.push({
          scanner: "iac",
          rule_id: rule.id,
          rule_name: rule.name,
          category: "Infrastructure Misconfiguration",
          severity: rule.severity,
          title: rule.name,
          description: rule.description,
          evidence: match[0].substring(0, 150),
          file_path: file.path,
          line_start: lineNum,
          line_end: lineNum,
          owasp: ["A05:2021 - Security Misconfiguration"],
          cwe: ["CWE-16"],
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
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        for (const [name, ver] of Object.entries(allDeps)) {
          deps.push({ name, version: String(ver).replace(/[^0-9.]/g, ""), ecosystem: "npm" });
        }
      } catch { continue; }
    } else if (lower.endsWith("requirements.txt")) {
      for (const line of file.content.split("\n")) {
        const m = /^([A-Za-z0-9_.-]+)(?:[>=<!\[]{1,2}[\w.,]+)?/.exec(line.trim());
        if (m) deps.push({ name: m[1], version: "*", ecosystem: "pypi" });
      }
    }

    // Query OSV for each dependency (batch up to 20 per request)
    const batches: typeof deps[] = [];
    for (let i = 0; i < deps.slice(0, 60).length; i += 20) {
      batches.push(deps.slice(i, i + 20));
    }

    for (const batch of batches) {
      try {
        const queries = batch.map((d) => ({
          package: { name: d.name, ecosystem: d.ecosystem === "npm" ? "npm" : "PyPI" },
          version: d.version !== "*" ? d.version : undefined,
        })).filter((q) => q.version);

        if (queries.length === 0) continue;

        const res = await fetch("https://api.osv.dev/v1/querybatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queries }),
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) continue;
        const data = await res.json();

        for (let i = 0; i < (data.results || []).length; i++) {
          const result = data.results[i];
          const dep = batch[i];
          if (!result?.vulns?.length) continue;

          for (const vuln of result.vulns.slice(0, 3)) {
            const cvss = vuln.severity?.find((s: { score: number }) => s.score)?.score;
            const severity = cvss ? (cvss >= 9 ? "critical" : cvss >= 7 ? "high" : cvss >= 4 ? "medium" : "low") : "medium";

            findings.push({
              scanner: "dependency",
              rule_id: vuln.id || "DEP-001",
              rule_name: vuln.id || "Known Vulnerability",
              category: "Vulnerable Dependency",
              severity,
              title: `${dep.name} - ${vuln.id || "Known Vulnerability"}`,
              description: vuln.summary || vuln.details?.slice(0, 300) || "Known vulnerability in dependency.",
              evidence: `${dep.name}@${dep.version}`,
              file_path: file.path,
              line_start: 1,
              line_end: 1,
              owasp: ["A06:2021 - Vulnerable and Outdated Components"],
              cwe: ["CWE-1035"],
              risk_score: cvss ? Math.round(cvss * 10) : 50,
              confidence_score: 0.95,
              remediation: `Update ${dep.name} to latest patched version. Check ${vuln.references?.[0]?.url || "https://osv.dev"} for details.`,
            });
          }
        }
      } catch {
        // OSV query failed — skip batch silently to not block scan
      }
    }
  }

  return findings;
}

// ─── GitHub file fetcher ──────────────────────────────────────────────────────

async function fetchFilesFromGitHub(
  repo: { owner: string; name: string; full_name: string; default_branch: string },
  branch: string,
  commitSha: string | null,
  githubToken: string,
  changedFiles?: string[]
): Promise<ScanFile[]> {
  const files: ScanFile[] = [];
  const ref = commitSha || branch || repo.default_branch;
  const headers = {
    Authorization: `token ${githubToken}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "OmniGuard/1.0",
  };

  // If we have a specific list of changed files (from webhook payload), use those
  if (changedFiles && changedFiles.length > 0) {
    const filesToFetch = changedFiles.filter((f) => shouldScanFile(f, 0)).slice(0, 100);
    for (const filePath of filesToFetch) {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${repo.full_name}/contents/${filePath}?ref=${ref}`,
          { headers, signal: AbortSignal.timeout(10_000) }
        );
        if (!res.ok) continue;
        const data = await res.json();
        if (data.encoding === "base64" && data.content) {
          const content = atob(data.content.replace(/\n/g, ""));
          if (shouldScanFile(filePath, content.length)) {
            files.push({ path: filePath, content, size: content.length });
          }
        }
      } catch { continue; }
    }
    return files;
  }

  // Fall back to listing the tree and fetching all scannable files
  try {
    const treeRes = await fetch(
      `https://api.github.com/repos/${repo.full_name}/git/trees/${ref}?recursive=1`,
      { headers, signal: AbortSignal.timeout(15_000) }
    );
    if (!treeRes.ok) return files;
    const tree = await treeRes.json();
    if (tree.truncated) {
      console.warn(`Git tree truncated for ${repo.full_name} — very large repo`);
    }

    const candidates = (tree.tree || [])
      .filter((item: { type: string; path: string; size: number }) =>
        item.type === "blob" && shouldScanFile(item.path, item.size)
      )
      .slice(0, 200);

    // Fetch files in parallel batches of 10
    for (let i = 0; i < candidates.length; i += 10) {
      const batch = candidates.slice(i, i + 10);
      const results = await Promise.allSettled(
        batch.map(async (item: { path: string; sha: string; size: number }) => {
          const res = await fetch(
            `https://api.github.com/repos/${repo.full_name}/git/blobs/${item.sha}`,
            { headers, signal: AbortSignal.timeout(8_000) }
          );
          if (!res.ok) return null;
          const data = await res.json();
          if (data.encoding === "base64") {
            const content = atob(data.content.replace(/\n/g, ""));
            return { path: item.path, content, size: content.length };
          }
          return null;
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled" && r.value) files.push(r.value);
      }
    }
  } catch (err) {
    console.error("GitHub tree fetch failed:", err);
  }

  return files;
}

// ─── AI Classification ────────────────────────────────────────────────────────

async function classifyWithAI(
  findings: RawFinding[]
): Promise<{ classification: string; confidence: number; summary: string } | null> {
  if (!anthropicApiKey) return null;

  const severe = findings.filter((f) => f.severity === "critical" || f.severity === "high");
  if (severe.length === 0) return { classification: "LOW", confidence: 0.9, summary: "No critical or high severity findings detected." };

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
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: `You are a security analyst. Classify the security risk of this codebase and provide a brief summary.

Findings (${findings.length} total):
${severe.slice(0, 10).map((f) => `[${f.severity.toUpperCase()}] ${f.rule_name} in ${f.file_path}:${f.line_start} — ${f.description.slice(0, 80)}`).join("\n")}

Respond in JSON only:
{"classification":"SAFE|LOW|MEDIUM|HIGH|CRITICAL","confidence":0.0-1.0,"summary":"2-3 sentence summary of key risks and recommended actions"}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || "{}");
    return {
      classification: json.classification || "HIGH",
      confidence: json.confidence || 0.7,
      summary: json.summary || "",
    };
  } catch (err) {
    console.error("AI classification failed:", err);
    return null;
  }
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────

async function sendHeartbeat(status: string, scanId?: string): Promise<void> {
  try {
    await supabase.from("worker_heartbeats").upsert({
      worker_id: WORKER_ID,
      worker_type: "scanner",
      status,
      current_scan_id: scanId || null,
      last_heartbeat: new Date().toISOString(),
      metadata: { version: "1.0.0" },
    }, { onConflict: "worker_id" });
  } catch { /* heartbeat failure is non-fatal */ }
}

// ─── Main processing logic ────────────────────────────────────────────────────

async function processScan(scanId: string, repositoryId: string, organizationId: string): Promise<void> {
  const startTime = Date.now();

  // Mark scan as running
  await supabase.from("scans").update({
    status: "running",
    started_at: new Date().toISOString(),
    worker_id: WORKER_ID,
  }).eq("id", scanId);

  await sendHeartbeat("busy", scanId);

  try {
    // Fetch scan + repository details
    const { data: scan } = await supabase
      .from("scans")
      .select("branch, commit_sha, trigger, metadata")
      .eq("id", scanId)
      .single();

    const { data: repo } = await supabase
      .from("repositories")
      .select("id, owner, name, full_name, default_branch, provider")
      .eq("id", repositoryId)
      .single();

    if (!repo) throw new Error("Repository not found");

    let files: ScanFile[] = [];

    // Try to get integration token for GitHub API access
    if (repo.provider === "github") {
      const { data: integration } = await supabase
        .from("integrations")
        .select("config")
        .eq("organization_id", organizationId)
        .eq("provider", "github")
        .eq("status", "active")
        .maybeSingle();

      const githubToken = (integration?.config as Record<string, string>)?.access_token || Deno.env.get("GITHUB_TOKEN");

      if (githubToken) {
        const changedFiles = (scan?.metadata as Record<string, unknown>)?.changed_files as string[] | undefined;
        files = await fetchFilesFromGitHub(
          { owner: repo.owner, name: repo.name, full_name: repo.full_name, default_branch: repo.default_branch },
          scan?.branch || repo.default_branch,
          scan?.commit_sha || null,
          githubToken,
          changedFiles
        );
        console.log(`Fetched ${files.length} files from GitHub for ${repo.full_name}`);
      } else {
        console.warn(`No GitHub token for ${repo.full_name} — checking scan_artifacts storage`);
      }
    }

    // Fall back to stored artifacts in Supabase Storage
    if (files.length === 0) {
      const { data: artifacts } = await supabase.storage
        .from("scan-artifacts")
        .list(`${scanId}/files`, { limit: 200 });

      if (artifacts && artifacts.length > 0) {
        for (const artifact of artifacts.slice(0, 150)) {
          const { data: blob } = await supabase.storage
            .from("scan-artifacts")
            .download(`${scanId}/files/${artifact.name}`);
          if (blob) {
            const content = await blob.text();
            files.push({ path: artifact.name, content, size: content.length });
          }
        }
        console.log(`Loaded ${files.length} files from storage artifacts`);
      }
    }

    if (files.length === 0) {
      // No files available — mark as completed with explanation, not fake findings
      await supabase.from("scans").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        duration_seconds: Math.round((Date.now() - startTime) / 1000),
        summary: {
          files_scanned: 0,
          total: 0,
          critical: 0, high: 0, medium: 0, low: 0, info: 0,
          error: "No files available to scan. Configure GitHub integration with an access token.",
        },
      }).eq("id", scanId);
      await sendHeartbeat("idle");
      return;
    }

    // Run all scanners
    const [secretFindings, sastFindings, iacFindings, depFindings] = await Promise.all([
      Promise.resolve(runSecretScanner(files)),
      Promise.resolve(runSASTScanner(files)),
      Promise.resolve(runIaCScanner(files)),
      runDependencyScanner(files),
    ]);

    const allFindings = [...secretFindings, ...sastFindings, ...iacFindings, ...depFindings];

    // AI classification
    const aiResult = await classifyWithAI(allFindings);

    // Persist findings
    if (allFindings.length > 0) {
      const rows = allFindings.map((f) => ({
        organization_id: organizationId,
        repository_id: repositoryId,
        scan_id: scanId,
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
        remediation: f.remediation || null,
        ai_summary: aiResult ? `Risk: ${aiResult.classification} (${Math.round(aiResult.confidence * 100)}%). ${aiResult.summary}` : null,
      }));

      // Insert in batches of 50 to avoid request size limits
      for (let i = 0; i < rows.length; i += 50) {
        await supabase.from("findings").insert(rows.slice(i, i + 50));
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    const summary = {
      files_scanned: files.length,
      total: allFindings.length,
      critical: allFindings.filter((f) => f.severity === "critical").length,
      high: allFindings.filter((f) => f.severity === "high").length,
      medium: allFindings.filter((f) => f.severity === "medium").length,
      low: allFindings.filter((f) => f.severity === "low").length,
      info: allFindings.filter((f) => f.severity === "info").length,
      ai_classification: aiResult?.classification,
    };

    await supabase.from("scans").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      duration_seconds: duration,
      summary,
    }).eq("id", scanId);

    // Update repo risk score
    const avgRisk = allFindings.length > 0
      ? Math.min(100, Math.round(allFindings.reduce((s, f) => s + f.risk_score, 0) / allFindings.length))
      : 0;
    await supabase.from("repositories").update({
      risk_score: avgRisk,
      last_scan_at: new Date().toISOString(),
    }).eq("id", repositoryId);

    // Audit log
    await supabase.from("audit_logs").insert({
      organization_id: organizationId,
      action: "scan_completed",
      resource_type: "scan",
      resource_id: scanId,
      metadata: { findings: allFindings.length, duration_seconds: duration, files_scanned: files.length },
    });

    // Notify admins of critical findings
    const criticalCount = summary.critical;
    if (criticalCount > 0) {
      const { data: admins } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", organizationId)
        .in("role", ["owner", "admin"]);

      if (admins?.length) {
        await supabase.from("notifications").insert(
          admins.map((a) => ({
            organization_id: organizationId,
            user_id: a.user_id,
            type: "critical_finding",
            title: `${criticalCount} Critical Finding${criticalCount > 1 ? "s" : ""} Detected`,
            body: `OmniGuard found ${criticalCount} critical vulnerability${criticalCount > 1 ? "ies" : "y"} in your codebase. Immediate attention required.`,
            data: { scan_id: scanId, repository_id: repositoryId, critical_count: criticalCount },
          }))
        );
      }
    }

    await sendHeartbeat("idle");
  } catch (err) {
    console.error(`Scan ${scanId} failed:`, err);
    await supabase.from("scans").update({
      status: "failed",
      error_message: err instanceof Error ? err.message : String(err),
      completed_at: new Date().toISOString(),
      duration_seconds: Math.round((Date.now() - startTime) / 1000),
    }).eq("id", scanId);
    await sendHeartbeat("error");
    throw err;
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname.endsWith("/health")) {
    return new Response(
      JSON.stringify({ worker_id: WORKER_ID, status: "healthy", timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (req.method === "GET" && url.pathname.endsWith("/process")) {
    // Claim next available scan from queue
    const { data, error } = await supabase.rpc("claim_next_scan", { p_worker_id: WORKER_ID });

    if (error) {
      console.error("claim_next_scan error:", error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const job = Array.isArray(data) ? data[0] : data;
    if (!job?.scan_id) {
      return new Response(
        JSON.stringify({ success: true, message: "No pending scans" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await processScan(job.scan_id, job.repository_id, job.organization_id);

    return new Response(
      JSON.stringify({ success: true, scan_id: job.scan_id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // POST /process — process a specific scan by ID (useful for GitHub Actions / webhooks)
  if (req.method === "POST" && url.pathname.endsWith("/process")) {
    const body = await req.json().catch(() => ({}));
    if (!body.scan_id || !body.repository_id || !body.organization_id) {
      return new Response(
        JSON.stringify({ error: "scan_id, repository_id, organization_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await processScan(body.scan_id, body.repository_id, body.organization_id);
    return new Response(
      JSON.stringify({ success: true, scan_id: body.scan_id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
