import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Repositories } from './pages/Repositories'
import { Findings } from './pages/Findings'
import { Teams } from './pages/Teams'
import { Settings } from './pages/Settings'
import { Auth } from './pages/Auth'
import { Scans } from './pages/Scans'
import { Policies } from './pages/Policies'
import { Compliance } from './pages/Compliance'
import { AuditLogs } from './pages/AuditLogs'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen bg-secondary-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-secondary-400">Loading OmniGuard...</p>
        </div>
      </div>
    )
  }
  if (!user) return <Navigate to="/auth" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen bg-secondary-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-secondary-400">Loading OmniGuard...</p>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate to="/" replace /> : <Auth />} />
      <Route path="/*" element={
        <ProtectedRoute>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/repositories" element={<Repositories />} />
              <Route path="/repositories/:id/*" element={<Repositories />} />
              <Route path="/findings" element={<Findings />} />
              <Route path="/scans" element={<Scans />} />
              <Route path="/policies" element={<Policies />} />
              <Route path="/compliance" element={<Compliance />} />
              <Route path="/audit-logs" element={<AuditLogs />} />
              <Route path="/teams" element={<Teams />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </ProtectedRoute>
      } />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
