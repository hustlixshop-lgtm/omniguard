import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Tables } from '../lib/supabase'
import { useAuth } from './useAuth'

type Repository = Tables<'repositories'>
type Scan = Tables<'scans'>
type Finding = Tables<'findings'>

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string

// ─── Repositories ─────────────────────────────────────────────────────────────

export function useRepositories(organizationId: string | null) {
  const { user } = useAuth()
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRepositories = useCallback(async () => {
    if (!organizationId) { setRepositories([]); setLoading(false); return }
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('repositories').select('*').eq('organization_id', organizationId)
      .is('deleted_at', null).order('created_at', { ascending: false })
    if (fetchError) setError(fetchError.message)
    else setRepositories(data || [])
    setLoading(false)
  }, [organizationId])

  useEffect(() => { fetchRepositories() }, [fetchRepositories])

  const connectRepository = async (repoData: {
    provider: string; provider_id: string; owner: string; name: string
    full_name: string; description?: string; default_branch?: string
    visibility?: string; language?: string
  }) => {
    if (!organizationId) return { error: 'No organization selected' }
    const { data, error: insertError } = await supabase.from('repositories').insert({
      organization_id: organizationId, created_by: user?.id, ...repoData,
      default_branch: repoData.default_branch || 'main',
      visibility: repoData.visibility || 'private',
    }).select().single()
    if (insertError) return { error: insertError.message }
    if (data) setRepositories(prev => [data, ...prev])
    return { error: null, data }
  }

  const triggerScan = async (repositoryId: string) => {
    if (!user || !organizationId) return { error: 'Not authenticated' }
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { error: 'No active session' }
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/api-v1-scans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ repository: repositoryId, trigger: 'manual' }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) return { error: json.error?.message || 'Scan trigger failed' }
      return { error: null, data: json.data }
    } catch (err) { return { error: err instanceof Error ? err.message : 'Network error' } }
  }

  const deleteRepository = async (repositoryId: string) => {
    const { error: updateError } = await supabase.from('repositories')
      .update({ deleted_at: new Date().toISOString() }).eq('id', repositoryId)
    if (updateError) return { error: updateError.message }
    setRepositories(prev => prev.filter(r => r.id !== repositoryId))
    return { error: null }
  }

  return { repositories, loading, error, connectRepository, triggerScan, deleteRepository, refetch: fetchRepositories }
}

// ─── Scans (per repository) ───────────────────────────────────────────────────

export function useScans(repositoryId: string | null) {
  const [scans, setScans] = useState<Scan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!repositoryId) { setScans([]); setLoading(false); return }
    const fetch_ = async () => {
      setLoading(true)
      const { data, error: fetchError } = await supabase.from('scans').select('*')
        .eq('repository_id', repositoryId).order('created_at', { ascending: false }).limit(50)
      if (fetchError) setError(fetchError.message)
      else setScans(data || [])
      setLoading(false)
    }
    fetch_()
    const channel = supabase.channel(`scans:${repositoryId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scans', filter: `repository_id=eq.${repositoryId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') setScans(prev => [payload.new as Scan, ...prev])
          else if (payload.eventType === 'UPDATE') setScans(prev => prev.map(s => s.id === (payload.new as Scan).id ? payload.new as Scan : s))
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [repositoryId])

  return { scans, loading, error }
}

// ─── All scans (org-wide, for Scans page) ────────────────────────────────────

export function useAllScans(organizationId: string | null) {
  const [scans, setScans] = useState<Array<Scan & { repository_name?: string }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!organizationId) { setScans([]); setLoading(false); return }
    const fetch_ = async () => {
      setLoading(true)
      const { data } = await supabase.from('scans')
        .select('*, repositories(name, full_name)').eq('organization_id', organizationId)
        .order('created_at', { ascending: false }).limit(100)
      setScans((data || []).map(s => ({ ...s, repository_name: (s.repositories as { full_name?: string } | null)?.full_name })))
      setLoading(false)
    }
    fetch_()
    const channel = supabase.channel(`all-scans:${organizationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scans', filter: `organization_id=eq.${organizationId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') setScans(prev => [payload.new as Scan, ...prev])
          else if (payload.eventType === 'UPDATE') setScans(prev => prev.map(s => s.id === (payload.new as Scan).id ? { ...(payload.new as Scan), repository_name: s.repository_name } : s))
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [organizationId])

  return { scans, loading }
}

