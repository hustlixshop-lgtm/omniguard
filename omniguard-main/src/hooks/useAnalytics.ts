import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface DashboardStats {
  totalRepositories: number
  totalFindings: number
  criticalFindings: number
  highFindings: number
  mediumFindings: number
  lowFindings: number
  openFindings: number
  resolvedFindings: number
  averageRiskScore: number
  lastScanAt: string | null
}

interface FindingTrend {
  date: string
  critical: number
  high: number
  medium: number
  low: number
}

interface RepositoryHealth {
  id: string
  name: string
  riskScore: number
  findingsCount: number
  lastScanAt: string | null
}

export function useDashboardStats(organizationId: string | null) {
  const [stats, setStats] = useState<DashboardStats>({
    totalRepositories: 0,
    totalFindings: 0,
    criticalFindings: 0,
    highFindings: 0,
    mediumFindings: 0,
    lowFindings: 0,
    openFindings: 0,
    resolvedFindings: 0,
    averageRiskScore: 0,
    lastScanAt: null
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!organizationId) {
      setLoading(false)
      return
    }

    const fetchStats = async () => {
      setLoading(true)
      setError(null)

      try {
        // Get repository count
        const { count: repoCount } = await supabase
          .from('repositories')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .is('deleted_at', null)

        // Get finding counts by severity
        const { data: severityData } = await supabase
          .from('findings')
          .select('severity, status, risk_score')
          .eq('organization_id', organizationId)

        const { data: lastScan } = await supabase
          .from('scans')
          .select('created_at')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const critical = severityData?.filter(f => f.severity === 'critical').length || 0
        const high = severityData?.filter(f => f.severity === 'high').length || 0
        const medium = severityData?.filter(f => f.severity === 'medium').length || 0
        const low = severityData?.filter(f => f.severity === 'low').length || 0
        const open = severityData?.filter(f => f.status === 'open' || f.status === 'assigned' || f.status === 'in_progress').length || 0
        const resolved = severityData?.filter(f => f.status === 'resolved').length || 0

        const avgRisk = severityData && severityData.length > 0
          ? severityData.reduce((sum, f) => sum + (f.risk_score || 0), 0) / severityData.length
          : 0

        setStats({
          totalRepositories: repoCount || 0,
          totalFindings: severityData?.length || 0,
          criticalFindings: critical,
          highFindings: high,
          mediumFindings: medium,
          lowFindings: low,
          openFindings: open,
          resolvedFindings: resolved,
          averageRiskScore: Math.round(avgRisk * 10) / 10,
          lastScanAt: lastScan?.created_at || null
        })
      } catch (err) {
        setError('Failed to fetch dashboard stats')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [organizationId])

  return { stats, loading, error }
}

export function useFindingTrends(organizationId: string | null, days: number = 30) {
  const [trends, setTrends] = useState<FindingTrend[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!organizationId) {
      setLoading(false)
      return
    }

    const fetchTrends = async () => {
      setLoading(true)

      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      const { data } = await supabase
        .from('findings')
        .select('severity, created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true })

      if (data) {
        // Group by date
        const grouped: Record<string, FindingTrend> = {}
        data.forEach(finding => {
          const date = new Date(finding.created_at).toISOString().split('T')[0]
          if (!grouped[date]) {
            grouped[date] = { date, critical: 0, high: 0, medium: 0, low: 0 }
          }
          const key = finding.severity as keyof Omit<FindingTrend, 'date'>
          if (key in grouped[date]) {
            grouped[date][key]++
          }
        })
        setTrends(Object.values(grouped))
      }
      setLoading(false)
    }

    fetchTrends()
  }, [organizationId, days])

  return { trends, loading }
}

export function useRepositoryHealth(organizationId: string | null) {
  const [repositories, setRepositories] = useState<RepositoryHealth[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!organizationId) {
      setLoading(false)
      return
    }

    const fetchHealth = async () => {
      setLoading(true)

      const { data: repos } = await supabase
        .from('repositories')
        .select('id, name, risk_score, last_scan_at')
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .order('risk_score', { ascending: false })

      if (repos) {
        const healthData: RepositoryHealth[] = await Promise.all(
          repos.map(async (repo) => {
            const { count } = await supabase
              .from('findings')
              .select('*', { count: 'exact', head: true })
              .eq('repository_id', repo.id)
              .in('status', ['open', 'assigned', 'in_progress'])

            return {
              id: repo.id,
              name: repo.name,
              riskScore: repo.risk_score || 0,
              findingsCount: count || 0,
              lastScanAt: repo.last_scan_at
            }
          })
        )
        setRepositories(healthData)
      }
      setLoading(false)
    }

    fetchHealth()
  }, [organizationId])

  return { repositories, loading }
}

export function useRecentActivity(organizationId: string | null, limit: number = 10) {
  const [activity, setActivity] = useState<Array<{
    id: string
    action: string
    resource_type: string
    resource_name: string | null
    created_at: string
  }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!organizationId) {
      setLoading(false)
      return
    }

    const fetchActivity = async () => {
      setLoading(true)

      const { data } = await supabase
        .from('audit_logs')
        .select('id, action, resource_type, resource_name, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(limit)

      setActivity(data || [])
      setLoading(false)
    }

    fetchActivity()
  }, [organizationId, limit])

  return { activity, loading }
}
