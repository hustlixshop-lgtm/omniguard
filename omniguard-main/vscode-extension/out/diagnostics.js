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
exports.DiagnosticsManager = void 0;
const vscode = __importStar(require("vscode"));
class DiagnosticsManager {
    diagnosticCollection;
    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('omniguard');
    }
    updateDiagnostics(uri, findings) {
        const diagnostics = findings.map(f => this.createDiagnostic(f));
        this.diagnosticCollection.set(uri, diagnostics);
    }
    clearDiagnostics(uri) {
        this.diagnosticCollection.delete(uri);
    }
    clearAll() {
        this.diagnosticCollection.clear();
    }
    createDiagnostic(finding) {
        const range = new vscode.Range(new vscode.Position((finding.line_start || 1) - 1, finding.column_start || 0), new vscode.Position((finding.line_end || finding.line_start || 1) - 1, finding.column_end || 100));
        const diagnostic = new vscode.Diagnostic(range, `[OmniGuard] ${finding.title}`, this.mapSeverity(finding.severity));
        diagnostic.source = 'OmniGuard';
        diagnostic.code = finding.rule_id;
        diagnostic.relatedInformation = [];
        if (finding.description) {
            diagnostic.message += `\n${finding.description}`;
        }
        if (finding.remediation) {
            diagnostic.relatedInformation.push(new vscode.DiagnosticRelatedInformation(new vscode.Location(vscode.Uri.file(finding.file_path), range), `Remediation: ${finding.remediation}`));
        }
        return diagnostic;
    }
    mapSeverity(severity) {
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
    dispose() {
        this.diagnosticCollection.dispose();
    }
}
exports.DiagnosticsManager = DiagnosticsManager;
//# sourceMappingURL=diagnostics.js.map