import { useState } from 'react'
import { Shield } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

export function Auth() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const { signIn, signUp } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    if (mode === 'signup') {
      const { error } = await signUp(email, password, firstName, lastName)
      if (error) {
        setError(error.message)
      } else {
        setMessage('Account created! You can now sign in.')
        setMode('signin')
      }
    } else {
      const { error } = await signIn(email, password)
      if (error) {
        setError(error.message)
      }
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-secondary-900 flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-900 via-primary-800 to-secondary-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        <div className="relative z-10 flex flex-col justify-center px-16">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center">
              <Shield className="w-10 h-10 text-primary-300" />
            </div>
            <h1 className="text-4xl font-bold text-white">OmniGuard</h1>
          </div>
          <h2 className="text-3xl font-semibold text-white/90 mb-4">
            Enterprise AI Security Platform
          </h2>
          <p className="text-lg text-white/70 max-w-md">
            Continuous security monitoring, AI-driven remediation, and comprehensive governance for your entire software ecosystem.
          </p>
          <div className="mt-12 grid grid-cols-2 gap-4 text-sm text-white/60">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-accent-500 rounded-full" />
              Multi-tenant Architecture
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-accent-500 rounded-full" />
              RBAC & Organization Isolation
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-accent-500 rounded-full" />
              Repository Scanning
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-accent-500 rounded-full" />
              AI-Powered Remediation
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-accent-500 rounded-full" />
              Vector Search & Embeddings
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-accent-500 rounded-full" />
              Comprehensive Audit Logs
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-8 py-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">OmniGuard</span>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">
              {mode === 'signin' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="text-secondary-400">
              {mode === 'signin' ? 'Sign in to continue to OmniGuard' : 'Get started with OmniGuard'}
            </p>
          </div>

          {error && (
            <div className="mb-6 px-4 py-3 bg-danger-500/10 border border-danger-500/20 rounded-lg text-danger-400 text-sm">
              {error}
            </div>
          )}

          {message && (
            <div className="mb-6 px-4 py-3 bg-accent-500/10 border border-accent-500/20 rounded-lg text-accent-400 text-sm">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="input"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="input"
                required
              />
            </div>

            <div>
              <label className="label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Create a strong password' : 'Enter your password'}
                className="input"
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-base font-semibold"
            >
              {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-secondary-400">
              {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
              <button
                onClick={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin')
                  setError(null)
                }}
                className="text-primary-400 hover:text-primary-300 font-medium"
              >
                {mode === 'signin' ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
