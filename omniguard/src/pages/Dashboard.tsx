import { useAuth } from '../hooks/useAuth'
import { useDashboardStats, useAllScans } from '../hooks/useRepositories'
import { TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, GitBranch, Play, TrendingUp, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'

export function Dashboard() {
  const { currentOrganizationId } = useAuth()
  const { stats, loading } = useDashboardStats(currentOrganizationId)
  const { scans } = useAllScans(currentOrganizationId)

  const recent = scans.slice(0, 5)

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 mt-1">Security posture overview · live</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Critical', value: stats.critical, color: 'text-red-400', link: '/findings?severity=critical' },
          { label: 'High', value: stats.high, color: 'text-orange-400', link: '/findings?severity=high' },
          { label: 'Total Findings', value: stats.total, color: 'text-slate-200', link: '/findings' },
          { label: 'Resolved', value: stats.resolved, color: 'text-green-400', link: '/findings?status=resolved' },
        ].map(({ label, value, color, link }) => (
          <Link key={label} to={link} className="stat-card hover:border-slate-600 transition-colors block">
            <p className={`text-4xl font-bold font-mono ${color}`}>{loading ? '—' : value}</p>
            <p className="text-slate-400 text-sm mt-1">{label}</p>
          </Link>
        ))}
      </div>

      {/* Risk score + repos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-6 h-6 text-blue-400" />
            <div>
              <p className="text-3xl font-bold font-mono text-white">{loading ? '—' : stats.avgRisk}</p>
              <p className="text-slate-400 text-sm">Avg risk score</p>
            </div>
          </div>
          <div className="mt-3 h-2 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-blue-500 transition-all duration-700" style={{ width: `${stats.avgRisk}%` }} />
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <GitBranch className="w-6 h-6 text-slate-400" />
            <div>
              <p className="text-3xl font-bold font-mono text-white">{loading ? '—' : stats.repos}</p>
              <p className="text-slate-400 text-sm">Repositories</p>
            </div>
          </div>
          <Link to="/repositories" className="btn-ghost text-xs mt-3 px-0 text-blue-400">View all →</Link>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            {stats.critical > 0
              ? <AlertTriangle className="w-6 h-6 text-red-400" />
              : <CheckCircle className="w-6 h-6 text-green-400" />}
            <div>
              <p className="text-sm font-medium text-slate-200">
                {stats.critical > 0 ? `${stats.critical} critical issue${stats.critical > 1 ? 's' : ''} need attention` : 'No critical issues'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {stats.critical > 0 ? 'Immediate action required' : 'Your code looks good'}
              </p>
            </div>
          </div>
          {stats.critical > 0 && <Link to="/findings?severity=critical" className="btn-danger text-xs mt-3">View critical →</Link>}
        </div>
      </div>

      {/* Recent scans */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-200">Recent Scans</h2>
          <Link to="/scans" className="text-xs text-blue-400 hover:text-blue-300">View all</Link>
        </div>
        {recent.length === 0 ? (
          <div className="py-8 text-center">
            <Play className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            <p className="text-slate-500 text-sm">No scans yet. <Link to="/repositories" className="text-blue-400">Connect a repository</Link> to start.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map(scan => {
              const sum = scan.summary as Record<string, number> | null
              return (
                <div key={scan.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${scan.status === 'completed' ? 'bg-green-400' : scan.status === 'failed' ? 'bg-red-400' : scan.status === 'running' ? 'bg-blue-400' : 'bg-yellow-400'}`} />
                    <div>
                      <p className="text-sm text-slate-200">{scan.repository_name || 'Unknown repo'}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(scan.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {sum?.total ? <span className={`text-sm font-mono font-bold ${(sum.critical || 0) > 0 ? 'text-red-400' : 'text-slate-300'}`}>{sum.total} findings</span>
                      : <span className={`text-xs ${scan.status === 'completed' ? 'text-green-400' : 'text-slate-500'}`}>{scan.status}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
