import * as vscode from 'vscode';
import { OmniGuardClient } from './client';
import { Finding, ScanResult, Severity } from './types';

export class ScanManager {
  private client: OmniGuardClient;
  private context: vscode.ExtensionContext;
  private findings: Finding[] = [];
  private fileFindings: Map<string, Finding[]> = new Map();
  private summary = { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 };

  constructor(client: OmniGuardClient, context: vscode.ExtensionContext) {
    this.client = client;
    this.context = context;
  }

  async scanFile(filePath: string, content: string): Promise<ScanResult> {
    const result = await this.client.scanFile(filePath, content);

    // Update stored findings
    this.fileFindings.set(filePath, result.findings);
    this.updateSummary();

    // Trigger diagnostics update
    const config = vscode.workspace.getConfiguration('omniguard');
    if (config.get<boolean>('showInlineDiagnostics')) {
      // Notify diagnostics manager (if available)
      vscode.commands.executeCommand('omniguard.diagnosticsUpdated', filePath, result.findings);
    }

    return result;
  }

  async scanWorkspace(
    workspacePath: string,
    progress?: (scanned: number, total: number) => void
  ): Promise<ScanResult> {
    // Get all files
    const files = await this.getWorkspaceFiles(workspacePath);
    const allFindings: Finding[] = [];

    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];
      try {
        const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
        const textContent = Buffer.from(content).toString('utf-8');

        const result = await this.client.scanFile(filePath, textContent);
        this.fileFindings.set(filePath, result.findings);
        allFindings.push(...result.findings);

        if (progress) {
          progress(i + 1, files.length);
        }
      } catch (error) {
        console.error(`Failed to scan ${filePath}:`, error);
      }
    }

    this.findings = allFindings;
    this.updateSummary();

    return {
      findings: allFindings,
      summary: this.summary
    };
  }

  async suppressFinding(findingId: string, reason: string): Promise<void> {
    await this.client.suppressFinding(findingId, reason);

    // Update local state
    for (const [path, findings] of this.fileFindings) {
      const index = findings.findIndex(f => f.id === findingId);
      if (index !== -1) {
        findings[index].status = 'suppressed';
        this.fileFindings.set(path, findings);
        break;
      }
    }

    this.updateSummary();
  }

  private async getWorkspaceFiles(workspacePath: string): Promise<string[]> {
    const files: string[] = [];

    const config = vscode.workspace.getConfiguration('omniguard');
    const excludePatterns = config.get<string[]>('excludePatterns') || [];
    const enabledScanners = config.get<string[]>('enabledScanners') || ['secret', 'sast', 'iac'];

    const extensions = this.getExtensionsForScanners(enabledScanners);
    const includePattern = `{${extensions.join(',')}}`;

    await vscode.workspace.findFiles(includePattern, '**/node_modules/**')
      .then(uris => {
        uris.forEach(uri => {
          if (!excludePatterns.some(p => uri.fsPath.includes(p.replace('**/', '')))) {
            files.push(uri.fsPath);
          }
        });
      });

    return files;
  }

  private getExtensionsForScanners(scanners: string[]): string[] {
    const extensions: string[] = [];

    if (scanners.includes('secret')) {
      extensions.push('**/*');
    }

    if (scanners.includes('sast')) {
      extensions.push('**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx', '**/*.py', '**/*.java', '**/*.go', '**/*.rb', '**/*.php');
    }

    if (scanners.includes('iac')) {
      extensions.push('**/*.tf', '**/*.hcl', '**/*.yaml', '**/*.yml', '**/Dockerfile', '**/docker-compose.yml', '**/cloudformation.yaml');
    }

    if (scanners.includes('dependency')) {
      extensions.push('**/package.json', '**/requirements.txt', '**/Cargo.toml', '**/go.mod', '**/pom.xml');
    }

    return [...new Set(extensions)];
  }

  getFindings(): Finding[] {
    return this.findings;
  }

  getFindingsForFile(filePath: string): Finding[] {
    return this.fileFindings.get(filePath) || [];
  }

  getSummary(): { total: number; critical: number; high: number; medium: number; low: number; info: number } {
    return this.summary;
  }

  private updateSummary(): void {
    const allFindings = Array.from(this.fileFindings.values()).flat();

    this.summary = {
      total: allFindings.length,
      critical: allFindings.filter(f => f.severity === 'critical' && f.status !== 'suppressed').length,
      high: allFindings.filter(f => f.severity === 'high' && f.status !== 'suppressed').length,
      medium: allFindings.filter(f => f.severity === 'medium' && f.status !== 'suppressed').length,
      low: allFindings.filter(f => f.severity === 'low' && f.status !== 'suppressed').length,
      info: allFindings.filter(f => f.severity === 'info' && f.status !== 'suppressed').length
    };

    this.findings = allFindings.sort((a, b) => {
      const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
      return severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity);
    });
  }

  clear(): void {
    this.findings = [];
    this.fileFindings.clear();
    this.summary = { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  }
}
