import { ReactNode, useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Shield,
  LayoutDashboard,
  GitBranch,
  AlertTriangle,
  Users,
  Settings,
  LogOut,
  Bell,
  ChevronDown,
  Search,
  Building2,
  Plus
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useOrganizations } from '../hooks/useOrganization'

interface LayoutProps {
  children: ReactNode
}

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/repositories', icon: GitBranch, label: 'Repositories' },
  { path: '/findings', icon: AlertTriangle, label: 'Findings' },
  { path: '/teams', icon: Users, label: 'Teams' },
  { path: '/settings', icon: Settings, label: 'Settings' }
]

export function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { profile, signOut, currentOrganizationId, setCurrentOrganizationId } = useAuth()
  const { organizations, loading: orgLoading, createOrganization } = useOrganizations()
  const [showOrgDropdown, setShowOrgDropdown] = useState(false)
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [showCreateOrg, setShowCreateOrg] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const orgDropdownRef = useRef<HTMLDivElement>(null)
  const userDropdownRef = useRef<HTMLDivElement>(null)

  const currentOrg = organizations.find(o => o.id === currentOrganizationId)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (orgDropdownRef.current && !orgDropdownRef.current.contains(event.target as Node)) {
        setShowOrgDropdown(false)
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleCreateOrg = async () => {
    if (!newOrgName.trim()) return
    const { data } = await createOrganization(newOrgName.trim())
    if (data) {
      setCurrentOrganizationId(data.id)
      setShowCreateOrg(false)
      setNewOrgName('')
    }
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/auth')
  }

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
              onClick={() => setShowOrgDropdown(!showOrgDropdown)}
              className="w-full flex items-center gap-3 px-3 py-2.5 bg-secondary-700/50 border border-secondary-600/50 rounded-lg text-secondary-100 hover:bg-secondary-700 transition-colors"
            >
              <Building2 className="w-5 h-5 text-secondary-400" />
              <span className="flex-1 truncate text-left text-sm">
                {orgLoading ? 'Loading...' : currentOrg?.name || 'Select Organization'}
              </span>
              <ChevronDown className={`w-4 h-4 text-secondary-400 transition-transform ${showOrgDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showOrgDropdown && (
              <div className="dropdown animate-fade-in">
                {organizations.map(org => (
                  <button
                    key={org.id}
                    onClick={() => {
                      setCurrentOrganizationId(org.id)
                      setShowOrgDropdown(false)
                    }}
                    className={`dropdown-item ${org.id === currentOrganizationId ? 'bg-primary-500/10 text-primary-400' : ''}`}
                  >
                    <Building2 className="w-4 h-4" />
                    <span className="truncate">{org.name}</span>
                  </button>
                ))}
                <div className="border-t border-secondary-700 mt-1 pt-1">
                  <button
                    onClick={() => {
                      setShowOrgDropdown(false)
                      setShowCreateOrg(true)
                    }}
                    className="dropdown-item text-primary-400"
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
              <Link
                key={item.path}
                to={item.path}
                className={isActive ? 'sidebar-link-active' : 'sidebar-link'}
              >
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
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-secondary-700/50 rounded-lg transition-colors"
            >
              <div className="w-8 h-8 bg-secondary-700 rounded-lg flex items-center justify-center text-secondary-300 text-sm font-medium">
                {profile?.first_name?.[0] || profile?.email?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-secondary-100 truncate">
                  {profile?.first_name || profile?.email?.split('@')[0] || 'User'}
                </p>
                <p className="text-xs text-secondary-500 truncate">{profile?.email}</p>
              </div>
              <ChevronDown className={`w-4 h-4 text-secondary-400 transition-transform ${showUserDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showUserDropdown && (
              <div className="dropdown animate-fade-in">
                <Link to="/settings" onClick={() => setShowUserDropdown(false)} className="dropdown-item">
                  <Settings className="w-4 h-4" />
                  Settings
                </Link>
                <button onClick={handleSignOut} className="dropdown-item text-danger-400 w-full">
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-16 border-b border-secondary-700/50 flex items-center px-6 gap-4">
          <div className="flex-1 flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-500" />
              <input
                type="text"
                placeholder="Search repositories, findings, policies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input pl-10"
              />
            </div>
          </div>
          <button className="relative p-2 hover:bg-secondary-700/50 rounded-lg transition-colors">
            <Bell className="w-5 h-5 text-secondary-400" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger-500 rounded-full" />
          </button>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      {/* Create Organization Modal */}
      {showCreateOrg && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateOrg(false)}>
          <div className="card-elevated p-6 w-full max-w-md animate-slide-up" onClick={e => e.stopPropagation()}>
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
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowCreateOrg(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={handleCreateOrg} className="btn-primary flex-1">Create</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
