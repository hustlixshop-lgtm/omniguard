import { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Shield, ShieldCheck, Play, FileText, LayoutDashboard, GitBranch, TriangleAlert as AlertTriangle, Users, Settings, LogOut, Bell, ChevronDown, Search, Building2, Plus, X } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useOrganizations } from '../hooks/useOrganization'
import { useUnreadNotifications } from '../hooks/useAnalytics'
import { supabase, Tables } from '../lib/supabase'

type ReactNode = React.ReactNode

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/repositories', icon: GitBranch, label: 'Repositories' },
  { path: '/findings', icon: AlertTriangle, label: 'Findings' },
  { path: '/scans', icon: Play, label: 'Scans' },
  { path: '/policies', icon: Shield, label: 'Policies' },
  { path: '/compliance', icon: ShieldCheck, label: 'Compliance' },
  { path: '/teams', icon: Users, label: 'Teams' },
  { path: '/audit-logs', icon: FileText, label: 'Audit Logs' },
  { path: '/settings', icon: Settings, label: 'Settings' },
]

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, profile, signOut, currentOrganizationId, setCurrentOrganizationId } = useAuth()
  const { organizations, loading: orgLoading, createOrganization } = useOrganizations()
  const unreadCount = useUnreadNotifications(user?.id || null)

  const [showOrgDropdown, setShowOrgDropdown] = useState(false)
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [showCreateOrg, setShowCreateOrg] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{
    findings: Array<Pick<Tables<'findings'>, 'id' | 'title' | 'severity' | 'file_path' | 'status'>>
    repos: Array<Pick<Tables<'repositories'>, 'id' | 'name' | 'full_name' | 'risk_score'>>
  } | null>(null)
  const [searching, setSearching] = useState(false)

  const orgDropdownRef = useRef<HTMLDivElement>(null)
  const userDropdownRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentOrg = organizations.find((o) => o.id === currentOrganizationId)

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (orgDropdownRef.current && !orgDropdownRef.current.contains(e.target as Node)) setShowOrgDropdown(false)
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) setShowUserDropdown(false)
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifications(false)
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchResults(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Debounced search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (!searchQuery.trim() || !currentOrganizationId) { setSearchResults(null); return }

    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      const q = searchQuery.trim()
      const [findingsRes, reposRes] = await Promise.all([
        supabase.from('findings').select('id, title, severity, file_path, status').eq('organization_id', currentOrganizationId).ilike('title', `%${q}%`).limit(5),
        supabase.from('repositories').select('id, name, full_name, risk_score').eq('organization_id', currentOrganizationId).ilike('full_name', `%${q}%`).limit(5),
      ])
      setSearchResults({ findings: findingsRes.data || [], repos: reposRes.data || [] })
      setSearching(false)
    }, 300)
  }, [searchQuery, currentOrganizationId])

  const handleCreateOrg = async () => {
    if (!newOrgName.trim()) return
    const { data } = await createOrganization(newOrgName.trim())
    if (data) { setCurrentOrganizationId(data.id); setShowCreateOrg(false); setNewOrgName('') }
  }

  const handleSignOut = async () => { await signOut(); navigate('/auth') }

  return (
    <div className="min-h-screen bg-secondary-900 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-secondary-800/80 border-r border-secondary-700/50 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-secondary-700/50">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-white">OmniGuard</span>
          </Link>
        </div>

        {/* Organization Selector */}
        <div className="p-4 border-b border-secondary-700/50">
          <div className="relative" ref={orgDropdownRef}>
            <button
              onClick={() => setShowOrgDropdown((s) => !s)}
              className="w-full flex items-center gap-3 px-3 py-2.5 bg-secondary-700/50 border border-secondary-600/50 rounded-lg text-secondary-100 hover:bg-secondary-700 transition-colors"
            >
              <Building2 className="w-5 h-5 text-secondary-400 flex-shrink-0" />
              <span className="flex-1 truncate text-left text-sm">
                {orgLoading ? 'Loading...' : currentOrg?.name || 'Select Organization'}
              </span>
              <ChevronDown className={`w-4 h-4 text-secondary-400 transition-transform ${showOrgDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showOrgDropdown && (
              <div className="dropdown animate-fade-in">
                {organizations.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => { setCurrentOrganizationId(org.id); setShowOrgDropdown(false) }}
                    className={`dropdown-item ${org.id === currentOrganizationId ? 'bg-primary-500/10 text-primary-400' : ''}`}
                  >
                    <Building2 className="w-4 h-4" />
                    <span className="truncate">{org.name}</span>
                  </button>
                ))}
                <div className="border-t border-secondary-700 mt-1 pt-1">
                  <button
                    onClick={() => { setShowOrgDropdown(false); setShowCreateOrg(true) }}
                    className="dropdown-item text-primary-400 w-full"
                  >
                    <Plus className="w-4 h-4" />
                    Create Organization
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
            const Icon = item.icon
            return (
              <Link key={item.path} to={item.path} className={isActive ? 'sidebar-link-active' : 'sidebar-link'}>
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* User Menu */}
        <div className="p-4 border-t border-secondary-700/50">
          <div className="relative" ref={userDropdownRef}>
            <button
              onClick={() => setShowUserDropdown((s) => !s)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-secondary-700/50 rounded-lg transition-colors"
            >
              <div className="w-8 h-8 bg-secondary-700 rounded-lg flex items-center justify-center text-secondary-300 text-sm font-medium flex-shrink-0">
                {profile?.first_name?.[0] || profile?.email?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium text-secondary-100 truncate">
                  {[profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || profile?.email?.split('@')[0] || 'User'}
                </p>
                <p className="text-xs text-secondary-500 truncate">{profile?.email}</p>
              </div>
              <ChevronDown className={`w-4 h-4 text-secondary-400 transition-transform ${showUserDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showUserDropdown && (
              <div className="dropdown animate-fade-in">
                <Link to="/settings" onClick={() => setShowUserDropdown(false)} className="dropdown-item">
                  <Settings className="w-4 h-4" /> Settings
                </Link>
                <button onClick={handleSignOut} className="dropdown-item text-danger-400 w-full">
                  <LogOut className="w-4 h-4" /> Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-secondary-700/50 flex items-center px-6 gap-4">
          <div className="flex-1 flex items-center gap-4">
            {/* Global Search */}
            <div className="relative flex-1 max-w-md" ref={searchRef}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-500" />
              <input
                type="text"
                placeholder="Search findings, repositories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input pl-10 pr-10"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setSearchResults(null) }} className="absolute right-2 top-1/2 -translate-y-1/2 text-secondary-500 hover:text-secondary-300">
                  <X className="w-4 h-4" />
                </button>
              )}

              {/* Search results dropdown */}
              {(searchResults || searching) && searchQuery && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-secondary-800 border border-secondary-700 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
                  {searching ? (
                    <div className="p-4 text-center text-secondary-500 text-sm">Searching...</div>
                  ) : (
                    <>
                      {searchResults!.repos.length > 0 && (
                        <div>
                          <p className="px-4 py-2 text-xs font-medium text-secondary-500 uppercase tracking-wider">Repositories</p>
                          {searchResults!.repos.map((r) => (
                            <Link
                              key={r.id}
                              to="/repositories"
                              onClick={() => { setSearchQuery(''); setSearchResults(null) }}
                              className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary-700 text-secondary-200 text-sm"
                            >
                              <GitBranch className="w-4 h-4 text-secondary-500" />
                              {r.full_name}
                              <span className="ml-auto text-xs text-secondary-500">Risk: {r.risk_score}</span>
                            </Link>
                          ))}
                        </div>
                      )}
                      {searchResults!.findings.length > 0 && (
                        <div>
                          <p className="px-4 py-2 text-xs font-medium text-secondary-500 uppercase tracking-wider border-t border-secondary-700">Findings</p>
                          {searchResults!.findings.map((f) => (
                            <Link
                              key={f.id}
                              to="/findings"
                              onClick={() => { setSearchQuery(''); setSearchResults(null) }}
                              className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary-700 text-secondary-200 text-sm"
                            >
                              <AlertTriangle className="w-4 h-4 text-secondary-500" />
                              <span className="flex-1 truncate">{f.title}</span>
                              <span className={`badge text-xs ${f.severity === 'critical' ? 'badge-critical' : f.severity === 'high' ? 'badge-high' : 'badge-medium'}`}>
                                {f.severity}
                              </span>
                            </Link>
                          ))}
                        </div>
                      )}
                      {searchResults!.repos.length === 0 && searchResults!.findings.length === 0 && (
                        <div className="p-4 text-center text-secondary-500 text-sm">No results for "{searchQuery}"</div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Notification Bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setShowNotifications((s) => !s)}
              className="relative p-2 hover:bg-secondary-700/50 rounded-lg transition-colors"
            >
              <Bell className="w-5 h-5 text-secondary-400" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-danger-500 rounded-full flex items-center justify-center text-white text-[9px] font-bold px-0.5">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <NotificationsPanel userId={user?.id || null} onClose={() => setShowNotifications(false)} />
            )}
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      {/* Create Organization Modal */}
      {showCreateOrg && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateOrg(false)}>
          <div className="card-elevated p-6 w-full max-w-md animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-secondary-100 mb-4">Create Organization</h2>
            <div className="space-y-4">
              <div>
                <label className="label">Organization Name</label>
                <input
                  type="text"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="My Organization"
                  className="input"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateOrg()}
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowCreateOrg(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={handleCreateOrg} disabled={!newOrgName.trim()} className="btn-primary flex-1">Create</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Notifications Panel ──────────────────────────────────────────────────────

function NotificationsPanel({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const [notifications, setNotifications] = useState<Tables<'notifications'>[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => { setNotifications(data || []); setLoading(false) })
  }, [userId])

  const markAllRead = async () => {
    if (!userId) return
    await supabase.from('notifications').update({ read: true, read_at: new Date().toISOString() } as object).eq('user_id', userId).eq('read', false)
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true, read_at: new Date().toISOString() } as object).eq('id', id)
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n))
  }

  const notifIconMap: Record<string, string> = {
    critical_finding: '🔴',
    scan_completed: '✅',
    member_joined: '👤',
    policy_violation: '⚠️',
  }

  return (
    <div className="absolute right-0 top-full mt-2 w-96 bg-secondary-800 border border-secondary-700 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-700">
        <h3 className="text-secondary-100 font-medium">Notifications</h3>
        <button onClick={markAllRead} className="text-primary-400 hover:text-primary-300 text-sm">Mark all read</button>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-secondary-500 text-sm">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center text-secondary-500 text-sm">No notifications</div>
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => markRead(n.id)}
              className={`w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-secondary-700/50 transition-colors border-b border-secondary-700/30 ${!n.read ? 'bg-primary-500/5' : ''}`}
            >
              <span className="text-lg flex-shrink-0 mt-0.5">{notifIconMap[n.type] || '🔔'}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${n.read ? 'text-secondary-400' : 'text-secondary-100 font-medium'}`}>{n.title}</p>
                {n.body && <p className="text-xs text-secondary-500 mt-0.5 truncate">{n.body}</p>}
                <p className="text-xs text-secondary-600 mt-1">{new Date(n.created_at).toLocaleString()}</p>
              </div>
              {!n.read && <div className="w-2 h-2 bg-primary-500 rounded-full mt-2 flex-shrink-0" />}
            </button>
          ))
        )}
      </div>

      <div className="px-4 py-2 border-t border-secondary-700">
        <button onClick={onClose} className="text-secondary-500 text-xs hover:text-secondary-300 w-full text-center">Close</button>
      </div>
    </div>
  )
}
