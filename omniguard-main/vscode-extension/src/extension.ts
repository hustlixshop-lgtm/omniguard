import * as vscode from 'vscode';
import { OmniGuardClient } from './client';
import { FindingsProvider } from './providers/findingsProvider';
import { SummaryProvider } from './providers/summaryProvider';
import { DiagnosticsManager } from './diagnostics';
import { AuthManager } from './auth';
import { ScanManager } from './scanManager';
import { CodeLensProvider } from './providers/codeLensProvider';
import { HoverProvider } from './providers/hoverProvider';

let client: OmniGuardClient;
let authManager: AuthManager;
let scanManager: ScanManager;
let diagnosticsManager: DiagnosticsManager;
let findingsProvider: FindingsProvider;
let summaryProvider: SummaryProvider;
let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
  console.log('OmniGuard extension activating...');

  authManager = new AuthManager(context);
  client = new OmniGuardClient(authManager);
  scanManager = new ScanManager(client, diagnosticsManager!, context);
  diagnosticsManager = new DiagnosticsManager();

  // Wire DiagnosticsManager into ScanManager so Problems panel actually populates
  scanManager.setDiagnosticsManager(diagnosticsManager);

  findingsProvider = new FindingsProvider(scanManager, context);
  summaryProvider = new SummaryProvider(scanManager);

  vscode.window.registerTreeDataProvider('omniguard.findings', findingsProvider);
  vscode.window.registerTreeDataProvider('omniguard.summary', summaryProvider);

  const codeLensProvider = new CodeLensProvider(scanManager);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [
        { scheme: 'file', language: 'javascript' },
        { scheme: 'file', language: 'typescript' },
        { scheme: 'file', language: 'javascriptreact' },
        { scheme: 'file', language: 'typescriptreact' },
        { scheme: 'file', language: 'python' },
        { scheme: 'file', language: 'java' },
        { scheme: 'file', language: 'go' },
        { scheme: 'file', language: 'ruby' },
        { scheme: 'file', language: 'php' },
        { scheme: 'file', language: 'csharp' },
        { scheme: 'file', language: 'rust' },
      ],
      codeLensProvider
    )
  );

  const hoverProvider = new HoverProvider(scanManager);
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      [
        { scheme: 'file', language: 'javascript' },
        { scheme: 'file', language: 'typescript' },
        { scheme: 'file', language: 'javascriptreact' },
        { scheme: 'file', language: 'typescriptreact' },
        { scheme: 'file', language: 'python' },
        { scheme: 'file', language: 'java' },
        { scheme: 'file', language: 'go' },
        { scheme: 'file', language: 'ruby' },
      ],
      hoverProvider
    )
  );

  registerCommands(context);

  // Status bar with live finding count
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  updateStatusBar();
  statusBarItem.command = 'omniguard.showDashboard';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  const config = vscode.workspace.getConfiguration('omniguard');

  // Auto-scan on save
  if (config.get<boolean>('scanOnSave', true)) {
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(async (document) => {
        if (document.uri.scheme !== 'file') return;
        if (isExcluded(document.uri.fsPath)) return;
        await runFileScan(document.uri.fsPath, document.getText());
      })
    );
  }

  // Quick-classify on file open — Layer 1 AI triage
  if (config.get<boolean>('enableRealtimeScanning', true)) {
    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument(async (document) => {
        if (document.uri.scheme !== 'file') return;
        if (isExcluded(document.uri.fsPath)) return;
        // Always run local scan on open — fast and free
        await runFileScan(document.uri.fsPath, document.getText());
      })
    );
  }

  // Show welcome / login prompt
  if (!authManager.isAuthenticated()) {
    const action = await vscode.window.showInformationMessage(
      'OmniGuard: Connect to your dashboard for full AI-powered scanning.',
      'Configure',
      'Later'
    );
    if (action === 'Configure') {
      vscode.commands.executeCommand('omniguard.openConnectionSettings');
    }
  } else {
    const info = authManager.getUserInfo();
    vscode.window.showInformationMessage(
      `OmniGuard active${info ? ` · ${info.organizationName || info.email}` : ''} · monitoring all files`
    );
  }
}

// ─── Core scan helper ─────────────────────────────────────────────────────────

async function runFileScan(filePath: string, content: string): Promise<void> {
  const result = await scanManager.scanFile(filePath, content);
  updateStatusBar();
  findingsProvider.refresh();
  summaryProvider.refresh();
  codeLensProvider_?.refresh();
}

let codeLensProvider_: CodeLensProvider | null = null;

