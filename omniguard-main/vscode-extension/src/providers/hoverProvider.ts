import * as vscode from 'vscode';
import { ScanManager } from '../scanManager';
import { Finding, SEVERITY_ICONS } from '../types';

export class HoverProvider implements vscode.HoverProvider {
  constructor(private scanManager: ScanManager) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.Hover | undefined {
    const findings = this.scanManager.getFindingsForFile(document.uri.fsPath);
    const line = position.line + 1;

    const findingsAtLine = findings.filter(f =>
      f.line_start <= line && (f.line_end || f.line_start) >= line
    );

    if (findingsAtLine.length === 0) {
      return undefined;
    }

    const contents = findingsAtLine.map(f => this.formatFindingHover(f)).join('\n\n---\n\n');
    return new vscode.Hover(new vscode.MarkdownString(contents));
  }

  private formatFindingHover(finding: Finding): string {
    const icon = SEVERITY_ICONS[finding.severity];

    let content = `## ${icon} ${finding.title}

**Severity:** ${finding.severity.toUpperCase()}
**Scanner:** ${finding.scanner}
**Rule:** \`${finding.rule_id}\` - ${finding.rule_name}

${finding.description}`;

    if (finding.evidence) {
      content += `

\`\`\`
${finding.evidence}
\`\`\``;
    }

    if (finding.remediation) {
      content += `

**Remediation:**
${finding.remediation}`;
    }

    if (finding.ai_remediation) {
      content += `

**AI Suggested Fix:**
\`\`\`
${finding.ai_remediation}
\`\`\``;
    }

    if (finding.owasp.length > 0) {
      content += `

**OWASP:** ${finding.owasp.join(', ')}`;
    }

    if (finding.cwe.length > 0) {
      content += `

**CWE:** ${finding.cwe.join(', ')}`;
    }

    return content;
  }
}
