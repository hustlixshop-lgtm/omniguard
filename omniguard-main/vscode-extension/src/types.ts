export interface Finding {
  id: string;
  scanner: ScannerType;
  category: string;
  severity: Severity;
  title: string;
  description: string;
  evidence?: string;
  file_path: string;
  line_start: number;
  line_end: number;
  column_start?: number;
  column_end?: number;
  rule_id: string;
  rule_name: string;
  owasp: string[];
  cwe: string[];
  mitre: string[];
  cvss_score?: number;
  cve_id?: string;
  package_name?: string;
  package_version?: string;
  package_fixed_version?: string;
  remediation?: string;
  ai_summary?: string;
  ai_remediation?: string;
  confidence_score: number;
  false_positive_likelihood: number;
  status: 'open' | 'assigned' | 'in_progress' | 'resolved' | 'suppressed' | 'false_positive';
  created_at: string;
  updated_at: string;
}

export type ScannerType = 'secret' | 'dependency' | 'sast' | 'iac' | 'container' | 'license' | 'policy' | 'ai';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface ScanResult {
  findings: Finding[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

export interface ScanOptions {
  enabledScanners: ScannerType[];
  excludePatterns: string[];
  failOn: Severity;
  aiEnabled: boolean;
  aiModel: 'haiku' | 'sonnet' | 'opus';
}

export interface AuthState {
  isAuthenticated: boolean;
  email?: string;
  organizationId?: string;
  organizationName?: string;
  role?: 'owner' | 'admin' | 'engineer' | 'developer' | 'auditor';
}

export const SEVERITY_ICONS: Record<Severity, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
  info: '⚪'
};

export const SCANNER_NAMES: Record<ScannerType, string> = {
  secret: 'Secret Detection',
  dependency: 'Dependency Scanner',
  sast: 'Static Analysis',
  iac: 'Infrastructure as Code',
  container: 'Container Scanner',
  license: 'License Checker',
  policy: 'Policy Engine',
  ai: 'AI Analysis'
};
