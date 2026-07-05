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

export async function activate(context: vscode.ExtensionContext) {
  console.log('OmniGuard extension is activating...');

  // Initialize managers
  authManager = new AuthManager(context);
  client = new OmniGuardClient(authManager);
  scanManager = new ScanManager(client, context);
  diagnosticsManager = new DiagnosticsManager();

  // Register tree data providers
  findingsProvider = new FindingsProvider(scanManager, context);
  summaryProvider = new SummaryProvider(scanManager);

  vscode.window.registerTreeDataProvider('omniguard.findings', findingsProvider);
  vscode.window.registerTreeDataProvider('omniguard.summary', summaryProvider);

  // Register CodeLens provider
  const codeLensProvider = new CodeLensProvider(scanManager);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [
        { scheme: 'file', language: 'javascript' },
        { scheme: 'file', language: 'typescript' },
        { scheme: 'file', language: 'python' },
        { scheme: 'file', language: 'java' },
        { scheme: 'file', language: 'go' },
        { scheme: 'file', language: 'ruby' },
        { scheme: 'file', language: 'php' }
      ],
      codeLensProvider
    )
  );

  // Register Hover provider
  const hoverProvider = new HoverProvider(scanManager);
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      [
        { scheme: 'file', language: 'javascript' },
        { scheme: 'file', language: 'typescript' },
        { scheme: 'file', language: 'python' }
      ],
      hoverProvider
    )
  );

  // Register commands
  registerCommands(context);

  // Register file save listener for auto-scan
  const config = vscode.workspace.getConfiguration('omniguard');
  if (config.get<boolean>('scanOnSave')) {
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(async (document) => {
        if (document.uri.scheme === 'file') {
          await scanManager.scanFile(document.uri.fsPath, document.getText());
        }
      })
    );
  }

  // Register file open listener
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(async (document) => {
      if (document.uri.scheme === 'file' && config.get<boolean>('enableRealtimeScanning')) {
        // Quick classify on open
        const result = await client.quickClassify(document.uri.fsPath, document.getText());
        if (result !== 'SAFE' && result !== 'LOW') {
          await scanManager.scanFile(document.uri.fsPath, document.getText());
        }
      }
    })
  );

  // Status bar item
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(shield) OmniGuard';
  statusBarItem.tooltip = 'OmniGuard Security Scanner';
  statusBarItem.command = 'omniguard.showDashboard';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Check authentication status
  if (!authManager.isAuthenticated()) {
    const result = await vscode.window.showInformationMessage(
      'Welcome to OmniGuard! Please log in to enable security scanning.',
      'Log In',
      'Later'
    );
    if (result === 'Log In') {
      vscode.commands.executeCommand('omniguard.login');
    }
  } else {
    vscode.window.showInformationMessage('OmniGuard is active and monitoring.');
  }
}

