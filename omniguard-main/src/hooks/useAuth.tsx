import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, Session, AuthError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { Tables } from '../lib/supabase'

type Profile = Tables<'user_profiles'>
type OrgMember = Tables<'organization_members'>

interface AuthContextType {
  user: User | null
  profile: Profile | null
  session: Session | null
  memberships: OrgMember[]
  currentOrganizationId: string | null
  setCurrentOrganizationId: (id: string | null) => void
  loading: boolean
  signUp: (email: string, password: string, firstName?: string, lastName?: string) => Promise<{ error: AuthError | null }>
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [memberships, setMemberships] = useState<OrgMember[]>([])
  const [currentOrganizationId, setCurrentOrganizationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const initSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setSession(session)
      setUser(session?.user ?? null)

      if (session?.user) {
        await fetchProfileAndMemberships(session.user.id)
      }
      setLoading(false)
    }

    initSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)

      if (session?.user) {
        await fetchProfileAndMemberships(session.user.id)
      } else {
        setProfile(null)
        setMemberships([])
        setCurrentOrganizationId(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchProfileAndMemberships = async (userId: string) => {
    const [profileRes, membershipsRes] = await Promise.all([
      supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('organization_members').select('*').eq('user_id', userId).eq('status', 'active')
    ])

    if (profileRes.data) {
      setProfile(profileRes.data)
    }

    if (membershipsRes.data) {
      setMemberships(membershipsRes.data)
      if (!currentOrganizationId && membershipsRes.data.length > 0) {
        setCurrentOrganizationId(membershipsRes.data[0].organization_id)
      }
    }
  }

  const signUp = async (email: string, password: string, firstName?: string, lastName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName
        }
      }
    })
    return { error }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setSession(null)
    setMemberships([])
    setCurrentOrganizationId(null)
  }

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    return { error }
  }

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      session,
      memberships,
      currentOrganizationId,
      setCurrentOrganizationId,
      loading,
      signUp,
      signIn,
      signOut,
      resetPassword
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
