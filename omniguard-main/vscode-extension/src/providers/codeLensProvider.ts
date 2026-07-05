import * as vscode from 'vscode';
import { ScanManager } from '../scanManager';

export class CodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(private scanManager: ScanManager) {}

  provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    const findings = this.scanManager.getFindingsForFile(document.uri.fsPath);

    // Show total findings count at the top of the file
    const topRange = new vscode.Range(0, 0, 0, 0);
    const count = findings.length;
    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const highCount = findings.filter(f => f.severity === 'high').length;

    const statusText = count === 0
      ? '✓ No security findings'
      : `⚠ ${count} finding${count > 1 ? 's' : ''}${criticalCount > 0 ? ` (${criticalCount} critical)` : highCount > 0 ? ` (${highCount} high)` : ''}`;

    lenses.push(new vscode.CodeLens(topRange, {
      title: statusText,
      command: '',
      tooltip: 'OmniGuard Security Scan Status'
    }));

    // Add CodeLens for each finding
    for (const finding of findings) {
      if (finding.line_start) {
        const range = new vscode.Range(
          new vscode.Position(finding.line_start - 1, 0),
          new vscode.Position(finding.line_start - 1, 100)
        );

        const icon = finding.severity === 'critical' ? '🔴' :
                     finding.severity === 'high' ? '🟠' :
                     finding.severity === 'medium' ? '🟡' : '🔵';

        lenses.push(new vscode.CodeLens(range, {
          title: `${icon} ${finding.title}`,
          command: 'omniguard.suppressFinding',
          arguments: [finding],
          tooltip: `${finding.description}\n\nClick to suppress`
        }));
      }
    }

    return lenses;
  }

  resolveCodeLens(codeLens: vscode.CodeLens): vscode.CodeLens {
    return codeLens;
  }

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }
}
