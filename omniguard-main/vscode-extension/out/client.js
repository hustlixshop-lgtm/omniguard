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
exports.OmniGuardClient = void 0;
const vscode = __importStar(require("vscode"));
class OmniGuardClient {
    authManager;
    endpoint;
    constructor(authManager) {
        this.authManager = authManager;
        this.endpoint = vscode.workspace.getConfiguration('omniguard').get('apiEndpoint') || 'https://api.omniguard.io';
    }
    async getHeaders() {
        const token = await this.authManager.getToken();
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-API-Key': await this.authManager.getApiKey() || ''
        };
    }
    async scanFile(filePath, content) {
        try {
            const headers = await this.getHeaders();
            const response = await fetch(`${this.endpoint}/scan/file`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ filePath, content, quick: false })
            });
            if (!response.ok) {
                throw new Error(`Scan failed: ${response.statusText}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Scan failed:', error);
            // Fallback to local scanning if available
            return this.localScan(filePath, content);
        }
    }
    async quickClassify(filePath, content) {
        try {
            const headers = await this.getHeaders();
            const response = await fetch(`${this.endpoint}/scan/classify`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ filePath, content })
            });
            if (!response.ok) {
                return 'LOW'; // Default to LOW on error
            }
            const result = await response.json();
            return result.classification;
        }
        catch {
            return 'LOW';
        }
    }
    async getRemediation(findingId) {
        try {
            const headers = await this.getHeaders();
            const response = await fetch(`${this.endpoint}/findings/${findingId}/remediation`, {
                method: 'GET',
                headers
            });
            if (!response.ok) {
                return null;
            }
            return await response.json();
        }
        catch {
            return null;
        }
    }
    async suppressFinding(findingId, reason) {
        try {
            const headers = await this.getHeaders();
            const response = await fetch(`${this.endpoint}/findings/${findingId}/suppress`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ reason })
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    async localScan(filePath, content) {
        // Embedded local scanner for offline/fallback mode
        const findings = [];
        // Simple secret detection
        const secretPatterns = [
            { pattern: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g, name: 'AWS Access Key', severity: 'critical' },
            { pattern: /ghp_[A-Za-z0-9]{36}/g, name: 'GitHub Personal Access Token', severity: 'critical' },
            { pattern: /sk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}/g, name: 'OpenAI API Key', severity: 'critical' },
            { pattern: /sk-ant-[A-Za-z0-9\-_]{95}/g, name: 'Anthropic API Key', severity: 'critical' },
            { pattern: /password\s*=\s*["'][^"']{8,}["']/gi, name: 'Hardcoded Password', severity: 'high' },
        ];
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            for (const { pattern, name, severity } of secretPatterns) {
                const matches = line.matchAll(pattern);
                for (const match of matches) {
                    findings.push({
                        id: Buffer.from(`${filePath}:${i}:${match[0]}`).toString('base64').slice(0, 36),
                        scanner: 'secret',
                        category: name,
                        severity,
                        title: `${name} detected`,
                        description: `Potential ${name.toLowerCase()} found in code.`,
                        file_path: filePath,
                        line_start: i + 1,
                        line_end: i + 1,
                        rule_id: 'SECRET-LOCAL-001',
                        rule_name: name,
                        evidence: this.maskSecret(match[0]),
                        owasp: ['A07:2021'],
                        cwe: ['CWE-798'],
                        mitre: [],
                        confidence_score: 0.8,
                        false_positive_likelihood: 0.1,
                        status: 'open',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });
                }
            }
        }
        return {
            findings,
            summary: {
                total: findings.length,
                critical: findings.filter(f => f.severity === 'critical').length,
                high: findings.filter(f => f.severity === 'high').length,
                medium: findings.filter(f => f.severity === 'medium').length,
                low: findings.filter(f => f.severity === 'low').length,
                info: findings.filter(f => f.severity === 'info').length
            }
        };
    }
    maskSecret(value) {
        if (value.length <= 8) {
            return '*'.repeat(value.length);
        }
        return value.slice(0, 4) + '*'.repeat(value.length - 8) + value.slice(-4);
    }
}
exports.OmniGuardClient = OmniGuardClient;
//# sourceMappingURL=client.js.map