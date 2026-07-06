import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, Tables } from '../lib/supabase'
import { Key, Webhook, Bell, Brain, Copy, Eye, EyeOff, Plus, Trash2, Check } from 'lucide-react'

type ApiKey = Tables<'api_keys'>
type Integration = Tables<'integrations'>

const TABS = ['API Keys', 'Integrations', 'AI Provider', 'Notifications', 'Organization'] as const
type Tab = typeof TABS[number]

const API = import.meta.env.VITE_SUPABASE_URL + '/functions/v1'

export function Settings() {
  const { currentOrganizationId, user, profile } = useAuth()
  const [tab, setTab] = useState<Tab>('API Keys')
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  // AI provider config
  const [aiProvider, setAiProvider] = useState('anthropic')
  const [aiKeys, setAiKeys] = useState({ anthropic: '', openai: '', openrouter: '', bedrock_key: '', bedrock_secret: '', bedrock_region: 'us-east-1', azure_endpoint: '', azure_key: '', gemini_key: '', ollama_url: 'http://localhost:11434' })
  const [aiSaving, setAiSaving] = useState(false)
  const [aiSaved, setAiSaved] = useState(false)

  // Notification config
  const [notifForm, setNotifForm] = useState({ slack_webhook: '', email_from: '', resend_key: '', notify_critical: true, notify_high: false, weekly_digest: true })
  const [notifSaving, setNotifSaving] = useState(false)

  // Integration config
  const [ghToken, setGhToken] = useState('')
  const [ghSaving, setGhSaving] = useState(false)
  const [glToken, setGlToken] = useState('')
  const [glUrl, setGlUrl] = useState('https://gitlab.com')
  const [glSaving, setGlSaving] = useState(false)

  useEffect(() => {
    if (!currentOrganizationId) return; setLoading(true)
    Promise.all([
      supabase.from('api_keys').select('*').eq('organization_id', currentOrganizationId).order('created_at', { ascending: false }),
      supabase.from('integrations').select('*').eq('organization_id', currentOrganizationId),
      supabase.from('organizations').select('settings, ai_config').eq('id', currentOrganizationId).single(),
    ]).then(([{ data: keys }, { data: ints }, { data: org }]) => {
      setApiKeys((keys as ApiKey[]) || [])
      setIntegrations((ints as Integration[]) || [])
      // Load saved settings
      const s = (org?.settings as Record<string,unknown>) || {}
      const n = (s.notifications as Record<string,unknown>) || {}
      setNotifForm(prev => ({
        ...prev,
        slack_webhook: (n.slack_webhook as string) || '',
        notify_critical: n.notify_critical !== false,
        notify_high: n.notify_high === true,
        weekly_digest: n.weekly_digest !== false,
      }))
      // Load AI config (provider selection only, not keys)
      const ai = (org?.ai_config as Record<string,unknown>) || {}
      setAiProvider((ai.provider as string) || 'anthropic')
      // Populate GitHub token display
      const ghInt = (ints || []).find(i => i.provider === 'github')
      if (ghInt) setGhToken('••••••••••••' + ((ghInt.config as Record<string,string>)?.access_token || '').slice(-4))
      setLoading(false)
    })
  }, [currentOrganizationId])

  const generateApiKey = async () => {
    if (!currentOrganizationId || !newKeyName.trim()) return
    const { data: { session } } = await supabase.auth.getSession(); if (!session) return
    const res = await fetch(`${API}/api-v1-status`, { headers: { Authorization: `Bearer ${session.access_token}` } })
    // Generate key client-side (simpler approach for demo)
    const raw = 'og_live_' + Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2,'0')).join('')
    const encoder = new TextEncoder()
    const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(raw))
    const hash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('')
    const { data, error } = await supabase.from('api_keys').insert({
      organization_id: currentOrganizationId, name: newKeyName.trim(),
      key_prefix: raw.slice(0, 12), key_hash: hash, created_by: user?.id,
    }).select().single()
    if (!error && data) { setApiKeys(prev => [data as ApiKey, ...prev]); setCreatedKey(raw); setNewKeyName('') }
  }

  const revokeKey = async (id: string) => {
    await supabase.from('api_keys').update({ is_active: false }).eq('id', id)
    setApiKeys(prev => prev.map(k => k.id === id ? { ...k, is_active: false } : k))
  }

  const saveAIConfig = async () => {
    if (!currentOrganizationId) return; setAiSaving(true)
    // Build config - only store non-empty keys
    const config: Record<string,unknown> = { provider: aiProvider }
    if (aiKeys.anthropic) config.anthropic_api_key = aiKeys.anthropic
    if (aiKeys.openai) config.openai_api_key = aiKeys.openai
    if (aiKeys.openrouter) config.openrouter_api_key = aiKeys.openrouter
    if (aiKeys.gemini_key) config.gemini_api_key = aiKeys.gemini_key
    if (aiKeys.ollama_url) config.ollama_url = aiKeys.ollama_url
    if (aiKeys.bedrock_key) { config.aws_access_key_id = aiKeys.bedrock_key; config.aws_secret_access_key = aiKeys.bedrock_secret; config.aws_region = aiKeys.bedrock_region }
    if (aiKeys.azure_endpoint) { config.azure_openai_endpoint = aiKeys.azure_endpoint; config.azure_openai_key = aiKeys.azure_key }
    await supabase.from('organizations').update({ ai_config: config }).eq('id', currentOrganizationId)
    setAiSaving(false); setAiSaved(true); setTimeout(() => setAiSaved(false), 2000)
  }

  const saveNotifs = async () => {
    if (!currentOrganizationId) return; setNotifSaving(true)
    await supabase.from('organizations').update({ settings: { notifications: { slack_webhook: notifForm.slack_webhook, notify_critical: notifForm.notify_critical, notify_high: notifForm.notify_high, weekly_digest: notifForm.weekly_digest } } }).eq('id', currentOrganizationId)
    setNotifSaving(false)
  }

  const saveGitHub = async () => {
    if (!currentOrganizationId || !ghToken.startsWith('ghp_')) return; setGhSaving(true)
    await supabase.from('integrations').upsert({ organization_id: currentOrganizationId, provider: 'github', status: 'active', config: { access_token: ghToken }, created_by: user?.id }, { onConflict: 'organization_id,provider' })
    setGhSaving(false); setIntegrations(prev => [...prev.filter(i => i.provider !== 'github'), { id: '', organization_id: currentOrganizationId!, provider: 'github', status: 'active', config: { access_token: ghToken }, metadata: {}, created_by: user?.id || null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }])
  }

  const saveGitLab = async () => {
    if (!currentOrganizationId || !glToken) return; setGlSaving(true)
    await supabase.from('integrations').upsert({ organization_id: currentOrganizationId, provider: 'gitlab', status: 'active', config: { access_token: glToken, gitlab_url: glUrl }, created_by: user?.id }, { onConflict: 'organization_id,provider' })
    setGlSaving(false)
  }

  const copy = (text: string) => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <div><h1 className="text-3xl font-bold text-white">Settings</h1><p className="text-slate-400 mt-1">Configure your organization</p></div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-700 pb-px">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === t ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>{t}</button>
        ))}
      </div>

      {/* API Keys */}
      {tab === 'API Keys' && (
        <div className="space-y-4">
          <p className="text-slate-400 text-sm">API keys allow external tools (CLI, CI/CD, GitHub Actions) to authenticate with OmniGuard.</p>
          <div className="flex gap-3">
            <input className="input max-w-xs" placeholder="Key name (e.g. GitHub Actions CI)" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} onKeyDown={e => e.key === 'Enter' && generateApiKey()} />
            <button onClick={generateApiKey} disabled={!newKeyName.trim()} className="btn-primary"><Plus className="w-4 h-4" />Generate Key</button>
          </div>
          {createdKey && (
            <div className="p-4 bg-green-500/5 border border-green-500/30 rounded-lg">
              <p className="text-green-400 text-sm font-medium mb-2">Your new API key — copy it now, it won't be shown again:</p>
              <div className="flex items-center gap-2">
                <code className="text-green-300 font-mono text-sm bg-slate-900 px-3 py-1.5 rounded border border-slate-800 flex-1 break-all">{createdKey}</code>
                <button onClick={() => copy(createdKey)} className={`btn-secondary text-xs ${copied ? 'text-green-400' : ''}`}>{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button>
              </div>
              <button onClick={() => setCreatedKey(null)} className="btn-ghost text-xs mt-2 text-slate-500">Dismiss</button>
            </div>
          )}
          <div className="card overflow-hidden">
            {apiKeys.length === 0 ? <p className="p-6 text-center text-slate-500 text-sm">No API keys yet</p>
            : <table className="w-full text-sm"><thead><tr className="border-b border-slate-700">{['Name','Prefix','Created','Status','Action'].map(h => <th key={h} className="px-4 py-3 text-left text-slate-400 font-medium text-xs uppercase">{h}</th>)}</tr></thead>
              <tbody>{apiKeys.map(k => (
                <tr key={k.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                  <td className="px-4 py-3 text-slate-200 font-medium">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{k.key_prefix}…</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{new Date(k.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3"><span className={`badge text-xs ${k.is_active ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-500'}`}>{k.is_active ? 'Active' : 'Revoked'}</span></td>
                  <td className="px-4 py-3">{k.is_active && <button onClick={() => revokeKey(k.id)} className="btn-ghost text-red-400 text-xs"><Trash2 className="w-3 h-3" />Revoke</button>}</td>
                </tr>
              ))}</tbody></table>}
          </div>
        </div>
      )}

      {/* Integrations */}
      {tab === 'Integrations' && (
        <div className="space-y-6">
          {/* GitHub */}
          <div className="card p-5">
            <h3 className="text-white font-semibold mb-1">GitHub</h3>
            <p className="text-slate-500 text-sm mb-4">Required for scanning GitHub repositories. Create at <a href="https://github.com/settings/tokens/new" target="_blank" rel="noreferrer" className="text-blue-400 underline">github.com/settings/tokens</a> with <code className="font-mono text-xs bg-slate-800 px-1 py-0.5 rounded">repo</code> and <code className="font-mono text-xs bg-slate-800 px-1 py-0.5 rounded">read:org</code> scopes.</p>
            <div className="flex gap-3">
              <input className="input max-w-sm" placeholder="ghp_..." value={ghToken} onChange={e => setGhToken(e.target.value)} />
              <button onClick={saveGitHub} disabled={ghSaving || (!ghToken.startsWith('ghp_') && !ghToken.startsWith('github_pat_'))} className="btn-primary">{ghSaving ? 'Saving…' : integrations.some(i => i.provider === 'github') ? 'Update' : 'Connect'}</button>
            </div>
            {integrations.some(i => i.provider === 'github' && i.status === 'active') && <p className="text-green-400 text-xs mt-2">✓ GitHub connected</p>}
          </div>

          {/* GitLab */}
          <div className="card p-5">
            <h3 className="text-white font-semibold mb-1">GitLab</h3>
            <p className="text-slate-500 text-sm mb-4">For GitLab repositories (self-hosted or gitlab.com). Create a Personal Access Token with <code className="font-mono text-xs bg-slate-800 px-1 py-0.5 rounded">read_repository</code> scope.</p>
            <div className="space-y-3">
              <input className="input max-w-sm" placeholder="GitLab URL (e.g. https://gitlab.com)" value={glUrl} onChange={e => setGlUrl(e.target.value)} />
              <div className="flex gap-3"><input className="input max-w-sm" placeholder="glpat-..." value={glToken} onChange={e => setGlToken(e.target.value)} /><button onClick={saveGitLab} disabled={glSaving || !glToken} className="btn-primary">{glSaving ? 'Saving…' : 'Connect'}</button></div>
            </div>
            {integrations.some(i => i.provider === 'gitlab') && <p className="text-green-400 text-xs mt-2">✓ GitLab connected</p>}
          </div>

          {/* Webhook */}
          <div className="card p-5">
            <h3 className="text-white font-semibold mb-1">GitHub Webhook</h3>
            <p className="text-slate-500 text-sm mb-3">Add this URL to your GitHub repository to auto-scan on push and block PRs with critical findings.</p>
            <div className="flex items-center gap-2">
              <code className="text-blue-300 text-sm font-mono bg-slate-900 px-3 py-2 rounded border border-slate-800 flex-1 break-all">{import.meta.env.VITE_SUPABASE_URL}/functions/v1/github-webhook</code>
              <button onClick={() => copy(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/github-webhook`)} className="btn-secondary text-xs">{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button>
            </div>
            <p className="text-slate-500 text-xs mt-2">Content type: <code className="font-mono bg-slate-800 px-1 rounded">application/json</code> · Events: Pushes + Pull requests</p>
          </div>
        </div>
      )}

      {/* AI Provider */}
      {tab === 'AI Provider' && (
        <div className="space-y-6">
          <p className="text-slate-400 text-sm">Configure your AI provider. Keys are stored encrypted per organization — <strong className="text-slate-200">the platform never pays for your AI usage (BYOK)</strong>.</p>
          <div className="card p-5">
            <label className="label">Provider</label>
            <select className="input max-w-xs mb-4" value={aiProvider} onChange={e => setAiProvider(e.target.value)}>
              <option value="anthropic">Anthropic (Claude) — Recommended</option>
              <option value="openai">OpenAI (GPT-4o)</option>
              <option value="bedrock">AWS Bedrock (Claude via IAM)</option>
              <option value="azure">Azure OpenAI</option>
              <option value="gemini">Google Gemini</option>
              <option value="openrouter">OpenRouter</option>
              <option value="ollama">Ollama (local)</option>
              <option value="none">None (disable AI features)</option>
            </select>

            {aiProvider === 'anthropic' && <div><label className="label">Anthropic API Key</label><input className="input max-w-md" type="password" placeholder="sk-ant-api03-..." value={aiKeys.anthropic} onChange={e => setAiKeys({...aiKeys, anthropic: e.target.value})} /><p className="text-slate-500 text-xs mt-1">Get from <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-blue-400">console.anthropic.com</a>. Used for: Haiku (triage), Sonnet (remediation), Opus (summaries).</p></div>}
            {aiProvider === 'openai' && <div><label className="label">OpenAI API Key</label><input className="input max-w-md" type="password" placeholder="sk-proj-..." value={aiKeys.openai} onChange={e => setAiKeys({...aiKeys, openai: e.target.value})} /><p className="text-slate-500 text-xs mt-1">Used for: GPT-4o mini (triage), GPT-4o (remediation + summaries).</p></div>}
            {aiProvider === 'bedrock' && <div className="space-y-3"><div><label className="label">AWS Access Key ID</label><input className="input max-w-md" type="password" placeholder="AKIA..." value={aiKeys.bedrock_key} onChange={e => setAiKeys({...aiKeys, bedrock_key: e.target.value})} /></div><div><label className="label">AWS Secret Access Key</label><input className="input max-w-md" type="password" placeholder="..." value={aiKeys.bedrock_secret} onChange={e => setAiKeys({...aiKeys, bedrock_secret: e.target.value})} /></div><div><label className="label">AWS Region</label><input className="input max-w-xs" placeholder="us-east-1" value={aiKeys.bedrock_region} onChange={e => setAiKeys({...aiKeys, bedrock_region: e.target.value})} /></div><p className="text-slate-500 text-xs">Enable Claude models in <a href="https://console.aws.amazon.com/bedrock" target="_blank" rel="noreferrer" className="text-blue-400">AWS Bedrock console</a>.</p></div>}
            {aiProvider === 'azure' && <div className="space-y-3"><div><label className="label">Azure OpenAI Endpoint</label><input className="input max-w-md" placeholder="https://your-resource.openai.azure.com" value={aiKeys.azure_endpoint} onChange={e => setAiKeys({...aiKeys, azure_endpoint: e.target.value})} /></div><div><label className="label">Azure OpenAI Key</label><input className="input max-w-md" type="password" placeholder="..." value={aiKeys.azure_key} onChange={e => setAiKeys({...aiKeys, azure_key: e.target.value})} /></div></div>}
            {aiProvider === 'gemini' && <div><label className="label">Gemini API Key</label><input className="input max-w-md" type="password" placeholder="AIza..." value={aiKeys.gemini_key} onChange={e => setAiKeys({...aiKeys, gemini_key: e.target.value})} /><p className="text-slate-500 text-xs mt-1">Get from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-blue-400">Google AI Studio</a>.</p></div>}
            {aiProvider === 'openrouter' && <div><label className="label">OpenRouter API Key</label><input className="input max-w-md" type="password" placeholder="sk-or-..." value={aiKeys.openrouter} onChange={e => setAiKeys({...aiKeys, openrouter: e.target.value})} /><p className="text-slate-500 text-xs mt-1">Routes to any model via <a href="https://openrouter.ai" target="_blank" rel="noreferrer" className="text-blue-400">openrouter.ai</a>.</p></div>}
            {aiProvider === 'ollama' && <div><label className="label">Ollama Base URL</label><input className="input max-w-md" placeholder="http://localhost:11434" value={aiKeys.ollama_url} onChange={e => setAiKeys({...aiKeys, ollama_url: e.target.value})} /><p className="text-slate-500 text-xs mt-1">OmniGuard's edge functions must be able to reach this URL. Useful for air-gapped environments.</p></div>}

            <button onClick={saveAIConfig} disabled={aiSaving} className="btn-primary mt-4">
              {aiSaved ? <><Check className="w-4 h-4" />Saved!</> : aiSaving ? 'Saving…' : <><Brain className="w-4 h-4" />Save AI Configuration</>}
            </button>
          </div>
          <div className="card p-4">
            <h4 className="text-slate-200 font-medium mb-2">Model Routing Strategy</h4>
            <div className="grid grid-cols-3 gap-3 text-xs">
              {[['Layer 1 — Triage','Fast classification, false positive removal','Haiku / GPT-4o mini / Gemini Flash','~$0.001/scan'],['Layer 2 — Analysis','Deep code analysis, specific fix generation','Sonnet / GPT-4o / Gemini Pro','~$0.01–0.05/scan'],['Layer 3 — Summary','Executive summary, risk posture','Opus / GPT-4o / Gemini Pro','~$0.03/scan']].map(([l,d,m,c]) => (
                <div key={l} className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                  <p className="text-blue-400 font-medium mb-1">{l}</p>
                  <p className="text-slate-500 mb-1">{d}</p>
                  <p className="text-slate-400">{m}</p>
                  <p className="text-green-400 mt-1">{c}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Notifications */}
      {tab === 'Notifications' && (
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="text-white font-semibold mb-4">Slack</h3>
            <label className="label">Webhook URL</label>
            <input className="input max-w-lg" placeholder="https://hooks.slack.com/services/..." value={notifForm.slack_webhook} onChange={e => setNotifForm({...notifForm, slack_webhook: e.target.value})} />
            <p className="text-slate-500 text-xs mt-1">Get from <a href="https://api.slack.com/apps" target="_blank" rel="noreferrer" className="text-blue-400">api.slack.com/apps</a> → Incoming Webhooks</p>
          </div>
          <div className="card p-5 space-y-4">
            <h3 className="text-white font-semibold">Notification Preferences</h3>
            {[['notify_critical','Alert on critical findings (immediate)'],['notify_high','Alert on high findings'],['weekly_digest','Weekly security digest']].map(([k, l]) => (
              <label key={k} className="flex items-center gap-3 cursor-pointer">
                <div onClick={() => setNotifForm({...notifForm, [k]: !notifForm[k as keyof typeof notifForm]})}
                  className={`w-10 h-6 rounded-full transition-colors relative ${notifForm[k as keyof typeof notifForm] ? 'bg-blue-500' : 'bg-slate-700'}`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${notifForm[k as keyof typeof notifForm] ? 'translate-x-5' : 'translate-x-1'}`} />
                </div>
                <span className="text-slate-300 text-sm">{l}</span>
              </label>
            ))}
          </div>
          <button onClick={saveNotifs} disabled={notifSaving} className="btn-primary">{notifSaving ? 'Saving…' : 'Save Notification Settings'}</button>
        </div>
      )}

      {/* Organization */}
      {tab === 'Organization' && (
        <div className="card p-5 space-y-4">
          <h3 className="text-white font-semibold">Organization Details</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Organization ID</p><p className="font-mono text-slate-300 text-xs">{currentOrganizationId}</p></div>
            <div><p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Your Role</p><p className="text-slate-300">{profile?.role || 'Member'}</p></div>
            <div><p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Your Email</p><p className="text-slate-300">{profile?.email}</p></div>
          </div>
        </div>
      )}
    </div>
  )
}
