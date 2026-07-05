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
exports.ScanManager = void 0;
const vscode = __importStar(require("vscode"));
class ScanManager {
    client;
    context;
    findings = [];
    fileFindings = new Map();
    summary = { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    constructor(client, context) {
        this.client = client;
        this.context = context;
    }
    async scanFile(filePath, content) {
        const result = await this.client.scanFile(filePath, content);
        // Update stored findings
        this.fileFindings.set(filePath, result.findings);
        this.updateSummary();
        // Trigger diagnostics update
        const config = vscode.workspace.getConfiguration('omniguard');
        if (config.get('showInlineDiagnostics')) {
            // Notify diagnostics manager (if available)
            vscode.commands.executeCommand('omniguard.diagnosticsUpdated', filePath, result.findings);
        }
        return result;
    }
    async scanWorkspace(workspacePath, progress) {
        // Get all files
        const files = await this.getWorkspaceFiles(workspacePath);
        const allFindings = [];
        for (let i = 0; i < files.length; i++) {
            const filePath = files[i];
            try {
                const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
                const textContent = Buffer.from(content).toString('utf-8');
                const result = await this.client.scanFile(filePath, textContent);
                this.fileFindings.set(filePath, result.findings);
                allFindings.push(...result.findings);
                if (progress) {
                    progress(i + 1, files.length);
                }
            }
            catch (error) {
                console.error(`Failed to scan ${filePath}:`, error);
            }
        }
        this.findings = allFindings;
        this.updateSummary();
        return {
            findings: allFindings,
            summary: this.summary
        };
    }
    async suppressFinding(findingId, reason) {
        await this.client.suppressFinding(findingId, reason);
        // Update local state
        for (const [path, findings] of this.fileFindings) {
            const index = findings.findIndex(f => f.id === findingId);
            if (index !== -1) {
                findings[index].status = 'suppressed';
                this.fileFindings.set(path, findings);
                break;
            }
        }
        this.updateSummary();
    }
    async getWorkspaceFiles(workspacePath) {
        const files = [];
        const config = vscode.workspace.getConfiguration('omniguard');
        const excludePatterns = config.get('excludePatterns') || [];
        const enabledScanners = config.get('enabledScanners') || ['secret', 'sast', 'iac'];
        const extensions = this.getExtensionsForScanners(enabledScanners);
        const includePattern = `{${extensions.join(',')}}`;
        await vscode.workspace.findFiles(includePattern, '**/node_modules/**')
            .then(uris => {
            uris.forEach(uri => {
                if (!excludePatterns.some(p => uri.fsPath.includes(p.replace('**/', '')))) {
                    files.push(uri.fsPath);
                }
            });
        });
        return files;
    }
    getExtensionsForScanners(scanners) {
        const extensions = [];
        if (scanners.includes('secret')) {
            extensions.push('**/*');
        }
        if (scanners.includes('sast')) {
            extensions.push('**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx', '**/*.py', '**/*.java', '**/*.go', '**/*.rb', '**/*.php');
        }
        if (scanners.includes('iac')) {
            extensions.push('**/*.tf', '**/*.hcl', '**/*.yaml', '**/*.yml', '**/Dockerfile', '**/docker-compose.yml', '**/cloudformation.yaml');
        }
        if (scanners.includes('dependency')) {
            extensions.push('**/package.json', '**/requirements.txt', '**/Cargo.toml', '**/go.mod', '**/pom.xml');
        }
        return [...new Set(extensions)];
    }
    getFindings() {
        return this.findings;
    }
    getFindingsForFile(filePath) {
        return this.fileFindings.get(filePath) || [];
    }
    getSummary() {
        return this.summary;
    }
    updateSummary() {
        const allFindings = Array.from(this.fileFindings.values()).flat();
        this.summary = {
            total: allFindings.length,
            critical: allFindings.filter(f => f.severity === 'critical' && f.status !== 'suppressed').length,
            high: allFindings.filter(f => f.severity === 'high' && f.status !== 'suppressed').length,
            medium: allFindings.filter(f => f.severity === 'medium' && f.status !== 'suppressed').length,
            low: allFindings.filter(f => f.severity === 'low' && f.status !== 'suppressed').length,
            info: allFindings.filter(f => f.severity === 'info' && f.status !== 'suppressed').length
        };
        this.findings = allFindings.sort((a, b) => {
            const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];
            return severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity);
        });
    }
    clear() {
        this.findings = [];
        this.fileFindings.clear();
        this.summary = { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    }
}
exports.ScanManager = ScanManager;
//# sourceMappingURL=scanManager.js.map