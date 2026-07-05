import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useOrganizations } from '../hooks/useOrganization'
import {
  Building2,
  Shield,
  Bell,
  Key,
  Github,
  Link2,
  Trash2,
  RefreshCw,
  Save,
  CheckCircle
} from 'lucide-react'

export function Settings() {
  const { profile: _profile } = useAuth()
  const { currentOrganization, updateOrganization } = useOrganizations()
  const [activeTab, setActiveTab] = useState('general')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [orgForm, setOrgForm] = useState({
    name: currentOrganization?.name || '',
    slug: currentOrganization?.slug || ''
  })

  const handleSaveOrg = async () => {
    if (!currentOrganization) return
    setSaving(true)
    const { error } = await updateOrganization(currentOrganization.id, {
      name: orgForm.name,
      slug: orgForm.slug
    })
    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const tabs = [
    { id: 'general', label: 'General', icon: Building2 },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'integrations', label: 'Integrations', icon: Link2 },
    { id: 'api', label: 'API Keys', icon: Key }
  ]

  return (
    <div className="p-8 animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <p className="text-secondary-400 mt-1">Manage your organization settings and preferences</p>
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
          {/* General Settings */}
          {activeTab === 'general' && (
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
                    Used in URLs and API references: <code className="text-secondary-400">omniguard.io/o/{orgForm.slug}</code>
                  </p>
                </div>
                <div>
                  <label className="label">Plan</label>
                  <div className="flex items-center gap-3">
                    <span className="badge bg-primary-500/20 text-primary-400 border border-primary-500/30">
                      {currentOrganization?.plan || 'free'}
                    </span>
                    <button className="btn-secondary text-sm">Upgrade Plan</button>
                  </div>
                </div>
                <div className="pt-4 border-t border-secondary-700">
                  <button
                    onClick={handleSaveOrg}
                    disabled={saving || !orgForm.name.trim()}
                    className="btn-primary"
                  >
                    {saving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : saved ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Saved!
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="mt-8 pt-6 border-t border-secondary-700">
                <h3 className="text-lg font-semibold text-danger-400 mb-4">Danger Zone</h3>
                <div className="p-4 bg-danger-500/10 border border-danger-500/20 rounded-lg">
                  <p className="text-secondary-300 text-sm mb-4">
                    Deleting an organization removes all data including repositories, findings, and audit logs. This cannot be undone.
                  </p>
                  <button className="btn-danger">
                    <Trash2 className="w-4 h-4" />
                    Delete Organization
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Security Settings */}
          {activeTab === 'security' && (
            <div className="card p-6">
              <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <Shield className="w-5 h-5 text-secondary-400" />
                Security Settings
              </h2>
              <div className="space-y-6">
                <div className="p-4 bg-secondary-700/30 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-secondary-100 font-medium">Multi-Factor Authentication</p>
                      <p className="text-secondary-500 text-sm">Add an extra layer of security to your account</p>
                    </div>
                    <span className="badge bg-warning-500/20 text-warning-400">Coming Soon</span>
                  </div>
                </div>
                <div className="p-4 bg-secondary-700/30 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-secondary-100 font-medium">Single Sign-On (SSO)</p>
                      <p className="text-secondary-500 text-sm">Configure SAML or OIDC for your organization</p>
                    </div>
                    <span className="badge bg-warning-500/20 text-warning-400">Coming Soon</span>
                  </div>
                </div>
                <div className="p-4 bg-secondary-700/30 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-secondary-100 font-medium">Session Management</p>
                      <p className="text-secondary-500 text-sm">View and manage active sessions</p>
                    </div>
                    <button className="btn-secondary text-sm">Manage</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notifications */}
          {activeTab === 'notifications' && (
            <div className="card p-6">
              <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <Bell className="w-5 h-5 text-secondary-400" />
                Notification Preferences
              </h2>
              <div className="space-y-4">
                {[
                  { label: 'Critical findings', desc: 'Get notified for critical security findings' },
                  { label: 'Scan completion', desc: 'Receive notifications when scans complete' },
                  { label: 'Repository sync', desc: 'Get alerts for sync failures or issues' },
                  { label: 'Member invitations', desc: 'Notifications for new member joins' },
                  { label: 'Weekly digest', desc: 'Weekly summary of your security posture' }
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-secondary-700/30 rounded-lg">
                    <div>
                      <p className="text-secondary-100 font-medium">{item.label}</p>
                      <p className="text-secondary-500 text-sm">{item.desc}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" defaultChecked={i < 3} className="sr-only peer" />
                      <div className="w-11 h-6 bg-secondary-600 peer-focus:ring-2 peer-focus:ring-primary-500/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Integrations */}
          {activeTab === 'integrations' && (
            <div className="card p-6">
              <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <Link2 className="w-5 h-5 text-secondary-400" />
                Integrations
              </h2>
              <div className="space-y-4">
                {[
                  { name: 'GitHub', icon: Github, status: 'available', desc: 'Connect repositories for automatic scanning' },
                  { name: 'GitLab', icon: Link2, status: 'coming', desc: 'Sync repositories from GitLab' },
                  { name: 'Slack', icon: Bell, status: 'coming', desc: 'Get notifications in Slack channels' },
                  { name: 'Jira', icon: Link2, status: 'coming', desc: 'Create Jira issues from findings' }
                ].map((item, i) => {
                  const Icon = item.icon
                  return (
                    <div key={i} className="flex items-center gap-4 p-4 bg-secondary-700/30 rounded-lg">
                      <div className="w-10 h-10 bg-secondary-700 rounded-lg flex items-center justify-center">
                        <Icon className="w-5 h-5 text-secondary-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-secondary-100 font-medium">{item.name}</p>
                        <p className="text-secondary-500 text-sm">{item.desc}</p>
                      </div>
                      {item.status === 'available' ? (
                        <button className="btn-primary text-sm">Connect</button>
                      ) : (
                        <span className="badge bg-warning-500/20 text-warning-400">Coming Soon</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* API Keys */}
          {activeTab === 'api' && (
            <div className="card p-6">
              <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <Key className="w-5 h-5 text-secondary-400" />
                API Keys
              </h2>
              <div className="mb-6">
                <p className="text-secondary-400 text-sm mb-4">
                  Create API keys to programmatically access your OmniGuard data.
                </p>
                <button className="btn-primary">
                  <Key className="w-4 h-4" />
                  Create API Key
                </button>
              </div>
              <div className="text-center py-8 text-secondary-500 border border-dashed border-secondary-700 rounded-lg">
                <Key className="w-10 h-10 mx-auto mb-3 text-secondary-600" />
                <p>No API keys created yet</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
