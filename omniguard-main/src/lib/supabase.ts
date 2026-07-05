import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

// ─── Database Types (generated from schema) ────────────────────────────────────

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
        }
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>
      }
      organization_members: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          role: 'owner' | 'admin' | 'engineer' | 'developer' | 'auditor'
          invited_by: string | null
          invited_at: string | null
          joined_at: string | null
          status: 'pending' | 'active' | 'inactive'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          role?: 'owner' | 'admin' | 'engineer' | 'developer' | 'auditor'
          invited_by?: string | null
          invited_at?: string | null
          joined_at?: string | null
          status?: 'pending' | 'active' | 'inactive'
        }
        Update: Partial<Database['public']['Tables']['organization_members']['Insert']>
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
        }
        Update: Partial<Omit<Database['public']['Tables']['user_profiles']['Insert'], 'id'>>
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
        }
        Update: Partial<Omit<Database['public']['Tables']['teams']['Insert'], 'id' | 'organization_id'>>
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
        }
        Update: Partial<Omit<Database['public']['Tables']['team_members']['Insert'], 'id'>>
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
          metadata: Record<string, unknown> | null
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
          is_active?: boolean
          created_by?: string | null
        }
        Update: Partial<Omit<Database['public']['Tables']['repositories']['Insert'], 'id' | 'organization_id'>>
      }
      scans: {
        Row: {
          id: string
          repository_id: string
          organization_id: string
          status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
          trigger: 'manual' | 'webhook' | 'scheduled' | 'pull_request' | 'api' | 'retry'
          scan_type: string | null
          branch: string | null
          commit_sha: string | null
          commit_message: string | null
          commit_author: string | null
          priority: number
          started_at: string | null
          completed_at: string | null
          duration_seconds: number | null
          summary: Record<string, unknown>
          error_message: string | null
          worker_id: string | null
          created_by: string | null
          created_at: string
          updated_at: string
          metadata: Record<string, unknown> | null
        }
        Insert: {
          id?: string
          repository_id: string
          organization_id: string
          status?: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
          trigger: string
          scan_type?: string | null
          branch?: string | null
          commit_sha?: string | null
          commit_message?: string | null
          commit_author?: string | null
          priority?: number
          created_by?: string | null
          metadata?: Record<string, unknown> | null
        }
        Update: Partial<Omit<Database['public']['Tables']['scans']['Insert'], 'id'>>
      }
      scan_queue: {
        Row: {
          id: string
          scan_id: string
          organization_id: string
          repository_id: string
          priority: number
          status: 'pending' | 'processing' | 'done' | 'failed'
          worker_id: string | null
          claimed_at: string | null
          created_at: string
        }
        Insert: {
          scan_id: string
          organization_id: string
          repository_id: string
          priority?: number
          status?: string
        }
        Update: Partial<Database['public']['Tables']['scan_queue']['Insert']>
      }
      scan_artifacts: {
        Row: {
          id: string
          scan_id: string
          organization_id: string
          artifact_type: string
          storage_path: string
          filename: string
          size_bytes: number | null
          mime_type: string | null
          metadata: Record<string, unknown>
          created_at: string
        }
        Insert: {
          scan_id: string
          organization_id: string
          artifact_type: string
          storage_path: string
          filename: string
          size_bytes?: number | null
        }
        Update: never
      }
      findings: {
        Row: {
          id: string
          organization_id: string
          scan_id: string | null
          repository_id: string
          scanner: string
          category: string | null
          severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
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
          status: 'open' | 'assigned' | 'in_progress' | 'resolved' | 'suppressed' | 'false_positive'
          assigned_to: string | null
          assigned_at: string | null
          resolved_by: string | null
          resolved_at: string | null
          resolution_note: string | null
          suppressed_by: string | null
          suppressed_at: string | null
          suppress_reason: string | null
          risk_score: number
          confidence_score: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          scan_id?: string | null
          repository_id: string
          scanner: string
          category?: string | null
          severity: string
          title: string
          description?: string | null
          evidence?: string | null
          file_path?: string | null
          line_start?: number | null
          line_end?: number | null
          rule_id?: string | null
          rule_name?: string | null
          owasp?: string[]
          cwe?: string[]
          mitre?: string[]
          remediation?: string | null
          ai_summary?: string | null
          ai_remediation?: string | null
          status?: string
          risk_score?: number
        }
        Update: Partial<Omit<Database['public']['Tables']['findings']['Insert'], 'id'>>
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
          status: 'draft' | 'active' | 'archived'
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
          status?: string
        }
        Update: Partial<Omit<Database['public']['Tables']['policies']['Insert'], 'id' | 'organization_id'>>
      }
      policy_evaluations: {
        Row: {
          id: string
          policy_id: string
          scan_id: string | null
          finding_id: string | null
          organization_id: string
          result: 'pass' | 'fail' | 'skip' | 'error'
          details: Record<string, unknown>
          evaluated_at: string
          created_at: string
        }
        Insert: {
          policy_id: string
          organization_id: string
          scan_id?: string | null
          finding_id?: string | null
          result: string
          details?: Record<string, unknown>
        }
        Update: never
      }
      compliance_frameworks: {
        Row: {
          id: string
          name: string
          version: string | null
          description: string | null
          controls: Record<string, unknown>
          is_builtin: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          name: string
          version?: string | null
          description?: string | null
          controls?: Record<string, unknown>
        }
        Update: Partial<Database['public']['Tables']['compliance_frameworks']['Insert']>
      }
      compliance_mappings: {
        Row: {
          id: string
          finding_id: string
          framework_id: string
          organization_id: string
          control_id: string
          control_name: string | null
          relevance_score: number
          created_at: string
        }
        Insert: {
          finding_id: string
          framework_id: string
          organization_id: string
          control_id: string
          control_name?: string | null
          relevance_score?: number
        }
        Update: never
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
          status: 'processing' | 'ready' | 'failed'
          embedding_status: 'pending' | 'processing' | 'done' | 'failed'
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
          storage_path: string
          document_type?: string | null
          tags?: string[]
        }
        Update: Partial<Omit<Database['public']['Tables']['documents']['Insert'], 'id' | 'organization_id'>>
      }
      document_chunks: {
        Row: {
          id: string
          document_id: string
          organization_id: string
          chunk_index: number
          content: string
          tokens: number | null
          embedding: number[] | null
          metadata: Record<string, unknown>
          created_at: string
        }
        Insert: {
          document_id: string
          organization_id: string
          chunk_index: number
          content: string
          tokens?: number | null
          embedding?: number[] | null
        }
        Update: never
      }
      ai_analyses: {
        Row: {
          id: string
          organization_id: string
          finding_id: string | null
          scan_id: string | null
          analysis_type: 'classify' | 'explain' | 'remediate' | 'summarize' | 'policy_match'
          model: string
          provider: string
          input_tokens: number | null
          output_tokens: number | null
          latency_ms: number | null
          result: Record<string, unknown>
          error: string | null
          created_at: string
        }
        Insert: {
          organization_id: string
          finding_id?: string | null
          scan_id?: string | null
          analysis_type: string
          model: string
          provider: string
          input_tokens?: number | null
          output_tokens?: number | null
          latency_ms?: number | null
          result?: Record<string, unknown>
          error?: string | null
        }
        Update: never
      }
      scan_configurations: {
        Row: {
          id: string
          organization_id: string
          repository_id: string | null
          name: string
          config: Record<string, unknown>
          is_default: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          organization_id: string
          repository_id?: string | null
          name: string
          config?: Record<string, unknown>
          is_default?: boolean
          created_by?: string | null
        }
        Update: Partial<Omit<Database['public']['Tables']['scan_configurations']['Insert'], 'id' | 'organization_id'>>
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
          action_url?: string | null
        }
        Update: {
          read?: boolean
          read_at?: string | null
        }
      }
      reports: {
        Row: {
          id: string
          organization_id: string
          created_by: string | null
          report_type: 'security_summary' | 'compliance' | 'audit' | 'vulnerability' | 'policy' | 'executive' | 'custom'
          title: string
          description: string | null
          format: 'pdf' | 'csv' | 'json' | 'html'
          status: 'pending' | 'generating' | 'completed' | 'failed'
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
          report_type: string
          title: string
          description?: string | null
          format?: string
          parameters?: Record<string, unknown>
        }
        Update: {
          status?: string
          storage_path?: string | null
          generated_at?: string | null
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
          organization_id?: string | null
          user_id?: string | null
          action: string
          resource_type: string
          resource_id?: string | null
          resource_name?: string | null
          old_values?: Record<string, unknown> | null
          new_values?: Record<string, unknown> | null
          metadata?: Record<string, unknown>
        }
        Update: never
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
          status: 'active' | 'inactive' | 'error'
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
          status?: string
        }
        Update: Partial<Omit<Database['public']['Tables']['integrations']['Insert'], 'id' | 'organization_id'>>
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
        }
        Update: {
          name?: string
          scopes?: string[]
          expires_at?: string | null
          is_active?: boolean
          last_used_at?: string | null
        }
      }
      worker_heartbeats: {
        Row: {
          id: string
          worker_id: string
          worker_type: string
          status: string
          current_scan_id: string | null
          last_heartbeat: string
          metadata: Record<string, unknown>
          created_at: string
          updated_at: string
        }
        Insert: {
          worker_id: string
          worker_type: string
          status: string
          current_scan_id?: string | null
          last_heartbeat: string
          metadata?: Record<string, unknown>
        }
        Update: {
          status?: string
          current_scan_id?: string | null
          last_heartbeat?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: {
      generate_slug: { Args: { name: string }; Returns: string }
      is_org_member: { Args: { org_id: string }; Returns: boolean }
      is_org_admin: { Args: { org_id: string }; Returns: boolean }
      claim_next_scan: { Args: { p_worker_id: string }; Returns: Array<{ scan_id: string; repository_id: string; organization_id: string }> }
    }
    Enums: Record<string, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
