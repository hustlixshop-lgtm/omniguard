import * as vscode from 'vscode';
import { AuthManager } from './auth';
import { Finding, ScanResult } from './types';

export class OmniGuardClient {
  private authManager: AuthManager;
  private endpoint: string;

  constructor(authManager: AuthManager) {
    this.authManager = authManager;
    // endpoint should be the Supabase functions URL, e.g.:
    // https://your-project.supabase.co/functions/v1
    this.endpoint = vscode.workspace.getConfiguration('omniguard').get<string>('apiEndpoint') || '';
  }

  private async getHeaders(): Promise<Record<string, string>> {
    let token: string | undefined;
    try {
      token = await this.authManager.getToken();
    } catch {
      // Not authenticated — try API key only
    }
    const apiKey = await this.authManager.getApiKey();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    else if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    return headers;
  }

  async scanFile(filePath: string, content: string): Promise<ScanResult> {
    if (!this.endpoint) return this.localScan(filePath, content);

    try {
      const headers = await this.getHeaders();
      const response = await fetch(`${this.endpoint}/scan-quick`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ path: filePath, content, ai: false }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json() as {
        findings: Finding[];
        summary: ScanResult['summary'];
      };
      return { findings: data.findings || [], summary: data.summary || { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 } };
    } catch (error) {
      console.error('Remote scan failed, using local scanner:', error);
      return this.localScan(filePath, content);
    }
  }

  async quickClassify(filePath: string, content: string): Promise<'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'> {
    if (!this.endpoint) return 'LOW';

    try {
      const headers = await this.getHeaders();
      const response = await fetch(`${this.endpoint}/scan-quick`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ path: filePath, content, ai: false }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) return 'LOW';

      const result = await response.json() as { classification: string };
      return (result.classification as 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') || 'LOW';
    } catch {
      return 'LOW';
    }
  }

  async getRemediation(findingId: string): Promise<{ ai_remediation: string | null; remediation: string | null } | null> {
    if (!this.endpoint) return null;

    try {
      const headers = await this.getHeaders();
      const response = await fetch(`${this.endpoint}/api-v1-findings/${findingId}/ai-remediation`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) return null;
      const result = await response.json() as { data: { ai_remediation: string | null; remediation: string | null } };
      return result.data || null;
    } catch {
      return null;
    }
  }

  async suppressFinding(findingId: string, reason: string): Promise<boolean> {
    if (!this.endpoint) return false;

    try {
      const headers = await this.getHeaders();
      const response = await fetch(`${this.endpoint}/api-v1-findings/${findingId}/suppress`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason }),
        signal: AbortSignal.timeout(10_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async localScan(filePath: string, content: string): Promise<ScanResult> {
    const findings: Finding[] = [];

    const secretPatterns: Array<{ pattern: RegExp; name: string; severity: 'critical' | 'high' | 'medium' | 'low' | 'info' }> = [
      { pattern: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g, name: 'AWS Access Key', severity: 'critical' },
      { pattern: /gh[pousr]_[A-Za-z0-9]{36}/g, name: 'GitHub PAT', severity: 'critical' },
      { pattern: /sk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}/g, name: 'OpenAI API Key', severity: 'critical' },
      { pattern: /sk-ant-[A-Za-z0-9\-_]{95}/g, name: 'Anthropic API Key', severity: 'critical' },
      { pattern: /(?:password|passwd|pwd)\s*[:=]\s*["']([^"'\s]{8,})["']/gi, name: 'Hardcoded Password', severity: 'high' },
    ];

    const lines = content.split('\n');
    for (const { pattern, name, severity } of secretPatterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        const lineContent = lines[lineNum - 1]?.trim() || '';
        if (/^\s*(\/\/|#|\*)/.test(lineContent)) continue;

        findings.push({
          id: Buffer.from(`${filePath}:${lineNum}:${name}`).toString('base64').slice(0, 36),
          scanner: 'secret',
          category: name,
          severity,
          title: `${name} detected`,
          description: `Potential ${name.toLowerCase()} found in source code.`,
          file_path: filePath,
          line_start: lineNum,
          line_end: lineNum,
          rule_id: 'SECRET-LOCAL',
          rule_name: name,
          evidence: match[0].slice(0, 4) + '****' + match[0].slice(-4),
          owasp: ['A07:2021'],
          cwe: ['CWE-798'],
          mitre: [],
          confidence_score: 0.8,
          false_positive_likelihood: 0.1,
          status: 'open',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }

    return {
      findings,
      summary: {
        total: findings.length,
        critical: findings.filter((f) => f.severity === 'critical').length,
        high: findings.filter((f) => f.severity === 'high').length,
        medium: findings.filter((f) => f.severity === 'medium').length,
        low: findings.filter((f) => f.severity === 'low').length,
        info: findings.filter((f) => f.severity === 'info').length,
      },
    };
  }
}
