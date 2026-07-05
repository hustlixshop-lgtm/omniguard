import * as vscode from 'vscode';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';

export class AuthManager {
  private context: vscode.ExtensionContext;
  private supabase: SupabaseClient;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;

    const endpoint = vscode.workspace.getConfiguration('omniguard').get<string>('apiEndpoint');
    const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvdXItcHJvamVjdCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjE5MDAwMDAwMDB9.DEVELOPMENT_KEY';

    this.supabase = createClient(endpoint || SUPABASE_URL, anonKey);
  }

  isAuthenticated(): boolean {
    return !!this.context.globalState.get<string>('omniguard.token');
  }

  async login(email: string, password: string): Promise<void> {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      throw new Error(error.message);
    }

    if (data.session) {
      await this.context.globalState.update('omniguard.token', data.session.access_token);
      await this.context.globalState.update('omniguard.refresh_token', data.session.refresh_token);
      await this.context.globalState.update('omniguard.email', email);

      // Get organization info
      const { data: memberships } = await this.supabase
        .from('organization_members')
        .select('organization_id, role, organizations(name)')
        .eq('user_id', data.user?.id || '')
        .eq('status', 'active')
        .limit(1);

      if (memberships && memberships.length > 0) {
        const membership = memberships[0] as any;
        await this.context.globalState.update('omniguard.organization_id', membership.organization_id);
        await this.context.globalState.update('omniguard.organization_name', membership.organizations?.name);
        await this.context.globalState.update('omniguard.role', membership.role);
      }
    }
  }

  async logout(): Promise<void> {
  await this.supabase.auth.signOut();

  const keys = this.context.globalState.keys();

  for (const key of keys) {
    if (key.startsWith("omniguard.")) {
      await this.context.globalState.update(key, undefined);
    }
  }

  await this.context.secrets.delete("omniguard.api_key");
  }

  async getToken(): Promise<string> {
    const token = this.context.globalState.get<string>('omniguard.token');
    if (!token) {
      throw new Error('Not authenticated');
    }
    return token;
  }

  async getApiKey(): Promise<string | undefined> {
    return this.context.secrets.get('omniguard.api_key');
  }

  async setApiKey(key: string): Promise<void> {
    await this.context.secrets.store('omniguard.api_key', key);
  }

  getUserInfo(): { email: string; organizationId: string; organizationName: string; role: string } | null {
    return {
      email: this.context.globalState.get('omniguard.email') || '',
      organizationId: this.context.globalState.get('omniguard.organization_id') || '',
      organizationName: this.context.globalState.get('omniguard.organization_name') || '',
      role: this.context.globalState.get('omniguard.role') || 'developer'
    };
  }

  async refreshToken(): Promise<void> {
    const refreshToken = this.context.globalState.get<string>('omniguard.refresh_token');
    if (!refreshToken) {
      return;
    }

    const { data, error } = await this.supabase.auth.refreshSession({
      refresh_token: refreshToken
    });

    if (!error && data.session) {
      await this.context.globalState.update('omniguard.token', data.session.access_token);
      await this.context.globalState.update('omniguard.refresh_token', data.session.refresh_token);
    }
  }
}
