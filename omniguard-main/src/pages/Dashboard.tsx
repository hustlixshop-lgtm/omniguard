import { useAuth } from '../hooks/useAuth'
import { useDashboardStats, useRepositoryHealth, useRecentActivity } from '../hooks/useAnalytics'
import { useRepositories } from '../hooks/useRepositories'
import {
  AlertTriangle,
  GitBranch,
  TrendingUp,
  Activity,
  Clock,
  XCircle,
  AlertCircle
} from 'lucide-react'

export function Dashboard() {
  const { currentOrganizationId } = useAuth()
  const { stats, loading: statsLoading, error: statsError } = useDashboardStats(currentOrganizationId)
  const { repositories: _repositories, loading: _reposLoading } = useRepositories(currentOrganizationId)

  const { repositories: repoHealth, loading: healthLoading } = useRepositoryHealth(currentOrganizationId)
  const { activity, loading: activityLoading } = useRecentActivity(currentOrganizationId, 5)


  if (statsError) {
    return (
      <div className="p-8">
        <div className="card p-6 text-center">
          <AlertCircle className="w-12 h-12 text-danger-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-secondary-100 mb-2">Failed to Load Dashboard</h2>
          <p className="text-secondary-400">{statsError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-secondary-400 mt-1">Overview of your security posture</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-secondary-500">
          <Clock className="w-4 h-4" />
          Last updated: {stats.lastScanAt ? new Date(stats.lastScanAt).toLocaleString() : 'No scans yet'}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Repositories"
          value={stats.totalRepositories}
          icon={GitBranch}
          loading={statsLoading}
          color="primary"
        />
        <StatCard
          title="Open Findings"
          value={stats.openFindings}
          icon={AlertTriangle}
          loading={statsLoading}
          color="warning"
        />
        <StatCard
          title="Critical Issues"
          value={stats.criticalFindings}
          icon={XCircle}
          loading={statsLoading}
          color="danger"
        />
        <StatCard
          title="Avg Risk Score"
          value={stats.averageRiskScore}
          icon={TrendingUp}
          loading={statsLoading}
          color="primary"
          suffix="/100"
        />
      </div>

      {/* Findings by Severity */}
      <div className="card p-6">
        <h2 className="text-xl font-semibold text-white mb-6">Findings by Severity</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SeverityCard label="Critical" count={stats.criticalFindings} color="danger" loading={statsLoading} />
          <SeverityCard label="High" count={stats.highFindings} color="warning" loading={statsLoading} />
          <SeverityCard label="Medium" count={stats.mediumFindings} color="primary" loading={statsLoading} />
          <SeverityCard label="Low" count={stats.lowFindings} color="accent" loading={statsLoading} />
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Repository Health */}
        <div className="lg:col-span-2 card p-6">
          <h2 className="text-xl font-semibold text-white mb-6">Repository Health</h2>
          {healthLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-pulse-soft text-secondary-400">Loading...</div>
            </div>
          ) : repoHealth.length === 0 ? (
            <div className="text-center py-12 text-secondary-500">
              <GitBranch className="w-12 h-12 mx-auto mb-4 text-secondary-600" />
              <p>No repositories connected yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {repoHealth.slice(0, 5).map((repo) => (
                <div key={repo.id} className="flex items-center gap-4 p-4 bg-secondary-700/30 rounded-lg hover:bg-secondary-700/50 transition-colors">
                  <div className="flex-1">
                    <p className="font-medium text-secondary-100">{repo.name}</p>
                    <p className="text-sm text-secondary-500">
                      {repo.findingsCount} open findings
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-2 bg-secondary-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          repo.riskScore >= 70 ? 'bg-danger-500' :
                          repo.riskScore >= 40 ? 'bg-warning-500' :
                          'bg-accent-500'
                        }`}
                        style={{ width: `${repo.riskScore}%` }}
                      />
                    </div>
                    <span className="text-sm font-mono text-secondary-400 w-12 text-right">
                      {repo.riskScore.toFixed(0)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="card p-6">
          <h2 className="text-xl font-semibold text-white mb-6">Recent Activity</h2>
          {activityLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-pulse-soft text-secondary-400">Loading...</div>
            </div>
          ) : activity.length === 0 ? (
            <div className="text-center py-12 text-secondary-500">
              <Activity className="w-12 h-12 mx-auto mb-4 text-secondary-600" />
              <p>No recent activity</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activity.map((item) => (
                <div key={item.id} className="flex items-start gap-3">
                  <div className="w-2 h-2 mt-2 bg-primary-500 rounded-full flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-secondary-200 font-medium truncate">
                      {item.resource_name || item.action}
                    </p>
                    <p className="text-xs text-secondary-500">
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  title,
  value,
  icon: Icon,
  loading,
  color,
  suffix = ''
}: {
  title: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  loading: boolean
  color: 'primary' | 'warning' | 'danger' | 'accent'
  suffix?: string
}) {
  const colorClasses = {
    primary: 'bg-primary-500/10 text-primary-400',
    warning: 'bg-warning-500/10 text-warning-400',
    danger: 'bg-danger-500/10 text-danger-400',
    accent: 'bg-accent-500/10 text-accent-400'
  }

  return (
    <div className="stat-card group">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      <p className="text-secondary-400 text-sm mb-1">{title}</p>
      {loading ? (
        <div className="h-8 w-20 bg-secondary-700 rounded animate-pulse" />
      ) : (
        <p className="text-3xl font-bold text-white">
          {value}{suffix}
        </p>
      )}
    </div>
  )
}

function SeverityCard({
  label,
  count,
  color,
  loading
}: {
  label: string
  count: number
  color: 'danger' | 'warning' | 'primary' | 'accent'
  loading: boolean
}) {
  const colorClasses = {
    danger: 'border-danger-500/30 bg-danger-500/5',
    warning: 'border-warning-500/30 bg-warning-500/5',
    primary: 'border-primary-500/30 bg-primary-500/5',
    accent: 'border-accent-500/30 bg-accent-500/5'
  }

  const textClasses = {
    danger: 'text-danger-400',
    warning: 'text-warning-400',
    primary: 'text-primary-400',
    accent: 'text-accent-400'
  }

  return (
    <div className={`p-4 rounded-lg border ${colorClasses[color]}`}>
      <p className="text-secondary-400 text-sm mb-1">{label}</p>
      {loading ? (
        <div className="h-6 w-12 bg-secondary-700 rounded animate-pulse" />
      ) : (
        <p className={`text-2xl font-bold ${textClasses[color]}`}>{count}</p>
      )}
    </div>
  )
}
