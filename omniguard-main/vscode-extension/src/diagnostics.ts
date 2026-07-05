import * as vscode from 'vscode';
import { Finding } from './types';

export class DiagnosticsManager {
  private diagnosticCollection: vscode.DiagnosticCollection;

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('omniguard');
  }

  updateDiagnostics(uri: vscode.Uri, findings: Finding[]): void {
    const diagnostics = findings.map(f => this.createDiagnostic(f));
    this.diagnosticCollection.set(uri, diagnostics);
  }

  clearDiagnostics(uri: vscode.Uri): void {
    this.diagnosticCollection.delete(uri);
  }

  clearAll(): void {
    this.diagnosticCollection.clear();
  }

  private createDiagnostic(finding: Finding): vscode.Diagnostic {
    const range = new vscode.Range(
      new vscode.Position((finding.line_start || 1) - 1, finding.column_start || 0),
      new vscode.Position((finding.line_end || finding.line_start || 1) - 1, finding.column_end || 100)
    );

    const diagnostic = new vscode.Diagnostic(
      range,
      `[OmniGuard] ${finding.title}`,
      this.mapSeverity(finding.severity)
    );

    diagnostic.source = 'OmniGuard';
    diagnostic.code = finding.rule_id;
    diagnostic.relatedInformation = [];

    if (finding.description) {
      diagnostic.message += `\n${finding.description}`;
    }

    if (finding.remediation) {
      diagnostic.relatedInformation.push(
        new vscode.DiagnosticRelatedInformation(
          new vscode.Location(vscode.Uri.file(finding.file_path), range),
          `Remediation: ${finding.remediation}`
        )
      );
    }

    return diagnostic;
  }

  private mapSeverity(severity: string): vscode.DiagnosticSeverity {
    switch (severity) {
      case 'critical':
      case 'high':
        return vscode.DiagnosticSeverity.Error;
      case 'medium':
        return vscode.DiagnosticSeverity.Warning;
      case 'low':
        return vscode.DiagnosticSeverity.Information;
      case 'info':
      default:
        return vscode.DiagnosticSeverity.Hint;
    }
  }

  dispose(): void {
    this.diagnosticCollection.dispose();
  }
}
