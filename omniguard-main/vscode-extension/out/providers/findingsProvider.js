"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindingItem = exports.FindingsProvider = void 0;
const vscode = __importStar(require("vscode"));
const types_1 = require("../types");
class FindingsProvider {
    scanManager;
    context;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    findings = [];
    constructor(scanManager, context) {
        this.scanManager = scanManager;
        this.context = context;
    }
    refresh() {
        this.findings = this.scanManager.getFindings();
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element) {
            return Promise.resolve([]);
        }
        return Promise.resolve(this.findings.map(f => new FindingItem(f)));
    }
}
exports.FindingsProvider = FindingsProvider;
class FindingItem extends vscode.TreeItem {
    finding;
    constructor(finding) {
        super(finding.title, vscode.TreeItemCollapsibleState.None);
        this.finding = finding;
        this.contextValue = 'finding';
        this.description = `${types_1.SEVERITY_ICONS[finding.severity]} ${finding.file_path}:${finding.line_start}`;
        this.tooltip = `${finding.title}

Severity: ${finding.severity.toUpperCase()}
Scanner: ${types_1.SCANNER_NAMES[finding.scanner]}
File: ${finding.file_path}:${finding.line_start}
Rule: ${finding.rule_name}

${finding.description}

${finding.evidence ? `Evidence: ${finding.evidence}` : ''}

${finding.remediation ? `Remediation: ${finding.remediation}` : ''}`;
        this.iconPath = new vscode.ThemeIcon(finding.severity === 'critical' ? 'error' :
            finding.severity === 'high' ? 'warning' :
                finding.severity === 'medium' ? 'info' : 'circle-outline');
        this.command = {
            command: 'vscode.open',
            title: 'Open File',
            arguments: [
                vscode.Uri.file(finding.file_path),
                {
                    selection: new vscode.Range(new vscode.Position(finding.line_start - 1, finding.column_start || 0), new vscode.Position(finding.line_end - 1, finding.column_end || 100))
                }
            ]
        };
        // Context menu actions
        this.contextValue += `-editable`;
    }
}
exports.FindingItem = FindingItem;
//# sourceMappingURL=findingsProvider.js.map