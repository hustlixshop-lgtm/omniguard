import { useState } from 'react'
import { useFindings } from '../hooks/useRepositories'
import { useAuth } from '../hooks/useAuth'
import {
  AlertTriangle,
  Filter,
  Search,
  User,
  CheckCircle,
  Ban,
  RefreshCw,
  ChevronDown,
  FileCode,
  Clock
} from 'lucide-react'

const severityOrder = ['critical', 'high', 'medium', 'low', 'info']
const statusOptions = ['open', 'assigned', 'in_progress', 'resolved', 'suppressed', 'false_positive']
const scannerOptions = ['secret', 'dependency', 'iac', 'container', 'license', 'sast']

export function Findings() {
  const { currentOrganizationId, user } = useAuth()
  const [filters, setFilters] = useState({
    severity: '',
    status: '',
    scanner: ''
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [selectedFinding, setSelectedFinding] = useState<string | null>(null)

  const { findings, loading, error, totalCount, resolveFinding, assignFinding } = useFindings(
    currentOrganizationId,
    filters
  )

  const filteredFindings = findings.filter(f =>
    f.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.file_path?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const sortedFindings = [...filteredFindings].sort((a, b) => {
    const severityDiff = severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity)
    if (severityDiff !== 0) return severityDiff
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const handleResolve = async (findingId: string, resolve: boolean) => {
    await resolveFinding(findingId, resolve ? 'Resolved from dashboard' : undefined)
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="card p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-danger-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-secondary-100 mb-2">Failed to Load Findings</h2>
          <p className="text-secondary-400">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Findings</h1>
          <p className="text-secondary-400 mt-1">
            {totalCount} total findings across all repositories
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-500" />
          <input
            type="text"
            placeholder="Search findings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-10"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`btn-secondary ${showFilters ? 'bg-secondary-600' : ''}`}
        >
          <Filter className="w-4 h-4" />
          Filters
          <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Filter Options */}
      {showFilters && (
        <div className="card p-4 animate-fade-in">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Severity</label>
              <select
                value={filters.severity}
                onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
                className="input"
              >
                <option value="">All Severities</option>
                {severityOrder.map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="input"
              >
                <option value="">All Statuses</option>
                {statusOptions.map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Scanner</label>
              <select
                value={filters.scanner}
                onChange={(e) => setFilters({ ...filters, scanner: e.target.value })}
                className="input"
              >
                <option value="">All Scanners</option>
                {scannerOptions.map(s => (
                  <option key={s} value={s}>{s.toUpperCase()}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Findings List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sortedFindings.length === 0 ? (
        <div className="card p-12 text-center">
          <CheckCircle className="w-16 h-16 mx-auto mb-4 text-accent-500" />
          <h3 className="text-xl font-semibold text-secondary-200 mb-2">No findings</h3>
          <p className="text-secondary-500">
            {searchQuery || filters.severity || filters.status || filters.scanner
              ? 'No findings match your filters'
              : 'Your repositories are secure'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedFindings.map((finding) => (
            <FindingCard
              key={finding.id}
              finding={finding}
              expanded={selectedFinding === finding.id}
              onToggle={() => setSelectedFinding(selectedFinding === finding.id ? null : finding.id)}
              onResolve={(resolve) => handleResolve(finding.id, resolve)}
              onAssign={(userId) => assignFinding(finding.id, userId)}
              userId={user?.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FindingCard({
  finding,
  expanded,
  onToggle,
  onResolve,
  onAssign,
  userId
}: {
  finding: ReturnType<typeof useFindings>['findings'][0]
  expanded: boolean
  onToggle: () => void
  onResolve: (resolve: boolean) => void
  onAssign: (userId: string | null) => void
  userId?: string
}) {
  const severityBadge = {
    critical: 'badge-critical',
    high: 'badge-high',
    medium: 'badge-medium',
    low: 'badge-low',
    info: 'badge-info'
  }[finding.severity] || 'badge-info'

  const statusBadge = {
    open: 'bg-warning-500/20 text-warning-400',
    assigned: 'bg-primary-500/20 text-primary-400',
    in_progress: 'bg-primary-500/20 text-primary-400',
    resolved: 'bg-accent-500/20 text-accent-400',
    suppressed: 'bg-secondary-500/20 text-secondary-400',
    false_positive: 'bg-secondary-500/20 text-secondary-400'
  }[finding.status]

  return (
    <div className="card p-4 hover:border-secondary-600 transition-all cursor-pointer" onClick={onToggle}>
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={severityBadge}>{finding.severity.toUpperCase()}</span>
            <span className={`badge ${statusBadge}`}>
              {finding.status.replace('_', ' ')}
            </span>
            <span className="badge bg-secondary-700 text-secondary-300 text-xs">
              {finding.scanner.toUpperCase()}
            </span>
          </div>
          <h3 className="text-lg font-medium text-secondary-100 mt-2 truncate">
            {finding.title}
          </h3>
          <div className="flex items-center gap-4 mt-2 text-sm text-secondary-500">
            {finding.file_path && (
              <span className="flex items-center gap-1 font-mono text-xs truncate max-w-xs">
                <FileCode className="w-3 h-3" />
                {finding.file_path}
                {finding.line_start && `:${finding.line_start}`}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(finding.created_at).toLocaleDateString()}
            </span>
            {finding.cvss_score && (
              <span className="font-mono">CVSS: {finding.cvss_score.toFixed(1)}</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold font-mono text-secondary-200">
            {finding.risk_score.toFixed(0)}
          </p>
          <p className="text-xs text-secondary-500">risk</p>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-secondary-700/50 animate-fade-in" onClick={e => e.stopPropagation()}>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-secondary-500 text-sm">Scanner</p>
              <p className="text-secondary-200">{finding.scanner}</p>
            </div>
            <div>
              <p className="text-secondary-500 text-sm">Rule</p>
              <p className="text-secondary-200 font-mono text-sm">{finding.rule_id || finding.rule_name || 'N/A'}</p>
            </div>
            {finding.package_name && (
              <>
                <div>
                  <p className="text-secondary-500 text-sm">Package</p>
                  <p className="text-secondary-200">{finding.package_name}</p>
                </div>
                <div>
                  <p className="text-secondary-500 text-sm">Version</p>
                  <p className="text-secondary-200 font-mono">{finding.package_version}</p>
                </div>
              </>
            )}
            {finding.cve_id && (
              <div>
                <p className="text-secondary-500 text-sm">CVE</p>
                <p className="text-primary-400 font-mono">{finding.cve_id}</p>
              </div>
            )}
          </div>

          {finding.description && (
            <div className="mb-4">
              <p className="text-secondary-500 text-sm mb-1">Description</p>
              <p className="text-secondary-300 text-sm">{finding.description}</p>
            </div>
          )}

          {finding.evidence && (
            <div className="mb-4">
              <p className="text-secondary-500 text-sm mb-1">Evidence</p>
              <pre className="bg-secondary-900 p-3 rounded-lg text-xs font-mono text-secondary-300 overflow-x-auto">
                {finding.evidence}
              </pre>
            </div>
          )}

          {finding.ai_summary && (
            <div className="mb-4">
              <p className="text-secondary-500 text-sm mb-1">AI Analysis</p>
              <p className="text-secondary-300 text-sm">{finding.ai_summary}</p>
            </div>
          )}

          {finding.remediation && (
            <div className="mb-4">
              <p className="text-secondary-500 text-sm mb-1">Remediation</p>
              <p className="text-secondary-300 text-sm">{finding.remediation}</p>
            </div>
          )}

          <div className="flex items-center gap-2 mt-4">
            {finding.status !== 'resolved' && (
              <button
                onClick={() => onResolve(true)}
                className="btn-primary"
              >
                <CheckCircle className="w-4 h-4" />
                Mark Resolved
              </button>
            )}
            {!finding.assigned_to && userId && (
              <button
                onClick={() => onAssign(userId)}
                className="btn-secondary"
              >
                <User className="w-4 h-4" />
                Assign to Me
              </button>
            )}
            {finding.status === 'resolved' && (
              <button
                onClick={() => onResolve(false)}
                className="btn-ghost text-warning-400"
              >
                <RefreshCw className="w-4 h-4" />
                Reopen
              </button>
            )}
            <button
              className="btn-ghost"
              onClick={() => alert('Suppression coming soon')}
            >
              <Ban className="w-4 h-4" />
              Suppress
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
