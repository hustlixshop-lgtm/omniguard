import * as vscode from 'vscode';
import { ScanManager } from '../scanManager';

export class SummaryProvider implements vscode.TreeDataProvider<SummaryItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SummaryItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private scanManager: ScanManager) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SummaryItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SummaryItem): Thenable<SummaryItem[]> {
    if (element) {
      return Promise.resolve([]);
    }

    const summary = this.scanManager.getSummary();

    return Promise.resolve([
      new SummaryItem('🔴 Critical', summary.critical.toString(), 'critical'),
      new SummaryItem('🟠 High', summary.high.toString(), 'high'),
      new SummaryItem('🟡 Medium', summary.medium.toString(), 'medium'),
      new SummaryItem('🔵 Low', summary.low.toString(), 'low'),
      new SummaryItem('⚪ Info', summary.info.toString(), 'info'),
      new SummaryItem('', '', 'spacer'),
      new SummaryItem('Total', summary.total.toString(), 'total'),
    ]);
  }
}

export class SummaryItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly count: string,
    public readonly type: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);

    this.description = count;
    this.contextValue = 'summary';

    if (type === 'spacer') {
      this.label = '─'.repeat(20);
    }

    if (type === 'total') {
      this.iconPath = new vscode.ThemeIcon('graph');
    }
  }
}