// ─── Findings ─────────────────────────────────────────────────────────────────

export function useFindings(
  organizationId: string | null,
  filters?: { repositoryId?: string; severity?: string; status?: string; scanner?: string }
) {
  const [findings, setFindings] = useState<Finding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const filtersRef = useRef(filters)
  filtersRef.current = filters

  useEffect(() => {
    if (!organizationId) { setFindings([]); setLoading(false); return }

    const fetch_ = async () => {
      setLoading(true)
      let query = supabase.from('findings').select('*', { count: 'exact' }).eq('organization_id', organizationId)
      const f = filtersRef.current
      if (f?.repositoryId) query = query.eq('repository_id', f.repositoryId)
      if (f?.severity) query = query.eq('severity', f.severity)
      if (f?.status) query = query.eq('status', f.status)
      if (f?.scanner) query = query.eq('scanner', f.scanner)
      const { data, error: fetchError, count } = await query
        .order('risk_score', { ascending: false }).order('created_at', { ascending: false }).limit(200)
      if (fetchError) setError(fetchError.message)
      else { setFindings(data || []); setTotalCount(count || 0) }
      setLoading(false)
    }
    fetch_()

    // Realtime — findings appear live as scan-worker writes them
    const channel = supabase.channel(`findings:${organizationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'findings', filter: `organization_id=eq.${organizationId}` },
        (payload) => {
          const nf = payload.new as Finding
          const f = filtersRef.current
          if (f?.severity && nf.severity !== f.severity) return
          if (f?.status && nf.status !== f.status) return
          if (f?.scanner && nf.scanner !== f.scanner) return
          setFindings(prev => [nf, ...prev])
          setTotalCount(c => c + 1)
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'findings', filter: `organization_id=eq.${organizationId}` },
        (payload) => setFindings(prev => prev.map(f => f.id === (payload.new as Finding).id ? payload.new as Finding : f)))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [organizationId, filters?.repositoryId, filters?.severity, filters?.status, filters?.scanner])

  const updateFinding = async (findingId: string, updates: Partial<Finding>) => {
    const { error: updateError } = await supabase.from('findings').update(updates).eq('id', findingId)
    if (updateError) return { error: updateError.message }
    setFindings(prev => prev.map(f => f.id === findingId ? { ...f, ...updates } : f))
    return { error: null }
  }

  const assignFinding = (findingId: string, userId: string | null) =>
    updateFinding(findingId, {
      assigned_to: userId, assigned_at: userId ? new Date().toISOString() : null,
      status: userId ? 'assigned' : 'open',
    } as Partial<Finding>)

  const resolveFinding = async (findingId: string, note?: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    return updateFinding(findingId, {
      status: 'resolved', resolved_by: user?.id,
      resolved_at: new Date().toISOString(), resolution_note: note,
    } as Partial<Finding>)
  }

  const suppressFinding = async (findingId: string, reason: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { error: 'Not authenticated' }
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/api-v1-findings/${findingId}/suppress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ reason }),
      })
      const json = await res.json()
      if (!res.ok) return { error: json.error?.message || 'Suppress failed' }
      setFindings(prev => prev.map(f => f.id === findingId ? { ...f, status: 'suppressed' } : f))
      return { error: null }
    } catch (err) { return { error: err instanceof Error ? err.message : 'Network error' } }
  }

  const getAIRemediation = async (findingId: string): Promise<{ ai_remediation: string | null; remediation: string | null }> => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { ai_remediation: null, remediation: null }
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/api-v1-findings/${findingId}/ai-remediation`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      })
      if (!res.ok) return { ai_remediation: null, remediation: null }
      const json = await res.json()
      return json.data || { ai_remediation: null, remediation: null }
    } catch { return { ai_remediation: null, remediation: null } }
  }

  return { findings, loading, error, totalCount, updateFinding, assignFinding, resolveFinding, suppressFinding, getAIRemediation }
}
