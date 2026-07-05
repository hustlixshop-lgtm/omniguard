import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useOrganizations } from '../hooks/useOrganization'
import { supabase, Tables } from '../lib/supabase'
import { Building2, Shield, Bell, Key, Link2, Trash2, RefreshCw, Save, CircleCheck as CheckCircle, Copy, Plus, Eye, EyeOff, GitFork as Github, ExternalLink } from 'lucide-react'

type ApiKey = Tables<'api_keys'>

export function Settings() {
  const { user } = useAuth()
  const { currentOrganization, updateOrganization } = useOrganizations()
  const [activeTab, setActiveTab] = useState('general')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [orgForm, setOrgForm] = useState({
    name: currentOrganization?.name || '',
    slug: currentOrganization?.slug || '',
  })

  // Sync form when org changes
  useEffect(() => {
    if (currentOrganization) {
      setOrgForm({ name: currentOrganization.name, slug: currentOrganization.slug })
    }
  }, [currentOrganization?.id])

  const handleSaveOrg = async () => {
    if (!currentOrganization) return
    setSaving(true)
    const { error } = await updateOrganization(currentOrganization.id, {
      name: orgForm.name,
      slug: orgForm.slug,
    })
    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  const tabs = [
    { id: 'general', label: 'General', icon: Building2 },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'integrations', label: 'Integrations', icon: Link2 },
    { id: 'api', label: 'API Keys', icon: Key },
  ]

  return (
    <div className="p-8 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <p className="text-secondary-400 mt-1">Manage your organization settings and integrations</p>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="card p-2 sticky top-6">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                    activeTab === tab.id
                      ? 'bg-primary-500/10 text-primary-400 border border-primary-500/20'
                      : 'text-secondary-400 hover:bg-secondary-700/50 hover:text-secondary-200'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-3 space-y-6">
          {activeTab === 'general' && (
            <GeneralTab orgForm={orgForm} setOrgForm={setOrgForm} saving={saving} saved={saved} onSave={handleSaveOrg} />
          )}
          {activeTab === 'security' && <SecurityTab />}
          {activeTab === 'notifications' && (
            <NotificationsTab organizationId={currentOrganization?.id || null} />
          )}
          {activeTab === 'integrations' && (
            <IntegrationsTab organizationId={currentOrganization?.id || null} userId={user?.id || null} />
          )}
          {activeTab === 'api' && (
            <ApiKeysTab organizationId={currentOrganization?.id || null} userId={user?.id || null} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── General Tab ──────────────────────────────────────────────────────────────

function GeneralTab({
  orgForm,
  setOrgForm,
  saving,
  saved,
  onSave,
}: {
  orgForm: { name: string; slug: string }
  setOrgForm: (f: { name: string; slug: string }) => void
  saving: boolean
  saved: boolean
  onSave: () => void
}) {
  return (
    <div className="card p-6">
      <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
        <Building2 className="w-5 h-5 text-secondary-400" />
        Organization Settings
      </h2>
      <div className="space-y-6">
        <div>
          <label className="label">Organization Name</label>
          <input
            type="text"
            value={orgForm.name}
            onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
            className="input max-w-md"
          />
        </div>
        <div>
          <label className="label">URL Slug</label>
          <input
            type="text"
            value={orgForm.slug}
            onChange={(e) => setOrgForm({ ...orgForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
            className="input max-w-md font-mono"
          />
          <p className="text-secondary-500 text-sm mt-1">
            Used in URLs: <code className="text-secondary-400">omniguard.io/o/{orgForm.slug}</code>
          </p>
        </div>
        <div className="pt-4 border-t border-secondary-700">
          <button onClick={onSave} disabled={saving || !orgForm.name.trim()} className="btn-primary">
            {saving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving...</> :
              saved ? <><CheckCircle className="w-4 h-4" /> Saved!</> :
              <><Save className="w-4 h-4" /> Save Changes</>}
          </button>
        </div>
      </div>
      <div className="mt-8 pt-6 border-t border-secondary-700">
        <h3 className="text-lg font-semibold text-danger-400 mb-4">Danger Zone</h3>
        <div className="p-4 bg-danger-500/10 border border-danger-500/20 rounded-lg">
          <p className="text-secondary-300 text-sm mb-4">
            Permanently deletes the organization and all data. This cannot be undone.
          </p>
          <button className="btn-danger" onClick={() => alert('Contact support to delete your organization.')}>
            <Trash2 className="w-4 h-4" />
            Delete Organization
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Security Tab ─────────────────────────────────────────────────────────────

function SecurityTab() {
  return (
    <div className="card p-6">
      <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
        <Shield className="w-5 h-5 text-secondary-400" />
        Security Settings
      </h2>
      <div className="space-y-4">
        {[
          { label: 'Multi-Factor Authentication', desc: 'Require MFA for all organization members' },
          { label: 'Single Sign-On (SAML/OIDC)', desc: 'Configure enterprise SSO' },
          { label: 'IP Allowlist', desc: 'Restrict access to specific IP ranges' },
          { label: 'Session Timeout', desc: 'Auto-logout after inactivity' },
        ].map((item) => (
          <div key={item.label} className="flex items-center justify-between p-4 bg-secondary-700/30 rounded-lg">
            <div>
              <p className="text-secondary-100 font-medium">{item.label}</p>
              <p className="text-secondary-500 text-sm">{item.desc}</p>
            </div>
            <span className="badge bg-warning-500/20 text-warning-400 border-warning-500/30">Pro Plan</span>
          </div>
        ))}
        <div className="pt-4 border-t border-secondary-700">
          <p className="text-secondary-500 text-sm">
            Advanced security features are available on the Pro and Enterprise plans.{' '}
            <a href="#" className="text-primary-400 hover:underline">Upgrade</a>
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Notifications Tab ────────────────────────────────────────────────────────

function NotificationsTab({ organizationId }: { organizationId: string | null }) {
  const [saving, setSaving] = useState(false)
  const [slackWebhook, setSlackWebhook] = useState('')
  const [prefs, setPrefs] = useState({
    critical_findings: true,
    high_findings: true,
    scan_completion: false,
    weekly_digest: true,
    member_joins: false,
  })

  const handleSave = async () => {
    if (!organizationId) return
    setSaving(true)
    await supabase.from('organizations').update({
      settings: {
        notifications: {
          prefs,
          slack_webhook: slackWebhook || null,
        },
      },
    }).eq('id', organizationId)
    setSaving(false)
  }

  return (
    <div className="card p-6">
      <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
        <Bell className="w-5 h-5 text-secondary-400" />
        Notification Preferences
      </h2>
      <div className="space-y-4">
        {(Object.entries(prefs) as [keyof typeof prefs, boolean][]).map(([key, enabled]) => {
          const labels: Record<keyof typeof prefs, { label: string; desc: string }> = {
            critical_findings: { label: 'Critical Findings', desc: 'Notify immediately for critical severity findings' },
            high_findings: { label: 'High Findings', desc: 'Notify for high severity findings' },
            scan_completion: { label: 'Scan Completion', desc: 'Notify when any scan finishes' },
            weekly_digest: { label: 'Weekly Digest', desc: 'Weekly summary of security posture' },
            member_joins: { label: 'New Members', desc: 'Notify when a new member joins the organization' },
          }
          const { label, desc } = labels[key]
          return (
            <div key={key} className="flex items-center justify-between p-4 bg-secondary-700/30 rounded-lg">
              <div>
                <p className="text-secondary-100 font-medium">{label}</p>
                <p className="text-secondary-500 text-sm">{desc}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setPrefs((p) => ({ ...p, [key]: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-secondary-600 peer-focus:ring-2 peer-focus:ring-primary-500/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600" />
              </label>
            </div>
          )
        })}

        <div className="pt-4 border-t border-secondary-700">
          <label className="label">Slack Webhook URL</label>
          <input
            type="url"
            value={slackWebhook}
            onChange={(e) => setSlackWebhook(e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
            className="input max-w-lg"
          />
          <p className="text-secondary-500 text-sm mt-1">Critical findings will be sent to this Slack channel.</p>
        </div>

        <div className="pt-4">
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save Preferences</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Integrations Tab ─────────────────────────────────────────────────────────

function IntegrationsTab({ organizationId, userId }: { organizationId: string | null; userId: string | null }) {
  const [githubToken, setGithubToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [saving, setSaving] = useState(false)
  const [existing, setExisting] = useState<Tables<'integrations'> | null>(null)

  useEffect(() => {
    if (!organizationId) return
    supabase
      .from('integrations')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('provider', 'github')
      .maybeSingle()
      .then(({ data }) => setExisting(data))
  }, [organizationId])

  const handleSaveGitHub = async () => {
    if (!organizationId || !githubToken.trim()) return
    setSaving(true)

    const config = { access_token: githubToken.trim(), token_type: 'pat' }

    if (existing) {
      await supabase.from('integrations').update({ config, status: 'active', updated_at: new Date().toISOString() } as Parameters<typeof supabase.from>[0] extends never ? never : object).eq('id', existing.id)
    } else {
      await supabase.from('integrations').insert({
        organization_id: organizationId,
        created_by: userId || undefined,
        provider: 'github',
        name: 'GitHub',
        config,
        status: 'active',
      })
    }

    setSaving(false)
    setGithubToken('')
    setShowToken(false)
    setExisting((prev) => prev ? { ...prev, status: 'active' } : null)
  }

  const handleDisconnect = async () => {
    if (!existing) return
    await supabase.from('integrations').update({ status: 'inactive' } as object).eq('id', existing.id)
    setExisting((prev) => prev ? { ...prev, status: 'inactive' } : null)
  }

  return (
    <div className="card p-6">
      <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
        <Link2 className="w-5 h-5 text-secondary-400" />
        Integrations
      </h2>
      <div className="space-y-6">
        {/* GitHub */}
        <div className="p-5 bg-secondary-700/30 rounded-lg border border-secondary-700">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-secondary-700 rounded-lg flex items-center justify-center flex-shrink-0">
              <Github className="w-5 h-5 text-secondary-300" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-secondary-100 font-medium">GitHub</h3>
                  <p className="text-secondary-500 text-sm">Connect repositories for automatic scanning</p>
                </div>
                {existing?.status === 'active' ? (
                  <span className="badge bg-accent-500/20 text-accent-400 border-accent-500/30">Connected</span>
                ) : (
                  <span className="badge bg-secondary-600 text-secondary-400">Not connected</span>
                )}
              </div>

              {existing?.status === 'active' ? (
                <div className="mt-3 flex gap-2">
                  <p className="text-secondary-500 text-sm flex-1">
                    GitHub PAT is configured. The scan worker uses this token to fetch repository files.
                  </p>
                  <button onClick={handleDisconnect} className="btn-ghost text-danger-400 text-sm">
                    <Trash2 className="w-3 h-3" />
                    Disconnect
                  </button>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <p className="text-secondary-500 text-sm">
                    Provide a GitHub Personal Access Token with <code className="text-primary-400">repo</code> read scope.{' '}
                    <a
                      href="https://github.com/settings/tokens/new?scopes=repo,read:org&description=OmniGuard"
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary-400 hover:underline inline-flex items-center gap-1"
                    >
                      Create token <ExternalLink className="w-3 h-3" />
                    </a>
                  </p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showToken ? 'text' : 'password'}
                        value={githubToken}
                        onChange={(e) => setGithubToken(e.target.value)}
                        placeholder="ghp_..."
                        className="input font-mono pr-10"
                      />
                      <button
                        onClick={() => setShowToken((s) => !s)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-secondary-500 hover:text-secondary-300"
                        type="button"
                      >
                        {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <button onClick={handleSaveGitHub} disabled={saving || !githubToken.trim()} className="btn-primary">
                      {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Connect'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Webhook setup info */}
        <div className="p-4 bg-secondary-800/50 rounded-lg border border-secondary-700/50">
          <h4 className="text-secondary-200 font-medium mb-2">GitHub Webhook Setup</h4>
          <p className="text-secondary-500 text-sm mb-3">
            Add this webhook URL to your GitHub repositories to trigger automatic scans on push events:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-secondary-900 px-3 py-2 rounded-lg text-primary-300 font-mono overflow-x-auto">
              {import.meta.env.VITE_SUPABASE_URL}/functions/v1/github-webhook
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/github-webhook`)}
              className="btn-secondary text-sm"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <p className="text-secondary-600 text-xs mt-2">
            Events: Push, Pull Request. Content type: application/json
          </p>
        </div>

        {/* Other integrations */}
        {[
          { name: 'GitLab', desc: 'Sync repositories from GitLab' },
          { name: 'Slack', desc: 'Send notifications to Slack channels' },
          { name: 'Jira', desc: 'Create Jira issues from findings' },
          { name: 'PagerDuty', desc: 'Alert on critical findings' },
        ].map((item) => (
          <div key={item.name} className="flex items-center gap-4 p-4 bg-secondary-700/30 rounded-lg">
            <div className="w-10 h-10 bg-secondary-700 rounded-lg flex items-center justify-center">
              <Link2 className="w-5 h-5 text-secondary-400" />
            </div>
            <div className="flex-1">
              <p className="text-secondary-100 font-medium">{item.name}</p>
              <p className="text-secondary-500 text-sm">{item.desc}</p>
            </div>
            <span className="badge bg-warning-500/20 text-warning-400 border-warning-500/30">Pro Plan</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── API Keys Tab ─────────────────────────────────────────────────────────────

function ApiKeysTab({ organizationId, userId }: { organizationId: string | null; userId: string | null }) {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyScopes, setNewKeyScopes] = useState(['findings:read', 'scans:write'])
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)

  useEffect(() => {
    if (!organizationId) return
    supabase
      .from('api_keys')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setApiKeys(data || [])
        setLoading(false)
      })
  }, [organizationId])

  const handleCreate = async () => {
    if (!organizationId || !newKeyName.trim()) return
    setCreating(true)

    // Generate a cryptographically random API key
    const randomBytes = crypto.getRandomValues(new Uint8Array(24))
    const keyBody = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, '0')).join('')
    const rawKey = `og_live_${keyBody}`
    const keyPrefix = rawKey.slice(0, 12)

    // Hash the key for storage (SHA-256)
    const encoder = new TextEncoder()
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(rawKey))
    const keyHash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('')

    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        organization_id: organizationId,
        created_by: userId || undefined,
        name: newKeyName.trim(),
        key_hash: keyHash,
        key_prefix: keyPrefix,
        scopes: newKeyScopes,
      })
      .select()
      .single()

    setCreating(false)
    if (!error && data) {
      setApiKeys((prev) => [data, ...prev])
      setGeneratedKey(rawKey)
      setShowCreate(false)
      setNewKeyName('')
    }
  }

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this API key? Any integrations using it will stop working.')) return
    await supabase.from('api_keys').update({ is_active: false }).eq('id', id)
    setApiKeys((prev) => prev.filter((k) => k.id !== id))
  }

  const availableScopes = ['findings:read', 'findings:write', 'scans:read', 'scans:write', 'repositories:read']

  return (
    <div className="card p-6">
      <h2 className="text-xl font-semibold text-white mb-2 flex items-center gap-2">
        <Key className="w-5 h-5 text-secondary-400" />
        API Keys
      </h2>
      <p className="text-secondary-400 text-sm mb-6">
        API keys allow programmatic access. Use them in the CLI and Git hooks.
      </p>

      {/* Generated key banner */}
      {generatedKey && (
        <div className="mb-6 p-4 bg-accent-500/10 border border-accent-500/30 rounded-lg">
          <p className="text-accent-400 font-medium mb-2">
            API key created! Copy it now — it won't be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm bg-secondary-900 px-3 py-2 rounded font-mono text-accent-300 overflow-x-auto">
              {generatedKey}
            </code>
            <button
              onClick={() => { navigator.clipboard.writeText(generatedKey); setGeneratedKey(null) }}
              className="btn-secondary text-sm"
            >
              <Copy className="w-4 h-4" /> Copy & dismiss
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Create API Key
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : apiKeys.length === 0 ? (
        <div className="text-center py-8 text-secondary-500 border border-dashed border-secondary-700 rounded-lg">
          <Key className="w-10 h-10 mx-auto mb-3 text-secondary-600" />
          <p>No API keys created yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {apiKeys.map((key) => (
            <div key={key.id} className="flex items-center gap-4 p-4 bg-secondary-700/30 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-secondary-100 font-medium">{key.name}</p>
                <p className="text-secondary-500 text-sm font-mono">{key.key_prefix}...</p>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {key.scopes.map((s) => (
                    <span key={s} className="badge bg-secondary-600 text-secondary-300 text-xs">{s}</span>
                  ))}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-secondary-500 text-xs">Created {new Date(key.created_at).toLocaleDateString()}</p>
                {key.last_used_at && (
                  <p className="text-secondary-500 text-xs">Last used {new Date(key.last_used_at).toLocaleDateString()}</p>
                )}
              </div>
              <button onClick={() => handleRevoke(key.id)} className="btn-ghost text-danger-400">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create Key Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="card-elevated p-6 w-full max-w-md animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-4">Create API Key</h3>
            <div className="space-y-4">
              <div>
                <label className="label">Key Name</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g., CI/CD Pipeline"
                  className="input"
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Scopes</label>
                <div className="space-y-2">
                  {availableScopes.map((scope) => (
                    <label key={scope} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newKeyScopes.includes(scope)}
                        onChange={(e) => setNewKeyScopes((prev) =>
                          e.target.checked ? [...prev, scope] : prev.filter((s) => s !== scope)
                        )}
                        className="rounded border-secondary-600"
                      />
                      <span className="text-secondary-300 text-sm font-mono">{scope}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleCreate} disabled={creating || !newKeyName.trim() || newKeyScopes.length === 0} className="btn-primary flex-1">
                {creating ? 'Creating...' : 'Create Key'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
