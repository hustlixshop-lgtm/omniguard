import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useAllScans } from '../hooks/useRepositories'
import { CircleCheck as CheckCircle, CircleAlert as AlertCircle, Clock, RefreshCw, Play, GitBranch, Calendar } from 'lucide-react'

export function Scans() {
  const { currentOrganizationId } = useAuth()
  const { scans, loading } = useAllScans(currentOrganizationId)
  const [filter, setFilter] = useState('')

  const filtered = filter ? scans.filter((s) => s.status === filter) : scans

  const counts = { queued: 0, running: 0, completed: 0, failed: 0 }
  scans.forEach((s) => { if (s.status in counts) counts[s.status as keyof typeof counts]++ })

  const statusIcon = (status: string) => {
    if (status === 'completed') return <CheckCircle className="w-4 h-4 text-accent-400" />
    if (status === 'failed') return <AlertCircle className="w-4 h-4 text-danger-400" />
    if (status === 'running') return <RefreshCw className="w-4 h-4 text-primary-400 animate-spin" />
    return <Clock className="w-4 h-4 text-warning-400" />
  }

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-white">Scan History</h1>
        <p className="text-secondary-400 mt-1">All security scans · updates in real-time</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { key: 'queued', label: 'Queued', color: 'text-warning-400' },
          { key: 'running', label: 'Running', color: 'text-primary-400' },
          { key: 'completed', label: 'Completed', color: 'text-accent-400' },
          { key: 'failed', label: 'Failed', color: 'text-danger-400' },
        ].map(({ key, label, color }) => (
          <button key={key} onClick={() => setFilter(filter === key ? '' : key)}
            className={`stat-card text-left hover:border-secondary-500 transition-all ${filter === key ? 'border-primary-500/50' : ''}`}>
            <p className={`text-2xl font-bold font-mono ${color}`}>{counts[key as keyof typeof counts]}</p>
            <p className="text-secondary-400 text-sm">{label}</p>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <Play className="w-12 h-12 mx-auto mb-4 text-secondary-600" />
          <h3 className="text-lg font-semibold text-secondary-300 mb-2">No scans yet</h3>
          <p className="text-secondary-500">Connect a repository and trigger a scan to get started.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-secondary-700">
                {['Repository', 'Status', 'Trigger', 'Branch', 'Findings', 'Duration', 'Time'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-secondary-400 font-medium text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((scan) => {
                const summary = scan.summary as Record<string, number> | null
                const total = summary?.total || 0
                const critical = summary?.critical || 0
                return (
                  <tr key={scan.id} className="border-b border-secondary-800 hover:bg-secondary-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <GitBranch className="w-4 h-4 text-secondary-500 flex-shrink-0" />
                        <span className="text-secondary-200 font-mono text-xs truncate max-w-48">{scan.repository_name || scan.id.slice(0, 8)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {statusIcon(scan.status)}
                        <span className={scan.status === 'completed' ? 'text-accent-400' : scan.status === 'failed' ? 'text-danger-400' : scan.status === 'running' ? 'text-primary-400' : 'text-warning-400'}>
                          {scan.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className="badge bg-secondary-700 text-secondary-300">{scan.trigger}</span></td>
                    <td className="px-4 py-3 font-mono text-xs text-secondary-400">{scan.branch || 'main'}</td>
                    <td className="px-4 py-3">
                      {total > 0 ? (
                        <span className={`font-mono text-sm font-bold ${critical > 0 ? 'text-danger-400' : 'text-warning-400'}`}>
                          {total}{critical > 0 && <span className="text-xs ml-1 text-danger-400">({critical} crit)</span>}
                        </span>
                      ) : scan.status === 'completed' ? <span className="text-accent-400 text-xs">✓ clean</span>
                        : <span className="text-secondary-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-secondary-400 text-xs">{scan.duration_seconds ? `${scan.duration_seconds}s` : '—'}</td>
                    <td className="px-4 py-3 text-secondary-500 text-xs">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(scan.created_at).toLocaleString()}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
