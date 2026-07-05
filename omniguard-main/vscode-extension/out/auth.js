"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthManager = void 0;
const vscode = __importStar(require("vscode"));
const supabase_js_1 = require("@supabase/supabase-js");
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';
class AuthManager {
    context;
    supabase;
    constructor(context) {
        this.context = context;
        const endpoint = vscode.workspace.getConfiguration('omniguard').get('apiEndpoint');
        const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvdXItcHJvamVjdCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjE5MDAwMDAwMDB9.DEVELOPMENT_KEY';
        this.supabase = (0, supabase_js_1.createClient)(endpoint || SUPABASE_URL, anonKey);
    }
    isAuthenticated() {
        return !!this.context.globalState.get('omniguard.token');
    }
    async login(email, password) {
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
                const membership = memberships[0];
                await this.context.globalState.update('omniguard.organization_id', membership.organization_id);
                await this.context.globalState.update('omniguard.organization_name', membership.organizations?.name);
                await this.context.globalState.update('omniguard.role', membership.role);
            }
        }
    }
    async logout() {
        await this.supabase.auth.signOut();
        await this.context.globalState.keys()
            .then(keys => keys.filter(k => k.startsWith('omniguard.')))
            .then(keys => keys.forEach(k => this.context.globalState.update(k, undefined)));
        // Clear secrets
        await this.context.secrets.delete('omniguard.api_key');
    }
    async getToken() {
        const token = this.context.globalState.get('omniguard.token');
        if (!token) {
            throw new Error('Not authenticated');
        }
        return token;
    }
    async getApiKey() {
        return this.context.secrets.get('omniguard.api_key');
    }
    async setApiKey(key) {
        await this.context.secrets.store('omniguard.api_key', key);
    }
    getUserInfo() {
        return {
            email: this.context.globalState.get('omniguard.email') || '',
            organizationId: this.context.globalState.get('omniguard.organization_id') || '',
            organizationName: this.context.globalState.get('omniguard.organization_name') || '',
            role: this.context.globalState.get('omniguard.role') || 'developer'
        };
    }
    async refreshToken() {
        const refreshToken = this.context.globalState.get('omniguard.refresh_token');
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
exports.AuthManager = AuthManager;
//# sourceMappingURL=auth.js.map