import * as vscode from 'vscode';
import { Finding } from './types';

export class DiagnosticsManager {
  private collection: vscode.DiagnosticCollection;
  private findingMap: Map<string, Map<string, vscode.Diagnostic>> = new Map(); // filePath → findingId → diagnostic

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('omniguard');
  }

  updateDiagnostics(filePath: string, findings: Finding[]): void {
    const uri = vscode.Uri.file(filePath);
    const active = findings.filter(f => f.status !== 'suppressed' && f.status !== 'resolved' && f.status !== 'false_positive');

    if (active.length === 0) {
      this.collection.delete(uri);
      this.findingMap.delete(filePath);
      return;
    }

    const fileMap = new Map<string, vscode.Diagnostic>();
    const diagnostics: vscode.Diagnostic[] = [];

    for (const finding of active) {
      const d = this.createDiagnostic(finding);
      diagnostics.push(d);
      fileMap.set(finding.id, d);
    }

    this.collection.set(uri, diagnostics);
    this.findingMap.set(filePath, fileMap);
  }

  clearForFinding(findingId: string): void {
    // Remove one finding's diagnostic without clearing the whole file
    for (const [filePath, fileMap] of this.findingMap) {
      if (fileMap.has(findingId)) {
        fileMap.delete(findingId);
        const uri = vscode.Uri.file(filePath);
        const remaining = Array.from(fileMap.values());
        if (remaining.length === 0) {
          this.collection.delete(uri);
          this.findingMap.delete(filePath);
        } else {
          this.collection.set(uri, remaining);
        }
        return;
      }
    }
  }

  refresh(): void {
    // Re-emit all diagnostics (forces VS Code to re-render the Problems panel)
    for (const [filePath, fileMap] of this.findingMap) {
      const uri = vscode.Uri.file(filePath);
      this.collection.set(uri, Array.from(fileMap.values()));
    }
  }

  clear(): void {
    this.collection.clear();
    this.findingMap.clear();
  }

  dispose(): void {
    this.collection.dispose();
  }

  private createDiagnostic(finding: Finding): vscode.Diagnostic {
    const line = Math.max(0, (finding.line_start || 1) - 1);
    const endLine = Math.max(line, (finding.line_end || finding.line_start || 1) - 1);
    const range = new vscode.Range(
      new vscode.Position(line, 0),
      new vscode.Position(endLine, Number.MAX_SAFE_INTEGER)
    );

    const message = [
      `[${finding.rule_id || finding.scanner.toUpperCase()}] ${finding.title}`,
      finding.evidence ? `Evidence: ${finding.evidence}` : null,
    ].filter(Boolean).join(' · ');

    const diagnostic = new vscode.Diagnostic(range, message, this.mapSeverity(finding.severity));

    diagnostic.source = `OmniGuard (${finding.scanner})`;
    diagnostic.code = {
      value: finding.rule_id || finding.scanner,
      target: vscode.Uri.parse(`https://cwe.mitre.org/data/definitions/${(finding.cwe?.[0] || '').replace('CWE-', '')}.html`),
    };

    if (finding.owasp?.length) {
      diagnostic.tags = finding.severity === 'info' ? [vscode.DiagnosticTag.Hint] : [];
    }

    const related: vscode.DiagnosticRelatedInformation[] = [];
    if (finding.remediation) {
      related.push(new vscode.DiagnosticRelatedInformation(
        new vscode.Location(vscode.Uri.file(finding.file_path || ''), range),
        `Fix: ${finding.remediation.slice(0, 100)}`
      ));
    }
    if (finding.owasp?.length) {
      related.push(new vscode.DiagnosticRelatedInformation(
        new vscode.Location(vscode.Uri.file(finding.file_path || ''), range),
        `OWASP: ${finding.owasp.join(', ')}`
      ));
    }
    if (related.length) diagnostic.relatedInformation = related;

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
      default:
        return vscode.DiagnosticSeverity.Hint;
    }
  }
}
