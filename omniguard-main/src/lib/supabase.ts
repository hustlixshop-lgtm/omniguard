import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          logo_url: string | null
          plan: string
          settings: Record<string, unknown>
          created_by: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          name: string
          slug: string
          logo_url?: string | null
          plan?: string
          settings?: Record<string, unknown>
          created_by?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          logo_url?: string | null
          plan?: string
          settings?: Record<string, unknown>
          created_by?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
      }
      organization_members: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          role: string
          invited_by: string | null
          invited_at: string | null
          joined_at: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          role?: string
          invited_by?: string | null
          invited_at?: string | null
          joined_at?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          user_id?: string
          role?: string
          invited_by?: string | null
          invited_at?: string | null
          joined_at?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
      }
      teams: {
        Row: {
          id: string
          organization_id: string
          name: string
          description: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          description?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          description?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      team_members: {
        Row: {
          id: string
          team_id: string
          user_id: string
          role: string
          created_at: string
        }
        Insert: {
          id?: string
          team_id: string
          user_id: string
          role?: string
          created_at?: string
        }
        Update: {
          id?: string
          team_id?: string
          user_id?: string
          role?: string
          created_at?: string
        }
      }
      user_profiles: {
        Row: {
          id: string
          email: string
          first_name: string | null
          last_name: string | null
          avatar_url: string | null
          preferences: Record<string, unknown>
          last_login_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          first_name?: string | null
          last_name?: string | null
          avatar_url?: string | null
          preferences?: Record<string, unknown>
          last_login_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          first_name?: string | null
          last_name?: string | null
          avatar_url?: string | null
          preferences?: Record<string, unknown>
          last_login_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      repositories: {
        Row: {
          id: string
          organization_id: string
          team_id: string | null
          provider: string
          provider_id: string
          owner: string
          name: string
          full_name: string
          description: string | null
          default_branch: string
          visibility: string
          language: string | null
          languages: Record<string, unknown>
          size: number
          risk_score: number
          last_scan_at: string | null
          last_sync_at: string | null
          sync_status: string
          webhook_id: string | null
          webhook_secret: string | null
          is_active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          team_id?: string | null
          provider: string
          provider_id: string
          owner: string
          name: string
          full_name: string
          description?: string | null
          default_branch?: string
          visibility?: string
          language?: string | null
          languages?: Record<string, unknown>
          size?: number
          risk_score?: number
          last_scan_at?: string | null
          last_sync_at?: string | null
          sync_status?: string
          webhook_id?: string | null
          webhook_secret?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          organization_id?: string
          team_id?: string | null
          provider?: string
          provider_id?: string
          owner?: string
          name?: string
          full_name?: string
          description?: string | null
          default_branch?: string
          visibility?: string
          language?: string | null
          languages?: Record<string, unknown>
          size?: number
          risk_score?: number
          last_scan_at?: string | null
          last_sync_at?: string | null
          sync_status?: string
          webhook_id?: string | null
          webhook_secret?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
      }
      scans: {
        Row: {
          id: string
          repository_id: string
          organization_id: string
          status: string
          trigger: string
          branch: string | null
          commit_sha: string | null
          commit_message: string | null
          commit_author: string | null
          started_at: string | null
          completed_at: string | null
          duration_seconds: number | null
          summary: Record<string, unknown>
          error_message: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          repository_id: string
          organization_id: string
          status?: string
          trigger: string
          branch?: string | null
          commit_sha?: string | null
          commit_message?: string | null
          commit_author?: string | null
          started_at?: string | null
          completed_at?: string | null
          duration_seconds?: number | null
          summary?: Record<string, unknown>
          error_message?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          repository_id?: string
          organization_id?: string
          status?: string
          trigger?: string
          branch?: string | null
          commit_sha?: string | null
          commit_message?: string | null
          commit_author?: string | null
          started_at?: string | null
          completed_at?: string | null
          duration_seconds?: number | null
          summary?: Record<string, unknown>
          error_message?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      findings: {
        Row: {
          id: string
          organization_id: string
          scan_id: string | null
          repository_id: string
          scanner: string
          severity: string
          cvss_score: number | null
          cvss_vector: string | null
          title: string
          description: string | null
          evidence: string | null
          file_path: string | null
          line_start: number | null
          line_end: number | null
          column_start: number | null
          column_end: number | null
          rule_id: string | null
          rule_name: string | null
          owasp: string[]
          cwe: string[]
          mitre: string[]
          package_name: string | null
          package_version: string | null
          package_fixed_version: string | null
          cve_id: string | null
          remediation: string | null
          ai_summary: string | null
          ai_remediation: string | null
          status: string
          assigned_to: string | null
          assigned_at: string | null
          resolved_by: string | null
          resolved_at: string | null
          resolution_note: string | null
          suppressed_by: string | null
          suppressed_at: string | null
          suppress_reason: string | null
          risk_score: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          scan_id?: string | null
          repository_id: string
          scanner: string
          severity: string
          cvss_score?: number | null
          cvss_vector?: string | null
          title: string
          description?: string | null
          evidence?: string | null
          file_path?: string | null
          line_start?: number | null
          line_end?: number | null
          column_start?: number | null
          column_end?: number | null
          rule_id?: string | null
          rule_name?: string | null
          owasp?: string[]
          cwe?: string[]
          mitre?: string[]
          package_name?: string | null
          package_version?: string | null
          package_fixed_version?: string | null
          cve_id?: string | null
          remediation?: string | null
          ai_summary?: string | null
          ai_remediation?: string | null
          status?: string
          assigned_to?: string | null
          assigned_at?: string | null
          resolved_by?: string | null
          resolved_at?: string | null
          resolution_note?: string | null
          suppressed_by?: string | null
          suppressed_at?: string | null
          suppress_reason?: string | null
          risk_score?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          scan_id?: string | null
          repository_id?: string
          scanner?: string
          severity?: string
          cvss_score?: number | null
          cvss_vector?: string | null
          title?: string
          description?: string | null
          evidence?: string | null
          file_path?: string | null
          line_start?: number | null
          line_end?: number | null
          column_start?: number | null
          column_end?: number | null
          rule_id?: string | null
          rule_name?: string | null
          owasp?: string[]
          cwe?: string[]
          mitre?: string[]
          package_name?: string | null
          package_version?: string | null
          package_fixed_version?: string | null
          cve_id?: string | null
          remediation?: string | null
          ai_summary?: string | null
          ai_remediation?: string | null
          status?: string
          assigned_to?: string | null
          assigned_at?: string | null
          resolved_by?: string | null
          resolved_at?: string | null
          resolution_note?: string | null
          suppressed_by?: string | null
          suppressed_at?: string | null
          suppress_reason?: string | null
          risk_score?: number
          created_at?: string
          updated_at?: string
        }
      }
      documents: {
        Row: {
          id: string
          organization_id: string
          uploaded_by: string | null
          title: string
          filename: string
          mime_type: string
          size_bytes: number | null
          storage_path: string
          document_type: string | null
          category: string | null
          tags: string[]
          version: number
          status: string
          embedding_status: string
          chunk_count: number
          metadata: Record<string, unknown>
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          uploaded_by?: string | null
          title: string
          filename: string
          mime_type: string
          size_bytes?: number | null
          storage_path: string
          document_type?: string | null
          category?: string | null
          tags?: string[]
          version?: number
          status?: string
          embedding_status?: string
          chunk_count?: number
          metadata?: Record<string, unknown>
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          organization_id?: string
          uploaded_by?: string | null
          title?: string
          filename?: string
          mime_type?: string
          size_bytes?: number | null
          storage_path?: string
          document_type?: string | null
          category?: string | null
          tags?: string[]
          version?: number
          status?: string
          embedding_status?: string
          chunk_count?: number
          metadata?: Record<string, unknown>
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
      }
      policies: {
        Row: {
          id: string
          organization_id: string
          created_by: string | null
          title: string
          category: string | null
          description: string | null
          content: string
          severity: string
          tags: string[]
          compliance_mappings: Record<string, unknown>
          version: number
          status: string
          approved_by: string | null
          approved_at: string | null
          owner_id: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          created_by?: string | null
          title: string
          category?: string | null
          description?: string | null
          content: string
          severity?: string
          tags?: string[]
          compliance_mappings?: Record<string, unknown>
          version?: number
          status?: string
          approved_by?: string | null
          approved_at?: string | null
          owner_id?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          organization_id?: string
          created_by?: string | null
          title?: string
          category?: string | null
          description?: string | null
          content?: string
          severity?: string
          tags?: string[]
          compliance_mappings?: Record<string, unknown>
          version?: number
          status?: string
          approved_by?: string | null
          approved_at?: string | null
          owner_id?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
      }
      notifications: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          type: string
          title: string
          body: string | null
          data: Record<string, unknown>
          read: boolean
          read_at: string | null
          action_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          type: string
          title: string
          body?: string | null
          data?: Record<string, unknown>
          read?: boolean
          read_at?: string | null
          action_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          user_id?: string
          type?: string
          title?: string
          body?: string | null
          data?: Record<string, unknown>
          read?: boolean
          read_at?: string | null
          action_url?: string | null
          created_at?: string
        }
      }
      reports: {
        Row: {
          id: string
          organization_id: string
          created_by: string | null
          type: string
          title: string
          description: string | null
          format: string
          status: string
          storage_path: string | null
          parameters: Record<string, unknown>
          generated_at: string | null
          expires_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          created_by?: string | null
          type: string
          title: string
          description?: string | null
          format?: string
          status?: string
          storage_path?: string | null
          parameters?: Record<string, unknown>
          generated_at?: string | null
          expires_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          created_by?: string | null
          type?: string
          title?: string
          description?: string | null
          format?: string
          status?: string
          storage_path?: string | null
          parameters?: Record<string, unknown>
          generated_at?: string | null
          expires_at?: string | null
          created_at?: string
        }
      }
      audit_logs: {
        Row: {
          id: string
          organization_id: string | null
          user_id: string | null
          request_id: string | null
          session_id: string | null
          ip_address: string | null
          user_agent: string | null
          action: string
          resource_type: string
          resource_id: string | null
          resource_name: string | null
          old_values: Record<string, unknown> | null
          new_values: Record<string, unknown> | null
          metadata: Record<string, unknown>
          created_at: string
        }
        Insert: {
          id?: string
          organization_id?: string | null
          user_id?: string | null
          request_id?: string | null
          session_id?: string | null
          ip_address?: string | null
          user_agent?: string | null
          action: string
          resource_type: string
          resource_id?: string | null
          resource_name?: string | null
          old_values?: Record<string, unknown> | null
          new_values?: Record<string, unknown> | null
          metadata?: Record<string, unknown>
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string | null
          user_id?: string | null
          request_id?: string | null
          session_id?: string | null
          ip_address?: string | null
          user_agent?: string | null
          action?: string
          resource_type?: string
          resource_id?: string | null
          resource_name?: string | null
          old_values?: Record<string, unknown> | null
          new_values?: Record<string, unknown> | null
          metadata?: Record<string, unknown>
          created_at?: string
        }
      }
      integrations: {
        Row: {
          id: string
          organization_id: string
          created_by: string | null
          provider: string
          name: string
          config: Record<string, unknown>
          secrets_ref: string | null
          status: string
          error_message: string | null
          last_sync_at: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          created_by?: string | null
          provider: string
          name: string
          config?: Record<string, unknown>
          secrets_ref?: string | null
          status?: string
          error_message?: string | null
          last_sync_at?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          organization_id?: string
          created_by?: string | null
          provider?: string
          name?: string
          config?: Record<string, unknown>
          secrets_ref?: string | null
          status?: string
          error_message?: string | null
          last_sync_at?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
      }
      api_keys: {
        Row: {
          id: string
          organization_id: string
          created_by: string | null
          name: string
          key_hash: string
          key_prefix: string
          scopes: string[]
          expires_at: string | null
          last_used_at: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          created_by?: string | null
          name: string
          key_hash: string
          key_prefix: string
          scopes?: string[]
          expires_at?: string | null
          last_used_at?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          created_by?: string | null
          name?: string
          key_hash?: string
          key_prefix?: string
          scopes?: string[]
          expires_at?: string | null
          last_used_at?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {}
    Functions: {
      generate_slug: {
        Args: { name: string }
        Returns: string
      }
      is_org_member: {
        Args: { org_id: string }
        Returns: boolean
      }
      is_org_admin: {
        Args: { org_id: string }
        Returns: boolean
      }
    }
    Enums: {}
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
