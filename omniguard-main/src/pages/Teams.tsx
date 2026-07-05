import { useState } from 'react'
import { useTeams, useOrganizationMembers } from '../hooks/useOrganization'
import { useAuth } from '../hooks/useAuth'
import {
  Users,
  Plus,
  User,
  Crown,
  Shield,
  Code,
  Eye,
  Trash2
} from 'lucide-react'

const roleIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  owner: Crown,
  admin: Shield,
  engineer: Code,
  developer: Users,
  auditor: Eye
}

const roleLabels: Record<string, string> = {
  owner: 'Owner',
  admin: 'Administrator',
  engineer: 'Security Engineer',
  developer: 'Developer',
  auditor: 'Auditor'
}

export function Teams() {
  const { currentOrganizationId } = useAuth()
  const { teams, loading: teamsLoading, createTeam, deleteTeam } = useTeams(currentOrganizationId)
  const { members, loading: membersLoading } = useOrganizationMembers(currentOrganizationId)
  const [showCreateTeam, setShowCreateTeam] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamDescription, setNewTeamDescription] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return
    setCreating(true)
    const { error } = await createTeam(newTeamName.trim(), newTeamDescription.trim() || undefined)
    setCreating(false)
    if (!error) {
      setShowCreateTeam(false)
      setNewTeamName('')
      setNewTeamDescription('')
    } else {
      alert(error)
    }
  }

  const isLoading = teamsLoading || membersLoading

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-8 space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Teams & Members</h1>
          <p className="text-secondary-400 mt-1">Manage your organization's teams and member roles</p>
        </div>
        <button onClick={() => setShowCreateTeam(true)} className="btn-primary">
          <Plus className="w-5 h-5" />
          Create Team
        </button>
      </div>

      {/* Organization Members */}
      <div className="card p-6">
        <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
          <Users className="w-5 h-5 text-secondary-400" />
          Organization Members
        </h2>
        {members.length === 0 ? (
          <div className="text-center py-8 text-secondary-500">
            <Users className="w-12 h-12 mx-auto mb-3 text-secondary-600" />
            <p>No members found</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {members.map((member) => {
              const RoleIcon = roleIcons[member.role] || User
              return (
                <div key={member.id} className="flex items-center gap-4 p-4 bg-secondary-700/30 rounded-lg hover:bg-secondary-700/50 transition-colors">
                  <div className="w-10 h-10 bg-secondary-700 rounded-lg flex items-center justify-center text-secondary-300 font-medium">
                    {member.role === 'owner' ? (
                      <Crown className="w-5 h-5 text-warning-400" />
                    ) : (
                      <span className="text-lg">{member.user_id.slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-secondary-100 font-medium">User ID: {member.user_id.slice(0, 8)}...</p>
                    <p className="text-secondary-500 text-sm">
                      Joined {member.joined_at ? new Date(member.joined_at).toLocaleDateString() : 'Pending'}
                    </p>
                  </div>
                  <span className={`badge flex items-center gap-1.5 ${
                    member.role === 'owner' ? 'bg-warning-500/20 text-warning-400' :
                    member.role === 'admin' ? 'bg-primary-500/20 text-primary-400' :
                    'bg-secondary-600 text-secondary-300'
                  }`}>
                    <RoleIcon className="w-3 h-3" />
                    {roleLabels[member.role] || member.role}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Teams */}
      <div className="card p-6">
        <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
          <Users className="w-5 h-5 text-secondary-400" />
          Teams
        </h2>
        {teams.length === 0 ? (
          <div className="text-center py-8 text-secondary-500">
            <Users className="w-12 h-12 mx-auto mb-3 text-secondary-600" />
            <p>No teams created yet</p>
            <button onClick={() => setShowCreateTeam(true)} className="btn-primary mt-4">
              <Plus className="w-4 h-4" />
              Create Your First Team
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {teams.map((team) => (
              <div key={team.id} className="p-4 bg-secondary-700/30 rounded-lg hover:bg-secondary-700/50 transition-colors border border-secondary-700">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-medium text-secondary-100">{team.name}</h3>
                    {team.description && (
                      <p className="text-secondary-500 text-sm mt-1">{team.description}</p>
                    )}
                    <p className="text-secondary-600 text-xs mt-2">
                      Created {new Date(team.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteTeam(team.id)}
                    className="p-2 hover:bg-danger-500/20 rounded-lg transition-colors text-secondary-400 hover:text-danger-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Role Reference */}
      <div className="card p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Role Permissions</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          {Object.entries(roleLabels).map(([key, label]) => {
            const Icon = roleIcons[key]
            const permissions: Record<string, string[]> = {
              owner: ['Full access', 'Billing', 'Delete organization', 'Manage all settings'],
              admin: ['Manage repositories', 'Manage integrations', 'Invite members', 'Delete repositories'],
              engineer: ['Run scans', 'Edit policies', 'Resolve findings', 'Manage repositories'],
              developer: ['View findings', 'Run scans', 'AI remediation', 'Upload documents'],
              auditor: ['View-only access', 'Reports', 'Audit logs', 'Dashboards']
            }
            return (
              <div key={key} className="p-4 bg-secondary-700/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-4 h-4 text-secondary-400" />
                  <span className="font-medium text-secondary-100">{label}</span>
                </div>
                <ul className="text-secondary-500 space-y-1">
                  {permissions[key]?.map((perm, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <span className={`w-1 h-1 rounded-full ${
                        key === 'owner' ? 'bg-warning-400' :
                        key === 'admin' ? 'bg-primary-400' : 'bg-secondary-500'
                      }`} />
                      {perm}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </div>

      {/* Create Team Modal */}
      {showCreateTeam && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateTeam(false)}>
          <div className="card-elevated p-6 w-full max-w-md animate-slide-up" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-secondary-100 mb-6">Create Team</h2>
            <div className="space-y-4">
              <div>
                <label className="label">Team Name</label>
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="e.g., Platform Team"
                  className="input"
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Description (optional)</label>
                <input
                  type="text"
                  value={newTeamDescription}
                  onChange={(e) => setNewTeamDescription(e.target.value)}
                  placeholder="Brief description"
                  className="input"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCreateTeam(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleCreateTeam} disabled={!newTeamName.trim() || creating} className="btn-primary flex-1">
                {creating ? 'Creating...' : 'Create Team'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
