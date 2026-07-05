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

interface RepositoryHealth {
  id: string
  name: string
  full_name: string
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
    lastScanAt: null,
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
        const [repoRes, findingsRes, lastScanRes] = await Promise.all([
          supabase
            .from('repositories')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organizationId)
            .is('deleted_at', null),
          supabase
            .from('findings')
            .select('severity, status, risk_score')
            .eq('organization_id', organizationId),
          supabase
            .from('scans')
            .select('created_at')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])

        const findingsData = findingsRes.data || []
        const openStatuses = new Set(['open', 'assigned', 'in_progress'])

        setStats({
          totalRepositories: repoRes.count || 0,
          totalFindings: findingsData.length,
          criticalFindings: findingsData.filter((f) => f.severity === 'critical').length,
          highFindings: findingsData.filter((f) => f.severity === 'high').length,
          mediumFindings: findingsData.filter((f) => f.severity === 'medium').length,
          lowFindings: findingsData.filter((f) => f.severity === 'low').length,
          openFindings: findingsData.filter((f) => openStatuses.has(f.status)).length,
          resolvedFindings: findingsData.filter((f) => f.status === 'resolved').length,
          averageRiskScore:
            findingsData.length > 0
              ? Math.round((findingsData.reduce((s, f) => s + (f.risk_score || 0), 0) / findingsData.length) * 10) / 10
              : 0,
          lastScanAt: lastScanRes.data?.created_at || null,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch stats')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [organizationId])

  return { stats, loading, error }
}

export function useFindingTrends(organizationId: string | null, days = 30) {
  const [trends, setTrends] = useState<Array<{ date: string; critical: number; high: number; medium: number; low: number }>>([])
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
        const grouped: Record<string, { date: string; critical: number; high: number; medium: number; low: number }> = {}
        data.forEach((f) => {
          const date = new Date(f.created_at).toISOString().split('T')[0]
          if (!grouped[date]) grouped[date] = { date, critical: 0, high: 0, medium: 0, low: 0 }
          const key = f.severity as 'critical' | 'high' | 'medium' | 'low'
          if (key in grouped[date]) grouped[date][key]++
        })
        setTrends(Object.values(grouped))
      }
      setLoading(false)
    }

    fetchTrends()
  }, [organizationId, days])

  return { trends, loading }
}

// Fixed: single query with grouped counts instead of N+1 per-repo queries
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

      // Fetch repos + aggregate finding counts in one pass
      const [reposRes, findingCountsRes] = await Promise.all([
        supabase
          .from('repositories')
          .select('id, name, full_name, risk_score, last_scan_at')
          .eq('organization_id', organizationId)
          .is('deleted_at', null)
          .order('risk_score', { ascending: false })
          .limit(20),
        supabase
          .from('findings')
          .select('repository_id')
          .eq('organization_id', organizationId)
          .in('status', ['open', 'assigned', 'in_progress']),
      ])

      if (!reposRes.data) {
        setLoading(false)
        return
      }

      // Build count map from the flat findings list
      const countMap: Record<string, number> = {}
      for (const f of findingCountsRes.data || []) {
        countMap[f.repository_id] = (countMap[f.repository_id] || 0) + 1
      }

      setRepositories(
        reposRes.data.map((r) => ({
          id: r.id,
          name: r.name,
          full_name: r.full_name,
          riskScore: r.risk_score || 0,
          findingsCount: countMap[r.id] || 0,
          lastScanAt: r.last_scan_at,
        }))
      )
      setLoading(false)
    }

    fetchHealth()
  }, [organizationId])

  return { repositories, loading }
}

export function useRecentActivity(organizationId: string | null, limit = 10) {
  const [activity, setActivity] = useState<
    Array<{
      id: string
      action: string
      resource_type: string
      resource_name: string | null
      created_at: string
    }>
  >([])
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

export function useUnreadNotifications(userId: string | null) {
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!userId) return

    const fetchCount = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false)
      setUnreadCount(count || 0)
    }

    fetchCount()

    // Subscribe to new notifications
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => {
        setUnreadCount((c) => c + 1)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => {
        fetchCount()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  return unreadCount
}
