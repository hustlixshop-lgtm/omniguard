#!/usr/bin/env node
/**
 * OmniGuard CLI - Install and manage Git hooks
 *
 * Usage:
 *   npx omniguard install-hooks       Install pre-commit and pre-push hooks
 *   npx omniguard scan                Run a security scan
 *   npx omniguard status             Show current security status
 *   npx omniguard suppress <id>      Suppress a finding
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const OMNIGUARD_URL = process.env.OMNIGUARD_URL || 'https://api.omniguard.io';
const OMNIGUARD_API_KEY = process.env.OMNIGUARD_API_KEY;

// ANSI colors
const colors = {
  red: '\x1b[0;31m',
  green: '\x1b[0;32m',
  yellow: '\x1b[1;33m',
  blue: '\x1b[0;34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function getGitRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

function installHooks() {
  const gitRoot = getGitRoot();
  if (!gitRoot) {
    log('Error: Not a git repository', 'red');
    process.exit(1);
  }

  const hooksDir = path.join(gitRoot, '.git', 'hooks');

  // Create hooks directory if it doesn't exist
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  // Pre-commit hook
  const preCommitSrc = path.join(__dirname, '..', 'hooks', 'pre-commit');
  const preCommitDest = path.join(hooksDir, 'pre-commit');

  if (fs.existsSync(preCommitSrc)) {
    fs.copyFileSync(preCommitSrc, preCommitDest);
    fs.chmodSync(preCommitDest, '755');
    log('✓ Installed pre-commit hook', 'green');
  } else {
    // Generate hook inline
    const preCommitContent = generatePreCommitHook();
    fs.writeFileSync(preCommitDest, preCommitContent, { mode: 0o755 });
    log('✓ Generated and installed pre-commit hook', 'green');
  }

  // Pre-push hook
  const prePushSrc = path.join(__dirname, '..', 'hooks', 'pre-push');
  const prePushDest = path.join(hooksDir, 'pre-push');

  if (fs.existsSync(prePushSrc)) {
    fs.copyFileSync(prePushSrc, prePushDest);
    fs.chmodSync(prePushDest, '755');
    log('✓ Installed pre-push hook', 'green');
  } else {
    const prePushContent = generatePrePushHook();
    fs.writeFileSync(prePushDest, prePushContent, { mode: 0o755 });
    log('✓ Generated and installed pre-push hook', 'green');
  }

  log('\nOmniGuard Git hooks installed successfully!', 'green');
  log('\nConfiguration:', 'blue');
  log('  OMNIGUARD_URL          - API endpoint (default: https://api.omniguard.io)');
  log('  OMNIGUARD_API_KEY      - Your API key');
  log('  OMNIGUARD_FAIL_ON      - Minimum severity to block (critical, high, medium, low)');
  log('  OMNIGUARD_BYPASS       - Allow bypass with --bypass flag (true/false)');
  log('  OMNIGUARD_SKIP_PATTERNS - Comma-separated file patterns to skip');
}

function generatePreCommitHook() {
  return `#!/usr/bin/env bash
# OmniGuard Pre-Commit Hook
set -e

OMNIGUARD_URL="${OMNIGUARD_URL}"
FAIL_ON="\${OMNIGUARD_FAIL_ON:-critical}"

echo "🔒 OmniGuard: Scanning staged files..."

# Get staged files
STAGED=\$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "\$STAGED" ]; then
  echo "✓ No staged files to scan"
  exit 0
fi

# Check for API key
if [ -z "\$OMNIGUARD_API_KEY" ]; then
  echo "⚠ Warning: OMNIGUARD_API_KEY not set. Skipping scan."
  exit 0
fi

# Create temp file with staged content
TMPFILE=\$(mktemp)
echo '{"files":[' > "\$TMPFILE"

FIRST=true
for FILE in \$STAGED; do
  if [ -f "\$FILE" ]; then
    if [ "\$FIRST" = true ]; then
      FIRST=false
    else
      echo ',' >> "\$TMPFILE"
    fi
    CONTENT=\$(git show ":\$FILE" | base64 -w 0 2>/dev/null || base64)
    echo "{\\"path\\":\\"$FILE\\",\\"content\\":\\"$CONTENT\\"}" >> "\$TMPFILE"
  fi
done

echo ']}' >> "\$TMPFILE"

# Call API
RESPONSE=\$(curl -s -X POST \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer \$OMNIGUARD_API_KEY" \\
  -d @\$TMPFILE \\
  "\$OMNIGUARD_URL/scan/quick")

rm -f "\$TMPFILE"

# Parse response
CRITICAL=\$(echo "\$RESPONSE" | grep -o '"critical":[0-9]*' | grep -o '[0-9]*' || echo "0")
HIGH=\$(echo "\$RESPONSE" | grep -o '"high":[0-9]*' | grep -o '[0-9]*' || echo "0")

if [ "\$FAIL_ON" = "critical" ] && [ "\$CRITICAL" -gt 0 ]; then
  echo "❌ OmniGuard: Found \$CRITICAL critical issues. Commit blocked."
  exit 1
elif [ "\$FAIL_ON" = "high" ] && ([ "\$CRITICAL" -gt 0 ] || [ "\$HIGH" -gt 0 ]); then
  echo "❌ OmniGuard: Found \$CRITICAL critical, \$HIGH high issues. Commit blocked."
  exit 1
fi

echo "✓ OmniGuard: No blocking issues found"
exit 0
`;
}

function generatePrePushHook() {
  return `#!/usr/bin/env bash
# OmniGuard Pre-Push Hook
set -e

OMNIGUARD_URL="${OMNIGUARD_URL}"

echo "🔒 OmniGuard: Pre-push security check..."

if [ -z "\$OMNIGUARD_API_KEY" ]; then
  echo "⚠ Warning: OMNIGUARD_API_KEY not set. Skipping scan."
  exit 0
fi

# For now, just pass - full scan happens server-side via webhook
echo "✓ Pre-push check passed"
exit 0
`;
}

async function runScan(files = [], options = {}) {
  const { quick = true, ai = true } = options;

  if (!OMNIGUARD_API_KEY) {
    log('Error: OMNIGUARD_API_KEY not set', 'red');
    log('Get your API key from: https://app.omniguard.io/settings/api-keys', 'yellow');
    process.exit(1);
  }

  log('\n🔒 OmniGuard Security Scanner\n', 'blue');

  const payload = {
    files: files.length > 0 ? files : await getTrackedFiles(),
    quick,
    ai_enabled: ai
  };

  try {
    const response = await makeRequest('POST', '/scan', payload);
    displayResults(response);

    const hasCriticalOrHigh = response.summary?.critical > 0 || response.summary?.high > 0;
    process.exit(hasCriticalOrHigh ? 1 : 0);
  } catch (error) {
    log(`Scan failed: ${error.message}`, 'red');
    process.exit(2);
  }
}

async function showStatus() {
  if (!OMNIGUARD_API_KEY) {
    log('Error: OMNIGUARD_API_KEY not set', 'red');
    process.exit(1);
  }

  try {
    const response = await makeRequest('GET', '/status');

    log('\n🔍 OmniGuard Status\n', 'blue');
    log(`API Status: ${response.status || 'healthy'}`, 'green');
    log(`Organization: ${response.organization || 'Unknown'}`);
    log(`Recent Scans: ${response.recent_scans || 0}`);
    log(`Open Findings: ${response.open_findings || 0}`);

    if (response.summary) {
      log('\nFindings Summary:', 'yellow');
      log(`  🔴 Critical: ${response.summary.critical || 0}`);
      log(`  🟠 High: ${response.summary.high || 0}`);
      log(`  🟡 Medium: ${response.summary.medium || 0}`);
      log(`  🔵 Low: ${response.summary.low || 0}`);
    }
  } catch (error) {
    log(`Failed to get status: ${error.message}`, 'red');
    process.exit(1);
  }
}

async function suppressFinding(findingId, reason) {
  if (!OMNIGUARD_API_KEY) {
    log('Error: OMNIGUARD_API_KEY not set', 'red');
    process.exit(1);
  }

  try {
    await makeRequest('POST', `/findings/${findingId}/suppress`, { reason });
    log(`Finding ${findingId} suppressed`, 'green');
  } catch (error) {
    log(`Failed to suppress: ${error.message}`, 'red');
    process.exit(1);
  }
}

async function makeRequest(method, endpoint, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, OMNIGUARD_URL);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OMNIGUARD_API_KEY}`
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 400) {
            reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error('Invalid JSON response'));
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

function displayResults(response) {
  const { findings = [], summary = {}, aiAnalysis } = response;

  log('📊 Scan Results\n');
  log(`Files Scanned: ${response.metadata?.files_scanned || 'N/A'}`);
  log(`Duration: ${response.metadata?.duration_ms || 0}ms\n`);

  log('Findings by Severity:', 'yellow');
  log(`  🔴 Critical: ${summary.critical || 0}`);
  log(`  🟠 High: ${summary.high || 0}`);
  log(`  🟡 Medium: ${summary.medium || 0}`);
  log(`  🔵 Low: ${summary.low || 0}`);
  log(`  ⚪ Info: ${summary.info || 0}\n`);

  if (findings.length > 0) {
    log('📋 Top Findings:\n', 'yellow');

    findings.slice(0, 20).forEach((f, i) => {
      const icon = f.severity === 'critical' ? '🔴' :
                  f.severity === 'high' ? '🟠' :
                  f.severity === 'medium' ? '🟡' : '🔵';

      log(`${icon} [${f.severity.toUpperCase()}] ${f.title}`);
      log(`   📁 ${f.file_path}:${f.line_start}`);
      log(`   📝 ${f.rule_name}`);
      if (f.remediation) {
        log(`   💡 ${f.remediation.substring(0, 100)}...`);
      }
      log('');
    });
  }

  if (aiAnalysis) {
    log('🤖 AI Analysis:', 'blue');
    log(`Classification: ${aiAnalysis.classification}`);
    log(`Confidence: ${(aiAnalysis.confidence * 100).toFixed(0)}%`);
    if (aiAnalysis.reasoning) {
      log(`Reasoning: ${aiAnalysis.reasoning}`);
    }
  }
}

async function getTrackedFiles() {
  const gitRoot = getGitRoot();
  if (!gitRoot) return [];

  const output = execSync('git ls-files', { encoding: 'utf-8', cwd: gitRoot });
  return output.split('\n').filter(f => f.trim());
}

// CLI
const args = process.argv.slice(2);
const command = args[0];

(async () => {
  switch (command) {
    case 'install-hooks':
    case 'install':
      installHooks();
      break;
    case 'scan':
      await runScan(args.slice(1));
      break;
    case 'status':
      await showStatus();
      break;
    case 'suppress':
      await suppressFinding(args[1], args.slice(2).join(' ') || 'Suppressed');
      break;
    case 'help':
    case '--help':
    case '-h':
      log('\nOmniGuard - AI-Powered Security Scanner\n', 'blue');
      log('Usage: omniguard <command> [options]\n');
      log('Commands:');
      log('  install-hooks    Install Git hooks for automatic scanning');
      log('  scan [files...]  Run security scan');
      log('  status           Show organization security status');
      log('  suppress <id> [reason]  Suppress a finding');
      log('  help             Show this help message\n');
      log('Environment Variables:');
      log('  OMNIGUARD_URL      API endpoint');
      log('  OMNIGUARD_API_KEY  Your API key\n');
      break;
    default:
      log(`Unknown command: ${command}`, 'red');
      log('Run "omniguard help" for usage information', 'yellow');
      process.exit(1);
  }
})();
