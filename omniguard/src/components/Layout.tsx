import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useNotifications } from '../hooks/useRepositories'
import { Shield, LayoutDashboard, GitBranch, TriangleAlert as AlertTriangle, Play, ClipboardList, ShieldCheck, Users, FileText, Settings, LogOut, Bell, X, ChevronDown } from 'lucide-react'

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/repositories', icon: GitBranch, label: 'Repositories' },
  { to: '/findings', icon: AlertTriangle, label: 'Findings' },
  { to: '/scans', icon: Play, label: 'Scans' },
  { to: '/policies', icon: ClipboardList, label: 'Policies' },
  { to: '/compliance', icon: ShieldCheck, label: 'Compliance' },
  { to: '/teams', icon: Users, label: 'Teams' },
  { to: '/audit-logs', icon: FileText, label: 'Audit Logs' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, profile, memberships, currentOrganizationId, setCurrentOrganizationId, signOut } = useAuth()
  const { notifications, unreadCount, markAllRead } = useNotifications(user?.id || null)
  const [showNotifs, setShowNotifs] = useState(false)
  const [showOrgMenu, setShowOrgMenu] = useState(false)
  const navigate = useNavigate()

  const orgs = memberships.map(m => ({ id: m.organization_id, role: m.role }))
  const displayName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email : user?.email || ''

  return (
    <div className="flex min-h-screen" style={{ background: '#0a0f1e' }}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="px-4 pb-4 border-b border-[#1e293b] mb-2">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-500" />
            <span className="text-white font-bold text-lg">OmniGuard</span>
          </div>
          {orgs.length > 1 && (
            <div className="relative mt-2">
              <button onClick={() => setShowOrgMenu(!showOrgMenu)} className="w-full flex items-center justify-between px-2 py-1 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
                <span className="truncate">Org: {currentOrganizationId?.slice(0,8)}…</span>
                <ChevronDown className="w-3 h-3 flex-shrink-0" />
              </button>
              {showOrgMenu && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50">
                  {orgs.map(o => (
                    <button key={o.id} onClick={() => { setCurrentOrganizationId(o.id); setShowOrgMenu(false) }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-700 transition-colors ${currentOrganizationId === o.id ? 'text-blue-400' : 'text-slate-300'}`}>
                      {o.id.slice(0,8)}… · {o.role}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <nav className="flex-1 px-1">
          {NAV.map(({ to, icon: Icon, label, exact }) => (
            <NavLink key={to} to={to} end={exact}
              className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 pt-4 border-t border-[#1e293b]">
          <div className="text-xs text-slate-400 mb-3 truncate">{displayName}</div>
          <button onClick={() => signOut().then(() => navigate('/auth'))} className="btn-ghost w-full justify-start text-slate-500 text-xs">
            <LogOut className="w-3 h-3" /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="main-content flex-1">
        {/* Top bar */}
        <header className="sticky top-0 z-40 flex items-center justify-end gap-3 px-6 py-3 border-b border-[#1e293b]" style={{ background: '#0a0f1e' }}>
          {/* Notification bell */}
          <div className="relative">
            <button onClick={() => { setShowNotifs(!showNotifs); if (!showNotifs && unreadCount > 0) markAllRead() }}
              className="relative btn-ghost p-2 text-slate-400 hover:text-white">
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>
            {showNotifs && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                  <span className="text-sm font-medium text-slate-200">Notifications</span>
                  <button onClick={() => setShowNotifs(false)} className="text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-slate-500">No notifications</p>
                  ) : notifications.slice(0, 20).map(n => (
                    <div key={n.id} className={`px-4 py-3 border-b border-slate-800 hover:bg-slate-750 transition-colors ${!n.read_at ? 'bg-slate-800/50' : ''}`}>
                      <div className="flex items-start gap-2">
                        {!n.read_at && <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-200 font-medium">{n.title}</p>
                          {n.body && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>}
                          <p className="text-xs text-slate-600 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </header>

        <main>{children}</main>
      </div>
    </div>
  )
}
