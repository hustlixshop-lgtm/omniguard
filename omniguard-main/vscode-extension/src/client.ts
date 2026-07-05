import * as vscode from 'vscode';
import { AuthManager } from './auth';
import { Finding, ScanResult } from './types';

export class OmniGuardClient {
  private authManager: AuthManager;
  private endpoint: string;

  constructor(authManager: AuthManager) {
    this.authManager = authManager;
    this.endpoint = vscode.workspace.getConfiguration('omniguard').get<string>('apiEndpoint') || 'https://api.omniguard.io';
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const token = await this.authManager.getToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-API-Key': await this.authManager.getApiKey() || ''
    };
  }

  async scanFile(filePath: string, content: string): Promise<ScanResult> {
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

      return await response.json() as ScanResult;
    } catch (error) {
      console.error('Scan failed:', error);
      // Fallback to local scanning if available
      return this.localScan(filePath, content);
    }
  }

  async quickClassify(filePath: string, content: string): Promise<'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'> {
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

      const result = await response.json() as { classification: string };
      return result.classification as 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    } catch {
      return 'LOW';
    }
  }

  async getRemediation(findingId: string): Promise<{ fixed_code: string; explanation: string } | null> {
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
    } catch {
      return null;
    }
  }

  async suppressFinding(findingId: string, reason: string): Promise<boolean> {
    try {
      const headers = await this.getHeaders();
      const response = await fetch(`${this.endpoint}/findings/${findingId}/suppress`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason })
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  private async localScan(filePath: string, content: string): Promise<ScanResult> {
    // Embedded local scanner for offline/fallback mode
    const findings: Finding[] = [];

    // Simple secret detection
    const secretPatterns = [
      { pattern: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g, name: 'AWS Access Key', severity: 'critical' as const },
      { pattern: /ghp_[A-Za-z0-9]{36}/g, name: 'GitHub Personal Access Token', severity: 'critical' as const },
      { pattern: /sk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}/g, name: 'OpenAI API Key', severity: 'critical' as const },
      { pattern: /sk-ant-[A-Za-z0-9\-_]{95}/g, name: 'Anthropic API Key', severity: 'critical' as const },
      { pattern: /password\s*=\s*["'][^"']{8,}["']/gi, name: 'Hardcoded Password', severity: 'high' as const },
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

  private maskSecret(value: string): string {
    if (value.length <= 8) {
      return '*'.repeat(value.length);
    }
    return value.slice(0, 4) + '*'.repeat(value.length - 8) + value.slice(-4);
  }
}
