import { useState } from 'react'
import { useRepositories, useScans } from '../hooks/useRepositories'
import { useAuth } from '../hooks/useAuth'
import {
  GitBranch,
  Plus,
  Search,
  RefreshCw,
  Play,
  Trash2,
  Shield,
  Clock,
  AlertTriangle,
  ChevronRight
} from 'lucide-react'

export function Repositories() {
  const { currentOrganizationId } = useAuth()
  const { repositories, loading, error, connectRepository, triggerScan, deleteRepository, refetch } =
    useRepositories(currentOrganizationId)
  const [showConnect, setShowConnect] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  const [newRepo, setNewRepo] = useState({
    provider: 'github',
    owner: '',
    name: '',
    description: '',
    default_branch: 'main',
    visibility: 'private'
  })

  const filteredRepos = repositories.filter((repo) =>
    repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repo.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleConnect = async () => {
    if (!newRepo.owner || !newRepo.name) return
    setConnecting(true)
    const result = await connectRepository({
      provider: newRepo.provider,
      provider_id: `${newRepo.provider}-${newRepo.owner}-${newRepo.name}`,
      owner: newRepo.owner,
      name: newRepo.name,
      full_name: `${newRepo.owner}/${newRepo.name}`,
      description: newRepo.description,
      default_branch: newRepo.default_branch,
      visibility: newRepo.visibility
    })
    setConnecting(false)
    if (result.error) {
      alert(result.error)
    } else {
      setShowConnect(false)
      setNewRepo({
        provider: 'github',
        owner: '',
        name: '',
        description: '',
        default_branch: 'main',
        visibility: 'private'
      })
    }
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="card p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-danger-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-secondary-100 mb-2">Failed to Load Repositories</h2>
          <p className="text-secondary-400">{error}</p>
          <button onClick={refetch} className="btn-primary mt-4">Try Again</button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Repositories</h1>
          <p className="text-secondary-400 mt-1">
            Connected repositories and their security status
          </p>
        </div>
        <button onClick={() => setShowConnect(true)} className="btn-primary">
          <Plus className="w-5 h-5" />
          Connect Repository
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-500" />
          <input
            type="text"
            placeholder="Search repositories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-10"
          />
        </div>
        <button onClick={refetch} className="btn-secondary">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Repository List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredRepos.length === 0 ? (
        <div className="card p-12 text-center">
          <GitBranch className="w-16 h-16 mx-auto mb-4 text-secondary-600" />
          <h3 className="text-xl font-semibold text-secondary-200 mb-2">No repositories yet</h3>
          <p className="text-secondary-500 mb-6">Connect your first repository to start scanning</p>
          <button onClick={() => setShowConnect(true)} className="btn-primary">
            <Plus className="w-5 h-5" />
            Connect Repository
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredRepos.map((repo) => (
            <RepositoryCard
              key={repo.id}
              repository={repo}
              onScan={triggerScan}
              onDelete={deleteRepository}
              selected={selectedRepo === repo.id}
              onToggleSelect={() => setSelectedRepo(selectedRepo === repo.id ? null : repo.id)}
            />
          ))}
        </div>
      )}

      {/* Connect Repository Modal */}
      {showConnect && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowConnect(false)}>
          <div className="card-elevated p-6 w-full max-w-lg animate-slide-up" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-secondary-100 mb-6">Connect Repository</h2>
            <div className="space-y-4">
              <div>
                <label className="label">Provider</label>
                <select
                  value={newRepo.provider}
                  onChange={(e) => setNewRepo({ ...newRepo, provider: e.target.value })}
                  className="input"
                >
                  <option value="github">GitHub</option>
                  <option value="gitlab">GitLab</option>
                  <option value="bitbucket">Bitbucket</option>
                  <option value="azuredevops">Azure DevOps</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Owner / Organization</label>
                  <input
                    type="text"
                    value={newRepo.owner}
                    onChange={(e) => setNewRepo({ ...newRepo, owner: e.target.value })}
                    placeholder="e.g., mycompany"
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Repository Name</label>
                  <input
                    type="text"
                    value={newRepo.name}
                    onChange={(e) => setNewRepo({ ...newRepo, name: e.target.value })}
                    placeholder="e.g., my-project"
                    className="input"
                  />
                </div>
              </div>
              <div>
                <label className="label">Description (optional)</label>
                <input
                  type="text"
                  value={newRepo.description}
                  onChange={(e) => setNewRepo({ ...newRepo, description: e.target.value })}
                  placeholder="Brief description"
                  className="input"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Default Branch</label>
                  <input
                    type="text"
                    value={newRepo.default_branch}
                    onChange={(e) => setNewRepo({ ...newRepo, default_branch: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Visibility</label>
                  <select
                    value={newRepo.visibility}
                    onChange={(e) => setNewRepo({ ...newRepo, visibility: e.target.value })}
                    className="input"
                  >
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                    <option value="internal">Internal</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowConnect(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={handleConnect}
                disabled={!newRepo.owner || !newRepo.name || connecting}
                className="btn-primary flex-1"
              >
                {connecting ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RepositoryCard({
  repository,
  onScan,
  onDelete,
  selected,
  onToggleSelect
}: {
  repository: ReturnType<typeof useRepositories>['repositories'][0]
  onScan: (id: string) => void
  onDelete: (id: string) => void
  selected: boolean
  onToggleSelect: () => void
}) {
  const { scans, loading: scansLoading } = useScans(selected ? repository.id : null)
  const [actionLoading, setActionLoading] = useState(false)

  const handleScan = async () => {
    setActionLoading(true)
    await onScan(repository.id)
    setActionLoading(false)
  }

  const handleDelete = async () => {
    if (confirm('Are you sure you want to remove this repository?')) {
      await onDelete(repository.id)
    }
  }

  const riskColor = repository.risk_score >= 70
    ? 'text-danger-400'
    : repository.risk_score >= 40
    ? 'text-warning-400'
    : 'text-accent-400'

  return (
    <div className="card p-6 hover:border-secondary-600 transition-all">
      <div
        className="flex items-start gap-4 cursor-pointer"
        onClick={onToggleSelect}
      >
        <div className="w-12 h-12 bg-secondary-700 rounded-lg flex items-center justify-center flex-shrink-0">
          <GitBranch className="w-6 h-6 text-secondary-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-secondary-100 truncate">
              {repository.full_name}
            </h3>
            <span className="badge bg-secondary-600 text-secondary-300 text-xs">
              {repository.provider}
            </span>
            <span className={`badge text-xs ${
              repository.visibility === 'public' ? 'bg-accent-500/20 text-accent-400' : 'bg-secondary-600 text-secondary-300'
            }`}>
              {repository.visibility}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-2 text-sm text-secondary-500">
            <span className="flex items-center gap-1">
              <span className="font-mono">{repository.default_branch}</span>
            </span>
            {repository.language && (
              <span>{repository.language}</span>
            )}
            {repository.last_scan_at && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Scanned {new Date(repository.last_scan_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-secondary-500 text-xs">Risk Score</p>
            <p className={`text-xl font-bold font-mono ${riskColor}`}>
              {repository.risk_score.toFixed(0)}
            </p>
          </div>
          <ChevronRight className={`w-5 h-5 text-secondary-500 transition-transform ${selected ? 'rotate-90' : ''}`} />
        </div>
      </div>

      {/* Expanded View */}
      {selected && (
        <div className="mt-6 pt-6 border-t border-secondary-700/50 animate-fade-in">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={(e) => { e.stopPropagation(); handleScan() }}
              disabled={actionLoading}
              className="btn-primary"
            >
              <Play className="w-4 h-4" />
              {actionLoading ? 'Starting...' : 'Run Scan'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete() }}
              className="btn-ghost text-danger-400"
            >
              <Trash2 className="w-4 h-4" />
              Remove
            </button>
          </div>

          {scansLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : scans.length === 0 ? (
            <div className="text-center py-8 text-secondary-500">
              <Shield className="w-10 h-10 mx-auto mb-2 text-secondary-600" />
              <p>No scans yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-secondary-300 mb-2">Recent Scans</h4>
              {scans.slice(0, 5).map((scan) => (
                <div key={scan.id} className="flex items-center justify-between p-3 bg-secondary-700/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      scan.status === 'completed' ? 'bg-accent-500' :
                      scan.status === 'running' ? 'bg-primary-500 animate-pulse-soft' :
                      scan.status === 'queued' ? 'bg-warning-500' :
                      'bg-danger-500'
                    }`} />
                    <div>
                      <p className="text-sm text-secondary-200">
                        {scan.trigger} scan
                        {scan.branch && <span className="text-secondary-500"> on <span className="font-mono">{scan.branch}</span></span>}
                      </p>
                      <p className="text-xs text-secondary-500">
                        {new Date(scan.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <span className={`badge text-xs ${
                    scan.status === 'completed' ? 'badge-low' :
                    scan.status === 'running' ? 'badge-medium' :
                    scan.status === 'queued' ? 'badge-high' :
                    'badge-critical'
                  }`}>
                    {scan.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
