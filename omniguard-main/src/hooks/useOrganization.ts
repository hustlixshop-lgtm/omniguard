import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Tables, UpdateTables } from '../lib/supabase'
import { useAuth } from './useAuth'

type Organization = Tables<'organizations'>
type Team = Tables<'teams'>
type OrgMember = Tables<'organization_members'>

export function useOrganizations() {
  const { user, currentOrganizationId } = useAuth()
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchOrganizations = useCallback(async () => {
    if (!user) {
      setOrganizations([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setOrganizations(data || [])
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchOrganizations()
  }, [fetchOrganizations])

  const createOrganization = async (name: string): Promise<{ data: Organization | null; error: string | null }> => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '').replace(/^-+/, '')

    const { data, error: createError } = await supabase
      .from('organizations')
      .insert({
        name,
        slug,
        plan: 'free',
        settings: {}
      })
      .select()
      .single()

    if (createError) {
      return { data: null, error: createError.message }
    }

    if (data) {
      await supabase.from('organization_members').insert({
        organization_id: data.id,
        user_id: user!.id,
        role: 'owner',
        status: 'active',
        joined_at: new Date().toISOString()
      })
    }

    await fetchOrganizations()
    return { data, error: null }
  }

  const updateOrganization = async (id: string, updates: UpdateTables<'organizations'>) => {
    const { data, error: updateError } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return { data: null, error: updateError.message }
    }

    await fetchOrganizations()
    return { data, error: null }
  }

  return {
    organizations,
    currentOrganization: organizations.find(o => o.id === currentOrganizationId) || null,
    loading,
    error,
    createOrganization,
    updateOrganization,
    refetch: fetchOrganizations
  }
}

export function useOrganizationMembers(organizationId: string | null) {
  const [members, setMembers] = useState<OrgMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!organizationId) {
      setMembers([])
      setLoading(false)
      return
    }

    const fetchMembers = async () => {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('organization_members')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true })

      if (fetchError) {
        setError(fetchError.message)
      } else {
        setMembers(data || [])
      }
      setLoading(false)
    }

    fetchMembers()
  }, [organizationId])

  const inviteMember = async (_email: string, _role: string) => {
    // Note: In a real app, this would send an invitation email
    // For now, we'll just add the user if they exist
    return { error: 'Invitation flow requires email service integration' }
  }

  const updateMemberRole = async (memberId: string, role: string) => {
    const { error: updateError } = await supabase
      .from('organization_members')
      .update({ role })
      .eq('id', memberId)

    if (updateError) {
      return { error: updateError.message }
    }

    setMembers(members.map(m => m.id === memberId ? { ...m, role } : m))
    return { error: null }
  }

  const removeMember = async (memberId: string) => {
    const { error: deleteError } = await supabase
      .from('organization_members')
      .delete()
      .eq('id', memberId)

    if (deleteError) {
      return { error: deleteError.message }
    }

    setMembers(members.filter(m => m.id !== memberId))
    return { error: null }
  }

  return {
    members,
    loading,
    error,
    inviteMember,
    updateMemberRole,
    removeMember
  }
}

export function useTeams(organizationId: string | null) {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!organizationId) {
      setTeams([])
      setLoading(false)
      return
    }

    const fetchTeams = async () => {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('teams')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true })

      if (fetchError) {
        setError(fetchError.message)
      } else {
        setTeams(data || [])
      }
      setLoading(false)
    }

    fetchTeams()
  }, [organizationId])

  const createTeam = async (name: string, description?: string) => {
    if (!organizationId) return { data: null, error: 'No organization selected' }

    const { data, error: createError } = await supabase
      .from('teams')
      .insert({
        organization_id: organizationId,
        name,
        description
      })
      .select()
      .single()

    if (createError) {
      return { data: null, error: createError.message }
    }

    if (data) {
      setTeams([...teams, data])
    }
    return { data, error: null }
  }

  const deleteTeam = async (teamId: string) => {
    const { error: deleteError } = await supabase
      .from('teams')
      .delete()
      .eq('id', teamId)

    if (deleteError) {
      return { error: deleteError.message }
    }

    setTeams(teams.filter(t => t.id !== teamId))
    return { error: null }
  }

  return {
    teams,
    loading,
    error,
    createTeam,
    deleteTeam
  }
}