// ─── Status bar ───────────────────────────────────────────────────────────────

function updateStatusBar(): void {
  if (!statusBarItem) return;
  const summary = scanManager?.getSummary();
  if (!summary || summary.total === 0) {
    statusBarItem.text = '$(shield) OmniGuard';
    statusBarItem.tooltip = 'OmniGuard — no findings in open files';
    statusBarItem.backgroundColor = undefined;
  } else if (summary.critical > 0) {
    statusBarItem.text = `$(shield) ${summary.critical} critical`;
    statusBarItem.tooltip = `OmniGuard: ${summary.critical} critical · ${summary.high} high · ${summary.total} total`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  } else if (summary.high > 0) {
    statusBarItem.text = `$(shield) ${summary.high} high`;
    statusBarItem.tooltip = `OmniGuard: ${summary.high} high · ${summary.medium} medium · ${summary.total} total`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  } else {
    statusBarItem.text = `$(shield) ${summary.total} issues`;
    statusBarItem.tooltip = `OmniGuard: ${summary.total} findings`;
    statusBarItem.backgroundColor = undefined;
  }
}

function isExcluded(filePath: string): boolean {
  const config = vscode.workspace.getConfiguration('omniguard');
  const patterns = config.get<string[]>('excludePatterns', []);
  const defaultExclude = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'vendor'];
  return [...defaultExclude, ...patterns].some((p) => filePath.includes(p));
}

// ─── Commands ─────────────────────────────────────────────────────────────────

