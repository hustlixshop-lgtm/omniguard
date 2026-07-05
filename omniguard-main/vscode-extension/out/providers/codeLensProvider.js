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
exports.CodeLensProvider = void 0;
const vscode = __importStar(require("vscode"));
class CodeLensProvider {
    scanManager;
    _onDidChangeCodeLenses = new vscode.EventEmitter();
    onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
    constructor(scanManager) {
        this.scanManager = scanManager;
    }
    provideCodeLenses(document, token) {
        const lenses = [];
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
                const range = new vscode.Range(new vscode.Position(finding.line_start - 1, 0), new vscode.Position(finding.line_start - 1, 100));
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
    resolveCodeLens(codeLens) {
        return codeLens;
    }
    refresh() {
        this._onDidChangeCodeLenses.fire();
    }
}
exports.CodeLensProvider = CodeLensProvider;
//# sourceMappingURL=codeLensProvider.js.map