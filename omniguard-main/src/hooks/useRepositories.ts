import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Tables } from '../lib/supabase'
import { useAuth } from './useAuth'

type Repository = Tables<'repositories'>
type Scan = Tables<'scans'>
type Finding = Tables<'findings'>

export function useRepositories(organizationId: string | null) {
  const { user } = useAuth()
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRepositories = useCallback(async () => {
    if (!organizationId) {
      setRepositories([])
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('repositories')
      .select('*')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setRepositories(data || [])
    }
    setLoading(false)
  }, [organizationId])

  useEffect(() => {
    fetchRepositories()
  }, [fetchRepositories])

  const connectRepository = async (repoData: {
    provider: string
    provider_id: string
    owner: string
    name: string
    full_name: string
    description?: string
    default_branch?: string
    visibility?: string
    language?: string
  }) => {
    if (!organizationId) return { error: 'No organization selected' }

    const { data, error: insertError } = await supabase
      .from('repositories')
      .insert({
        organization_id: organizationId,
        ...repoData,
        default_branch: repoData.default_branch || 'main',
        visibility: repoData.visibility || 'private'
      })
      .select()
      .single()

    if (insertError) {
      return { error: insertError.message }
    }

    if (data) {
      setRepositories([data, ...repositories])
    }
    return { error: null, data }
  }

  const triggerScan = async (repositoryId: string) => {
    if (!user || !organizationId) return { error: 'Not authenticated' }

    const { data, error: insertError } = await supabase
      .from('scans')
      .insert({
        repository_id: repositoryId,
        organization_id: organizationId,
        trigger: 'manual',
        created_by: user.id,
        status: 'queued'
      })
      .select()
      .single()

    if (insertError) {
      return { error: insertError.message }
    }
    return { error: null, data }
  }

  const deleteRepository = async (repositoryId: string) => {
    const { error: updateError } = await supabase
      .from('repositories')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', repositoryId)

    if (updateError) {
      return { error: updateError.message }
    }

    setRepositories(repositories.filter(r => r.id !== repositoryId))
    return { error: null }
  }

  return {
    repositories,
    loading,
    error,
    connectRepository,
    triggerScan,
    deleteRepository,
    refetch: fetchRepositories
  }
}

export function useScans(repositoryId: string | null) {
  const [scans, setScans] = useState<Scan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!repositoryId) {
      setScans([])
      setLoading(false)
      return
    }

    const fetchScans = async () => {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('scans')
        .select('*')
        .eq('repository_id', repositoryId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (fetchError) {
        setError(fetchError.message)
      } else {
        setScans(data || [])
      }
      setLoading(false)
    }

    fetchScans()

    // Subscribe to scan updates
    const channel = supabase
      .channel(`scans:${repositoryId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'scans',
        filter: `repository_id=eq.${repositoryId}`
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setScans(prev => [payload.new as Scan, ...prev])
        } else if (payload.eventType === 'UPDATE') {
          setScans(prev => prev.map(s => s.id === (payload.new as Scan).id ? payload.new as Scan : s))
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [repositoryId])

  return { scans, loading, error }
}

export function useFindings(organizationId: string | null, filters?: {
  repositoryId?: string
  severity?: string
  status?: string
  scanner?: string
}) {
  const [findings, setFindings] = useState<Finding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    if (!organizationId) {
      setFindings([])
      setLoading(false)
      return
    }

    const fetchFindings = async () => {
      setLoading(true)

      let query = supabase
        .from('findings')
        .select('*', { count: 'exact' })
        .eq('organization_id', organizationId)

      if (filters?.repositoryId) {
        query = query.eq('repository_id', filters.repositoryId)
      }
      if (filters?.severity) {
        query = query.eq('severity', filters.severity)
      }
      if (filters?.status) {
        query = query.eq('status', filters.status)
      }
      if (filters?.scanner) {
        query = query.eq('scanner', filters.scanner)
      }

      const { data, error: fetchError, count } = await query
        .order('created_at', { ascending: false })
        .limit(100)

      if (fetchError) {
        setError(fetchError.message)
      } else {
        setFindings(data || [])
        setTotalCount(count || 0)
      }
      setLoading(false)
    }

    fetchFindings()
  }, [organizationId, filters?.repositoryId, filters?.severity, filters?.status, filters?.scanner])

  const updateFinding = async (findingId: string, updates: Partial<Finding>) => {
    const { error: updateError } = await supabase
      .from('findings')
      .update(updates)
      .eq('id', findingId)

    if (updateError) {
      return { error: updateError.message }
    }

    setFindings(findings.map(f => f.id === findingId ? { ...f, ...updates } : f))
    return { error: null }
  }

  const assignFinding = async (findingId: string, userId: string | null) => {
    return updateFinding(findingId, {
      assigned_to: userId,
      assigned_at: userId ? new Date().toISOString() : null,
      status: userId ? 'assigned' : 'open'
    })
  }

  const resolveFinding = async (findingId: string, note?: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    return updateFinding(findingId, {
      status: 'resolved',
      resolved_by: user?.id,
      resolved_at: new Date().toISOString(),
      resolution_note: note
    })
  }

  return {
    findings,
    loading,
    error,
    totalCount,
    updateFinding,
    assignFinding,
    resolveFinding
  }
}