function registerCommands(context: vscode.ExtensionContext) {

  // omniguard.scanCurrentFile
  context.subscriptions.push(
    vscode.commands.registerCommand('omniguard.scanCurrentFile', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { vscode.window.showWarningMessage('No active file to scan'); return; }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'OmniGuard: Scanning...', cancellable: false },
        async (progress) => {
          progress.report({ increment: 30, message: 'Running security scanners...' });
          const result = await scanManager.scanFile(editor.document.uri.fsPath, editor.document.getText());
          progress.report({ increment: 70, message: 'AI classification...' });

          updateStatusBar();
          findingsProvider.refresh();
          summaryProvider.refresh();

          const c = result.findings.filter(f => f.severity === 'critical').length;
          const h = result.findings.filter(f => f.severity === 'high').length;
          const total = result.findings.length;

          if (total === 0) {
            vscode.window.showInformationMessage('✓ OmniGuard: No security issues found');
          } else if (c > 0) {
            vscode.window.showErrorMessage(
              `OmniGuard: ${c} critical, ${h} high findings`,
              'View in Problems', 'Get AI Fix'
            ).then(sel => {
              if (sel === 'View in Problems') vscode.commands.executeCommand('workbench.panel.markers.view.focus');
              else if (sel === 'Get AI Fix') vscode.commands.executeCommand('omniguard.getAIRemediation');
            });
          } else {
            vscode.window.showWarningMessage(
              `OmniGuard: ${total} findings (${h} high)`,
              'View in Problems'
            ).then(sel => {
              if (sel === 'View in Problems') vscode.commands.executeCommand('workbench.panel.markers.view.focus');
            });
          }
        }
      );
    })
  );

  // omniguard.scanWorkspace
  context.subscriptions.push(
    vscode.commands.registerCommand('omniguard.scanWorkspace', async () => {
      if (!vscode.workspace.workspaceFolders?.length) {
        vscode.window.showWarningMessage('No workspace folder open'); return;
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'OmniGuard: Scanning workspace...', cancellable: true },
        async (progress, token) => {
          const result = await scanManager.scanWorkspace(
            vscode.workspace.workspaceFolders![0].uri.fsPath,
            (scanned, total) => {
              progress.report({ increment: (scanned / total) * 90, message: `${scanned}/${total} files` });
              if (token.isCancellationRequested) return;
            }
          );
          progress.report({ increment: 10, message: 'Finalizing...' });

          updateStatusBar();
          findingsProvider.refresh();
          summaryProvider.refresh();
          diagnosticsManager.refresh();  // <-- correctly named variable

          const c = result.findings.filter(f => f.severity === 'critical').length;
          vscode.window.showInformationMessage(
            `OmniGuard workspace scan: ${result.findings.length} findings${c > 0 ? ` (${c} critical)` : ''}`,
            c > 0 ? 'View Critical' : 'View All'
          ).then(sel => {
            if (sel) vscode.commands.executeCommand('workbench.panel.markers.view.focus');
          });
        }
      );
    })
  );

  // omniguard.login
  context.subscriptions.push(
    vscode.commands.registerCommand('omniguard.login', async () => {
      // Ensure endpoint is configured first
      const config = vscode.workspace.getConfiguration('omniguard');
      const endpoint = config.get<string>('apiEndpoint', '');
      const anonKey = config.get<string>('supabaseAnonKey', '');

      if (!endpoint || !anonKey) {
        const setup = await vscode.window.showWarningMessage(
          'OmniGuard: Configure your API endpoint before signing in.',
          'Open Settings'
        );
        if (setup) vscode.commands.executeCommand('omniguard.openConnectionSettings');
        return;
      }

      const email = await vscode.window.showInputBox({
        prompt: 'OmniGuard: Email address',
        placeHolder: 'you@company.com',
        validateInput: (v) => (v?.includes('@') ? null : 'Enter a valid email'),
      });
      if (!email) return;

      const password = await vscode.window.showInputBox({
        prompt: 'OmniGuard: Password',
        password: true,
        placeHolder: 'Your OmniGuard password',
      });
      if (!password) return;

      try {
        await authManager.login(email, password);
        const info = authManager.getUserInfo();
        vscode.window.showInformationMessage(
          `✓ OmniGuard: Signed in${info?.organizationName ? ` to ${info.organizationName}` : ''}`
        );
        updateStatusBar();
      } catch (err) {
        vscode.window.showErrorMessage(
          `OmniGuard login failed: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    })
  );

  // omniguard.logout
  context.subscriptions.push(
    vscode.commands.registerCommand('omniguard.logout', async () => {
      await authManager.logout();
      scanManager.clear();
      updateStatusBar();
      findingsProvider.refresh();
      vscode.window.showInformationMessage('OmniGuard: Signed out');
    })
  );

  // omniguard.setApiKey — alternative to email/password auth
  context.subscriptions.push(
    vscode.commands.registerCommand('omniguard.setApiKey', async () => {
      const key = await vscode.window.showInputBox({
        prompt: 'OmniGuard: Paste your API key (og_live_...)',
        placeHolder: 'og_live_...',
        password: true,
        validateInput: (v) => (v?.startsWith('og_') ? null : 'Key must start with og_live_'),
      });
      if (!key) return;
      await authManager.setApiKey(key);
      vscode.window.showInformationMessage('✓ OmniGuard: API key saved. Scanning enabled.');
      updateStatusBar();
    })
  );

  // omniguard.openConnectionSettings — actually opens the settings panel
  context.subscriptions.push(
    vscode.commands.registerCommand('omniguard.openConnectionSettings', async () => {
      // Open VS Code settings filtered to OmniGuard
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'omniguard'
      );
      vscode.window.showInformationMessage(
        'Set omniguard.apiEndpoint (your Supabase functions URL) and omniguard.supabaseAnonKey, then use "OmniGuard: Sign In".'
      );
    })
  );

  // omniguard.suppressFinding
  context.subscriptions.push(
    vscode.commands.registerCommand('omniguard.suppressFinding', async (finding) => {
      if (!finding) return;
      const reason = await vscode.window.showInputBox({
        prompt: 'Why are you suppressing this finding?',
        placeHolder: 'e.g., False positive — test fixture only',
        validateInput: (v) => (v?.trim() ? null : 'Reason is required'),
      });
      if (!reason) return;

      await scanManager.suppressFinding(finding.id, reason);
      diagnosticsManager.clearForFinding(finding.id);
      findingsProvider.refresh();
      updateStatusBar();
      vscode.window.showInformationMessage('OmniGuard: Finding suppressed');
    })
  );

  // omniguard.getAIRemediation — fetch from backend and show in panel
  context.subscriptions.push(
    vscode.commands.registerCommand('omniguard.getAIRemediation', async (finding?: { id: string; title: string; file_path: string; line_start: number }) => {
      // If no finding passed, use the first critical one in current file
      if (!finding) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          const fileFindings = scanManager.getFindingsForFile(editor.document.uri.fsPath);
          finding = fileFindings.find(f => f.severity === 'critical' || f.severity === 'high') as typeof finding;
        }
      }
      if (!finding) {
        vscode.window.showInformationMessage('No finding selected. Click "AI Fix" on a specific finding first.');
        return;
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'OmniGuard: Generating AI fix...', cancellable: false },
        async () => {
          const remediation = await client.getRemediation(finding!.id);

          const panel = vscode.window.createWebviewPanel(
            'omniguardRemediation',
            `AI Fix: ${finding!.title}`,
            vscode.ViewColumn.Beside,
            { enableScripts: false }
          );

          const aiText = remediation?.ai_remediation || remediation?.remediation || 'No AI remediation available. Ensure ANTHROPIC_API_KEY is configured in your OmniGuard deployment.';

          panel.webview.html = getRemediationHtml(finding!, aiText);
        }
      );
    })
  );

  // omniguard.applyRemediation — applies the suggested code fix
  context.subscriptions.push(
    vscode.commands.registerCommand('omniguard.applyRemediation', async (finding) => {
      if (!finding) return;
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const remediation = await client.getRemediation(finding.id);
      // ai_remediation is plain text; look for a code block to apply
      const text = remediation?.ai_remediation || remediation?.remediation || '';
      const codeMatch = text.match(/```(?:\w+)?\n([\s\S]+?)\n```/);

      if (codeMatch) {
        const fixedCode = codeMatch[1];
        const line = Math.max(0, (finding.line_start || 1) - 1);
        const doc = editor.document;
        if (line < doc.lineCount) {
          const confirm = await vscode.window.showWarningMessage(
            `Apply AI-suggested fix to line ${finding.line_start}?`,
            { modal: true },
            'Apply'
          );
          if (confirm === 'Apply') {
            await editor.edit((b) => {
              const range = new vscode.Range(line, 0, line, doc.lineAt(line).text.length);
              b.replace(range, fixedCode.split('\n')[0]); // first line of fix
            });
            vscode.window.showInformationMessage('✓ OmniGuard: Fix applied');
          }
        }
      } else {
        // No code block — show the remediation text instead
        vscode.commands.executeCommand('omniguard.getAIRemediation', finding);
      }
    })
  );

  // omniguard.showDashboard — webview with live data from ScanManager
  context.subscriptions.push(
    vscode.commands.registerCommand('omniguard.showDashboard', () => {
      const panel = vscode.window.createWebviewPanel(
        'omniguardDashboard',
        'OmniGuard',
        vscode.ViewColumn.One,
        { enableScripts: true }
      );

      const summary = scanManager.getSummary();
      const findings = scanManager.getFindings().slice(0, 50);
      const info = authManager.getUserInfo();
      panel.webview.html = getDashboardHtml(summary, findings, info);

      // Open web dashboard button
      panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.command === 'openDashboard') {
          const config = vscode.workspace.getConfiguration('omniguard');
          const endpoint = config.get<string>('apiEndpoint', '');
          const webUrl = endpoint.replace('/functions/v1', '').replace('https://', 'https://').replace(/\/$/, '');
          vscode.env.openExternal(vscode.Uri.parse(webUrl + '/?from=vscode'));
        } else if (msg.command === 'openFindings') {
          vscode.env.openExternal(vscode.Uri.parse(
            vscode.workspace.getConfiguration('omniguard').get<string>('apiEndpoint', '').replace('/functions/v1', '') + '/findings'
          ));
        }
      });
    })
  );

  // omniguard.openInDashboard — opens findings page in browser
  context.subscriptions.push(
    vscode.commands.registerCommand('omniguard.openInDashboard', async () => {
      const config = vscode.workspace.getConfiguration('omniguard');
      const endpoint = config.get<string>('apiEndpoint', '');
      const webUrl = endpoint.replace('/functions/v1', '').replace(/\/$/, '');
      if (!webUrl || webUrl === 'https://api.omniguard.io') {
        vscode.commands.executeCommand('omniguard.openConnectionSettings');
        return;
      }
      vscode.env.openExternal(vscode.Uri.parse(webUrl + '/findings'));
    })
  );
}

// ─── AI Remediation panel HTML ────────────────────────────────────────────────

function getRemediationHtml(finding: { title: string; file_path: string; line_start: number }, text: string): string {
  const escaped = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Convert markdown code blocks to styled pre
  const formatted = escaped
    .replace(/```(?:\w+)?\n([\s\S]*?)```/g, '<pre class="code">$1</pre>')
    .replace(/\n/g, '<br>');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{font-family:var(--vscode-font-family);background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);padding:20px;line-height:1.6}
    h2{margin:0 0 4px;font-size:16px}
    .meta{color:var(--vscode-descriptionForeground);font-size:12px;margin-bottom:16px}
    .content{white-space:pre-wrap;font-size:14px}
    .code{background:var(--vscode-textCodeBlock-background);padding:12px;border-radius:6px;font-family:monospace;font-size:12px;overflow-x:auto;white-space:pre}
  </style></head><body>
    <h2>🛡️ AI Security Fix</h2>
    <div class="meta">${finding.title} · ${finding.file_path}:${finding.line_start}</div>
    <div class="content">${formatted}</div>
  </body></html>`;
}

// ─── Dashboard webview HTML with real data ────────────────────────────────────

function getDashboardHtml(
  summary: { total: number; critical: number; high: number; medium: number; low: number; info: number },
  findings: Array<{ title: string; severity: string; file_path?: string; line_start?: number; rule_id?: string }>,
  info: { email: string; organizationName: string } | null
): string {
  const findingRows = findings.slice(0, 20).map(f => `
    <tr>
      <td><span class="badge ${f.severity}">${f.severity.toUpperCase()}</span></td>
      <td>${f.title}</td>
      <td class="mono">${f.file_path ? `${f.file_path.split('/').slice(-2).join('/')}:${f.line_start || 0}` : '—'}</td>
      <td class="rule">${f.rule_id || '—'}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body{font-family:var(--vscode-font-family);background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);padding:24px;margin:0}
    .header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}
    .logo{display:flex;align-items:center;gap:10px}
    .logo h1{font-size:20px;margin:0}
    .meta{color:var(--vscode-descriptionForeground);font-size:12px;margin-top:2px}
    .btn{padding:6px 14px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:4px;cursor:pointer;font-size:12px;margin-right:8px}
    .stats{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px}
    .stat{background:var(--vscode-editor-lineHighlightBackground);padding:14px;border-radius:8px;text-align:center}
    .stat-val{font-size:28px;font-weight:700;font-family:monospace}
    .stat-lbl{font-size:11px;color:var(--vscode-descriptionForeground);margin-top:2px}
    .critical{color:#f87171} .high{color:#fb923c} .medium{color:#facc15} .low{color:#4ade80} .info{color:#94a3b8}
    .badge{display:inline-block;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600}
    .badge.critical{background:#7f1d1d;color:#fca5a5}
    .badge.high{background:#7c2d12;color:#fdba74}
    .badge.medium{background:#78350f;color:#fcd34d}
    .badge.low{background:#14532d;color:#86efac}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{text-align:left;padding:8px 12px;background:var(--vscode-editor-lineHighlightBackground);color:var(--vscode-descriptionForeground);font-size:11px;text-transform:uppercase;letter-spacing:.05em}
    td{padding:8px 12px;border-bottom:1px solid var(--vscode-editorGroup-border)}
    .mono{font-family:monospace;font-size:11px;color:var(--vscode-descriptionForeground)}
    .rule{font-family:monospace;font-size:10px;color:var(--vscode-descriptionForeground)}
    h2{font-size:14px;margin:0 0 12px;color:var(--vscode-descriptionForeground)}
    .empty{text-align:center;padding:32px;color:var(--vscode-descriptionForeground)}
  </style></head>
  <body>
    <div class="header">
      <div class="logo">
        <span style="font-size:22px">🛡️</span>
        <div>
          <h1>OmniGuard</h1>
          <div class="meta">${info ? `${info.organizationName || info.email} · ` : ''}${summary.total} findings in open workspace</div>
        </div>
      </div>
      <div>
        <button class="btn" onclick="postMsg('openFindings')">View All Findings</button>
        <button class="btn" onclick="postMsg('openDashboard')">Open Web Dashboard</button>
      </div>
    </div>

    <div class="stats">
      <div class="stat"><div class="stat-val critical">${summary.critical}</div><div class="stat-lbl">Critical</div></div>
      <div class="stat"><div class="stat-val high">${summary.high}</div><div class="stat-lbl">High</div></div>
      <div class="stat"><div class="stat-val medium">${summary.medium}</div><div class="stat-lbl">Medium</div></div>
      <div class="stat"><div class="stat-val low">${summary.low}</div><div class="stat-lbl">Low</div></div>
      <div class="stat"><div class="stat-val info">${summary.total}</div><div class="stat-lbl">Total</div></div>
    </div>

    ${findings.length > 0 ? `
    <h2>Recent Findings</h2>
    <table>
      <thead><tr><th>Severity</th><th>Finding</th><th>Location</th><th>Rule</th></tr></thead>
      <tbody>${findingRows}</tbody>
    </table>` : `<div class="empty">✓ No findings in current workspace files</div>`}

    <script>
      const vscode = acquireVsCodeApi();
      function postMsg(cmd) { vscode.postMessage({ command: cmd }); }
    </script>
  </body></html>`;
}

export function deactivate() {
  diagnosticsManager?.dispose();
}
