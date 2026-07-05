import * as vscode from 'vscode';
import { Finding, SEVERITY_ICONS, SCANNER_NAMES } from '../types';
import { ScanManager } from '../scanManager';

export class FindingsProvider implements vscode.TreeDataProvider<FindingItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<FindingItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private findings: Finding[] = [];

  constructor(
    private scanManager: ScanManager,
    private context: vscode.ExtensionContext
  ) {}

  refresh(): void {
    this.findings = this.scanManager.getFindings();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: FindingItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: FindingItem): Thenable<FindingItem[]> {
    if (element) {
      return Promise.resolve([]);
    }

    return Promise.resolve(
      this.findings.map(f => new FindingItem(f))
    );
  }
}

export class FindingItem extends vscode.TreeItem {
  constructor(public readonly finding: Finding) {
    super(finding.title, vscode.TreeItemCollapsibleState.None);

    this.contextValue = 'finding';
    this.description = `${SEVERITY_ICONS[finding.severity]} ${finding.file_path}:${finding.line_start}`;

    this.tooltip = `${finding.title}

Severity: ${finding.severity.toUpperCase()}
Scanner: ${SCANNER_NAMES[finding.scanner]}
File: ${finding.file_path}:${finding.line_start}
Rule: ${finding.rule_name}

${finding.description}

${finding.evidence ? `Evidence: ${finding.evidence}` : ''}

${finding.remediation ? `Remediation: ${finding.remediation}` : ''}`;

    this.iconPath = new vscode.ThemeIcon(
      finding.severity === 'critical' ? 'error' :
      finding.severity === 'high' ? 'warning' :
      finding.severity === 'medium' ? 'info' : 'circle-outline'
    );

    this.command = {
      command: 'vscode.open',
      title: 'Open File',
      arguments: [
        vscode.Uri.file(finding.file_path),
        {
          selection: new vscode.Range(
            new vscode.Position(finding.line_start - 1, finding.column_start || 0),
            new vscode.Position(finding.line_end - 1, finding.column_end || 100)
          )
        }
      ]
    };

    // Context menu actions
    this.contextValue += `-editable`;
  }
}
