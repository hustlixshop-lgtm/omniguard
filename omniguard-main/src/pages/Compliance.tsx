import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { ShieldCheck, CircleAlert as AlertCircle, CircleCheck as CheckCircle, TrendingUp } from 'lucide-react'

const FRAMEWORKS = [
  { id: 'soc2', name: 'SOC 2 Type II', description: 'Security, Availability, Confidentiality', controls: 64 },
  { id: 'iso27001', name: 'ISO 27001:2022', description: 'Information Security Management', controls: 93 },
  { id: 'pci-dss', name: 'PCI DSS v4.0', description: 'Payment Card Industry', controls: 12 },
  { id: 'hipaa', name: 'HIPAA', description: 'Health Insurance Portability', controls: 18 },
  { id: 'owasp-asvs', name: 'OWASP ASVS 4.0', description: 'Application Security Verification', controls: 286 },
  { id: 'nist-csf', name: 'NIST CSF 2.0', description: 'Cybersecurity Framework', controls: 108 },
]

export function Compliance() {
  const { currentOrganizationId } = useAuth()
  const [stats, setStats] = useState({ total: 0, open: 0, resolved: 0 })
  const [frameworks, setFrameworks] = useState(FRAMEWORKS.map(f => ({ ...f, critical: 0, high: 0, score: 100 })))
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    if (!currentOrganizationId) return
    supabase.from('findings').select('severity, status').eq('organization_id', currentOrganizationId)
      .then(({ data }) => {
        const findings = data || []
        const open = findings.filter(f => ['open','assigned','in_progress'].includes(f.status)).length
        setStats({ total: findings.length, open, resolved: findings.filter(f => f.status === 'resolved').length })
        const critical = findings.filter(f => f.severity === 'critical' && ['open','assigned','in_progress'].includes(f.status)).length
        const high = findings.filter(f => f.severity === 'high' && ['open','assigned','in_progress'].includes(f.status)).length
        setFrameworks(FRAMEWORKS.map(fw => ({
          ...fw, critical, high,
          score: Math.max(0, Math.round(100 - critical * 10 - high * 3 - (open * 0.5))),
        })))
        setLoading(false)
      })
  }, [currentOrganizationId])

  const overallScore = frameworks.length ? Math.round(frameworks.reduce((s, f) => s + f.score, 0) / frameworks.length) : 0
  const scoreColor = overallScore >= 80 ? 'text-accent-400' : overallScore >= 60 ? 'text-warning-400' : 'text-danger-400'

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-white">Compliance</h1>
        <p className="text-secondary-400 mt-1">Security posture mapped against industry frameworks</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="stat-card col-span-1">
          <p className={`text-5xl font-bold font-mono ${scoreColor}`}>{loading ? '—' : overallScore}</p>
          <p className="text-secondary-400 text-sm">Overall Score</p>
          <p className="text-secondary-600 text-xs mt-1">Across {FRAMEWORKS.length} frameworks</p>
        </div>
        {[
          { label: 'Total Findings', value: stats.total, color: 'text-secondary-200' },
          { label: 'Open Issues', value: stats.open, color: 'text-warning-400' },
          { label: 'Resolved', value: stats.resolved, color: 'text-accent-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="stat-card">
            <p className={`text-3xl font-bold font-mono ${color}`}>{loading ? '—' : value}</p>
            <p className="text-secondary-400 text-sm">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {frameworks.map((fw) => (
          <div key={fw.id}
            className={`card p-5 cursor-pointer hover:border-secondary-600 transition-all ${active === fw.id ? 'border-primary-500/30' : ''}`}
            onClick={() => setActive(active === fw.id ? null : fw.id)}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-secondary-400" />
                  <h3 className="text-secondary-100 font-semibold">{fw.name}</h3>
                </div>
                <p className="text-secondary-500 text-sm mt-0.5">{fw.description}</p>
              </div>
              <div className="text-right">
                <p className={`text-3xl font-bold font-mono ${fw.score >= 80 ? 'text-accent-400' : fw.score >= 60 ? 'text-warning-400' : 'text-danger-400'}`}>{fw.score}</p>
                <p className="text-secondary-500 text-xs">/ 100</p>
              </div>
            </div>
            <div className="h-2 bg-secondary-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${fw.score >= 80 ? 'bg-accent-500' : fw.score >= 60 ? 'bg-warning-500' : 'bg-danger-500'}`}
                style={{ width: `${fw.score}%` }} />
            </div>
            <div className="flex items-center justify-between mt-3 text-sm">
              <div className="flex gap-3">
                {fw.critical > 0 && <span className="flex items-center gap-1 text-danger-400 text-xs"><AlertCircle className="w-3 h-3" />{fw.critical} critical</span>}
                {fw.high > 0 && <span className="flex items-center gap-1 text-warning-400 text-xs"><AlertCircle className="w-3 h-3" />{fw.high} high</span>}
                {fw.critical === 0 && fw.high === 0 && <span className="flex items-center gap-1 text-accent-400 text-xs"><CheckCircle className="w-3 h-3" />No critical issues</span>}
              </div>
              <span className="text-secondary-500 text-xs">{fw.controls} controls</span>
            </div>
            {active === fw.id && (
              <div className="mt-4 pt-4 border-t border-secondary-700 animate-fade-in">
                <p className="text-secondary-400 text-sm mb-3">
                  Score is based on open finding severity. {fw.critical > 0
                    ? `Resolve ${fw.critical} critical finding${fw.critical > 1 ? 's' : ''} to significantly improve.`
                    : 'No critical violations detected.'}
                </p>
                <div className="grid grid-cols-3 gap-3 text-xs text-center">
                  <div className="bg-secondary-800 p-2 rounded-lg"><p className={`text-lg font-bold font-mono ${fw.score >= 80 ? 'text-accent-400' : 'text-warning-400'}`}>{fw.score}%</p><p className="text-secondary-500">Passing</p></div>
                  <div className="bg-secondary-800 p-2 rounded-lg"><p className="text-lg font-bold font-mono text-danger-400">{fw.critical + fw.high}</p><p className="text-secondary-500">Blocking</p></div>
                  <div className="bg-secondary-800 p-2 rounded-lg"><p className="text-lg font-bold font-mono text-secondary-400">{fw.controls}</p><p className="text-secondary-500">Controls</p></div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card p-4 flex items-start gap-3">
        <TrendingUp className="w-5 h-5 text-primary-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-secondary-200 font-medium">Improving Your Score</p>
          <p className="text-secondary-500 text-sm mt-1">Resolving critical and high findings improves all framework scores. Suppressing confirmed false positives with documented reasons also counts toward compliance posture.</p>
        </div>
      </div>
    </div>
  )
}