function registerCommands(context: vscode.ExtensionContext) {
  // Scan current file
  context.subscriptions.push(
    vscode.commands.registerCommand('omniguard.scanCurrentFile', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active file to scan');
        return;
      }

      const document = editor.document;
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Scanning for security issues...',
          cancellable: false
        },
        async (progress) => {
          progress.report({ increment: 0, message: 'Running security scanners...' });
          const result = await scanManager.scanFile(document.uri.fsPath, document.getText());
          progress.report({ increment: 100, message: 'Scan complete' });

          if (result.findings.length > 0) {
            const critical = result.findings.filter(f => f.severity === 'critical').length;
            const high = result.findings.filter(f => f.severity === 'high').length;

            if (critical > 0 || high > 0) {
              vscode.window.showErrorMessage(
                `Found ${critical} critical and ${high} high severity issues!`,
                'View Findings'
              ).then(selection => {
                if (selection === 'View Findings') {
                  vscode.commands.executeCommand('workbench.panel.markers.view.focus');
                }
              });
            } else {
              vscode.window.showWarningMessage(
                `Found ${result.findings.length} security findings. Check the Problems panel.`
              );
            }
          } else {
            vscode.window.showInformationMessage('No security issues found!');
          }

          findingsProvider.refresh();
          summaryProvider.refresh();
        }
      );
    })
  );

  // Scan workspace
  context.subscriptions.push(
    vscode.commands.registerCommand('omniguard.scanWorkspace', async () => {
      if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('No workspace folder open');
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Scanning workspace for security issues...',
          cancellable: true
        },
        async (progress, token) => {
          const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
          progress.report({ increment: 0, message: 'Analyzing files...' });

          const result = await scanManager.scanWorkspace(workspaceFolder, (scanned, total) => {
            progress.report({
              increment: (scanned / total) * 100,
              message: `Scanned ${scanned} of ${total} files...`
            });
          });

          progress.report({ increment: 100, message: 'Scan complete' });

          const showSummary = () => {
            vscode.window.showInformationMessage(
              `Scan complete: ${result.findings.length} findings (${result.findings.filter(f => f.severity === 'critical').length} critical)`
            );
          };

          showSummary();
          findingsProvider.refresh();
          summaryProvider.refresh();
          diagnosticManager.refresh();

          return result;
        }
      );
    })
  );

  // Show dashboard
  context.subscriptions.push(
    vscode.commands.registerCommand('omniguard.showDashboard', () => {
      const panel = vscode.window.createWebviewPanel(
        'omniguardDashboard',
        'OmniGuard Dashboard',
        vscode.ViewColumn.One,
        { enableScripts: true }
      );

      panel.webview.html = getDashboardHtml();
    })
  );

  // Login
  context.subscriptions.push(
    vscode.commands.registerCommand('omniguard.login', async () => {
      const email = await vscode.window.showInputBox({
        prompt: 'Enter your OmniGuard email',
        placeHolder: 'email@example.com',
        validateInput: (value) => {
          if (!value || !value.includes('@')) {
            return 'Please enter a valid email address';
          }
          return null;
        }
      });

      if (!email) return;

      const password = await vscode.window.showInputBox({
        prompt: 'Enter your password',
        password: true,
        placeHolder: 'Password'
      });

      if (!password) return;

      try {
        await authManager.login(email, password);
        vscode.window.showInformationMessage('Successfully logged in to OmniGuard!');
      } catch (error) {
        vscode.window.showErrorMessage(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    })
  );

  // Logout
  context.subscriptions.push(
    vscode.commands.registerCommand('omniguard.logout', async () => {
      await authManager.logout();
      vscode.window.showInformationMessage('Logged out from OmniGuard');
    })
  );

  // Suppress finding
  context.subscriptions.push(
    vscode.commands.registerCommand('omniguard.suppressFinding', async (finding) => {
      const reason = await vscode.window.showInputBox({
        prompt: 'Enter suppression reason',
        placeHolder: 'e.g., False positive, accepted risk, etc.'
      });

      if (reason) {
        await scanManager.suppressFinding(finding.id, reason);
        findingsProvider.refresh();
        vscode.window.showInformationMessage('Finding suppressed');
      }
    })
  );

  // Quick fix - apply AI remediation
  context.subscriptions.push(
    vscode.commands.registerCommand('omniguard.applyRemediation', async (finding) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const remediation = await client.getRemediation(finding.id);
      if (remediation && remediation.fixed_code) {
        const document = editor.document;
        const line = finding.line_start - 1;

        editor.edit(editBuilder => {
          // Replace the vulnerable code with the fix
          const range = new vscode.Range(
            new vscode.Position(line, 0),
            new vscode.Position(line, document.lineAt(line).text.length)
          );
          editBuilder.replace(range, remediation.fixed_code);
        });

        vscode.window.showInformationMessage('Applied AI-suggested fix');
      }
    })
  );

  // Open in dashboard
  context.subscriptions.push(
    vscode.commands.registerCommand('omniguard.openInDashboard', async () => {
      const endpoint = vscode.workspace.getConfiguration('omniguard').get<string>('apiEndpoint');
      vscode.env.openExternal(vscode.Uri.parse(`${endpoint}/dashboard`));
    })
  );
}

function getDashboardHtml(): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>OmniGuard Dashboard</title>
      <style>
        body {
          font-family: var(--vscode-font-family);
          background: var(--vscode-editor-background);
          color: var(--vscode-editor-foreground);
          padding: 20px;
        }
        .header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
        }
        .logo {
          width: 32px;
          height: 32px;
          background: #0078d4;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        h1 {
          font-size: 24px;
          margin: 0;
        }
        .stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }
        .stat-card {
          background: var(--vscode-editor-lineHighlightBackground);
          padding: 16px;
          border-radius: 8px;
        }
        .stat-value {
          font-size: 32px;
          font-weight: 600;
          margin-bottom: 4px;
        }
        .stat-label {
          color: var(--vscode-descriptionForeground);
          font-size: 12px;
        }
        .critical { color: #f87171; }
        .high { color: #fb923c; }
        .medium { color: #facc15; }
        .low { color: #22c55e; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">🛡️</div>
        <h1>OmniGuard Dashboard</h1>
      </div>
      <div class="stats">
        <div class="stat-card">
          <div class="stat-value critical" id="critical-count">0</div>
          <div class="stat-label">Critical</div>
        </div>
        <div class="stat-card">
          <div class="stat-value high" id="high-count">0</div>
          <div class="stat-label">High</div>
        </div>
        <div class="stat-card">
          <div class="stat-value medium" id="medium-count">0</div>
          <div class="stat-label">Medium</div>
        </div>
        <div class="stat-card">
          <div class="stat-value low" id="low-count">0</div>
          <div class="stat-label">Low</div>
        </div>
      </div>
      <p>Configure your connection settings to start scanning.</p>
    </body>
    </html>
  `;
}

export function deactivate() {
  console.log('OmniGuard extension deactivated');
}
