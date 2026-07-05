import * as vscode from 'vscode';
import { OmniGuardClient } from './client';
import { DiagnosticsManager } from './diagnostics';
import { Finding, ScanResult, Severity } from './types';

export class ScanManager {
  private client: OmniGuardClient;
  private context: vscode.ExtensionContext;
  private diagnosticsManager: DiagnosticsManager | null = null;
  private findings: Finding[] = [];
  private fileFindings: Map<string, Finding[]> = new Map();
  private summary = { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 };

  constructor(client: OmniGuardClient, _diagnosticsManager: DiagnosticsManager | null, context: vscode.ExtensionContext) {
    this.client = client;
    this.context = context;
  }

  setDiagnosticsManager(dm: DiagnosticsManager): void {
    this.diagnosticsManager = dm;
  }

  async scanFile(filePath: string, content: string): Promise<ScanResult> {
    const result = await this.client.scanFile(filePath, content);

    this.fileFindings.set(filePath, result.findings);
    this.updateSummary();

    // Wire findings directly into VS Code's Problems panel
    const config = vscode.workspace.getConfiguration('omniguard');
    if (config.get<boolean>('showInlineDiagnostics', true) && this.diagnosticsManager) {
      this.diagnosticsManager.updateDiagnostics(filePath, result.findings);
    }

    return result;
  }

  async scanWorkspace(
    workspacePath: string,
    progress?: (scanned: number, total: number) => void
  ): Promise<ScanResult> {
    const files = await this.getWorkspaceFiles();
    const allFindings: Finding[] = [];

    // Clear diagnostics for a fresh workspace scan
    this.diagnosticsManager?.clear();

    for (let i = 0; i < files.length; i++) {
      try {
        const content = await vscode.workspace.fs.readFile(vscode.Uri.file(files[i]));
        const textContent = Buffer.from(content).toString('utf-8');
        const result = await this.client.scanFile(files[i], textContent);

        this.fileFindings.set(files[i], result.findings);
        allFindings.push(...result.findings);

        // Populate Problems panel per-file as we go
        if (this.diagnosticsManager) {
          this.diagnosticsManager.updateDiagnostics(files[i], result.findings);
        }

        if (progress) progress(i + 1, files.length);
      } catch (err) {
        console.error(`OmniGuard: Failed to scan ${files[i]}:`, err);
      }
    }

    this.findings = allFindings;
    this.updateSummary();
    this.diagnosticsManager?.refresh();

    return { findings: allFindings, summary: this.summary };
  }

  async suppressFinding(findingId: string, reason: string): Promise<void> {
    await this.client.suppressFinding(findingId, reason);

    for (const [path, fileFindings] of this.fileFindings) {
      const idx = fileFindings.findIndex(f => f.id === findingId);
      if (idx !== -1) {
        fileFindings[idx] = { ...fileFindings[idx], status: 'suppressed' };
        this.fileFindings.set(path, fileFindings);
        // Re-render diagnostics for the file (removes the suppressed squiggle)
        if (this.diagnosticsManager) {
          this.diagnosticsManager.updateDiagnostics(path, fileFindings.filter(f => f.status !== 'suppressed'));
        }
        break;
      }
    }
    this.updateSummary();
  }

  private async getWorkspaceFiles(): Promise<string[]> {
    const config = vscode.workspace.getConfiguration('omniguard');
    const excludePatterns = config.get<string[]>('excludePatterns', []);
    const enabledScanners = config.get<string[]>('enabledScanners', ['secret', 'sast', 'iac']);

    const allExcludes = [
      '**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**',
      '**/.next/**', '**/__pycache__/**', '**/vendor/**', '**/coverage/**',
      ...excludePatterns,
    ];
    const excludeGlob = `{${allExcludes.join(',')}}`;

    // Build include pattern based on enabled scanners
    const includePatterns: string[] = [];
    if (enabledScanners.includes('secret')) {
      includePatterns.push('**/.env*', '**/*.key', '**/*.pem', '**/*.p12');
    }
    if (enabledScanners.includes('sast') || enabledScanners.includes('secret')) {
      includePatterns.push('**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx', '**/*.py',
        '**/*.java', '**/*.go', '**/*.rb', '**/*.php', '**/*.cs', '**/*.rs',
        '**/*.c', '**/*.cpp', '**/*.sh', '**/*.bash', '**/*.sql');
    }
    if (enabledScanners.includes('iac')) {
      includePatterns.push('**/*.tf', '**/*.hcl', '**/*.yaml', '**/*.yml',
        '**/Dockerfile', '**/docker-compose.yml');
    }
    if (enabledScanners.includes('dependency')) {
      includePatterns.push('**/package.json', '**/requirements.txt', '**/Cargo.toml', '**/go.mod');
    }

    const pattern = includePatterns.length > 0
      ? `{${[...new Set(includePatterns)].join(',')}}`
      : '**/*.{js,ts,py,go,java,rb}';

    const uris = await vscode.workspace.findFiles(pattern, excludeGlob, 200);
    return uris.map(u => u.fsPath);
  }

  getFindings(): Finding[] { return this.findings; }
  getFindingsForFile(filePath: string): Finding[] { return this.fileFindings.get(filePath) || []; }
  getSummary() { return this.summary; }

  private updateSummary(): void {
    const all = Array.from(this.fileFindings.values()).flat().filter(f => f.status !== 'suppressed');
    this.summary = {
      total: all.length,
      critical: all.filter(f => f.severity === 'critical').length,
      high: all.filter(f => f.severity === 'high').length,
      medium: all.filter(f => f.severity === 'medium').length,
      low: all.filter(f => f.severity === 'low').length,
      info: all.filter(f => f.severity === 'info').length,
    };
    const order: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
    this.findings = all.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  }

  clear(): void {
    this.findings = [];
    this.fileFindings.clear();
    this.summary = { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    this.diagnosticsManager?.clear();
  }
}
