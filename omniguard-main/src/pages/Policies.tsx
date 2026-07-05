import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Shield, Plus, CircleCheck as CheckCircle, FileText, Trash2, Archive } from 'lucide-react'

interface Policy {
  id: string; title: string; category: string | null; description: string | null
  content: string; severity: string; status: 'draft' | 'active' | 'archived'
  version: number; created_at: string
}

export function Policies() {
  const { currentOrganizationId, user } = useAuth()
  const [policies, setPolicies] = useState<Policy[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', category: '', description: '', content: '', severity: 'high' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!currentOrganizationId) return
    supabase.from('policies').select('*').eq('organization_id', currentOrganizationId).is('deleted_at', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setPolicies((data as Policy[]) || []); setLoading(false) })
  }, [currentOrganizationId])

  const handleCreate = async () => {
    if (!currentOrganizationId || !form.title.trim() || !form.content.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('policies').insert({
      organization_id: currentOrganizationId, created_by: user?.id,
      title: form.title.trim(), category: form.category || null,
      description: form.description || null, content: form.content.trim(),
      severity: form.severity, status: 'draft',
    }).select().single()
    setSaving(false)
    if (!error && data) {
      setPolicies([data as Policy, ...policies])
      setShowCreate(false)
      setForm({ title: '', category: '', description: '', content: '', severity: 'high' })
    }
  }

  const activate = async (id: string) => {
    await supabase.from('policies').update({ status: 'active', approved_by: user?.id, approved_at: new Date().toISOString() }).eq('id', id)
    setPolicies(p => p.map(x => x.id === id ? { ...x, status: 'active' as const } : x))
  }

  const archive = async (id: string) => {
    await supabase.from('policies').update({ status: 'archived' }).eq('id', id)
    setPolicies(p => p.map(x => x.id === id ? { ...x, status: 'archived' as const } : x))
  }

  const del = async (id: string) => {
    if (!confirm('Delete this policy?')) return
    await supabase.from('policies').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    setPolicies(p => p.filter(x => x.id !== id))
  }

  const statusColor = (s: string) => s === 'active' ? 'bg-accent-500/20 text-accent-400' : s === 'draft' ? 'bg-warning-500/20 text-warning-400' : 'bg-secondary-700 text-secondary-500'

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Security Policies</h1>
          <p className="text-secondary-400 mt-1">Define standards OmniGuard enforces across all repositories</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" /> New Policy</button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Active', count: policies.filter(p => p.status === 'active').length, color: 'text-accent-400' },
          { label: 'Draft', count: policies.filter(p => p.status === 'draft').length, color: 'text-warning-400' },
          { label: 'Archived', count: policies.filter(p => p.status === 'archived').length, color: 'text-secondary-500' },
        ].map(({ label, count, color }) => (
          <div key={label} className="stat-card">
            <p className={`text-3xl font-bold font-mono ${color}`}>{count}</p>
            <p className="text-secondary-400 text-sm">{label} Policies</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : policies.length === 0 ? (
        <div className="card p-12 text-center">
          <Shield className="w-16 h-16 mx-auto mb-4 text-secondary-600" />
          <h3 className="text-lg font-semibold text-secondary-300 mb-2">No policies yet</h3>
          <p className="text-secondary-500 mb-4">Create security policies to enforce standards across your codebase.</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" /> Create First Policy</button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {policies.map((policy) => (
            <div key={policy.id}
              className={`card p-5 cursor-pointer hover:border-secondary-600 transition-all ${selectedId === policy.id ? 'border-primary-500/30' : ''}`}
              onClick={() => setSelectedId(selectedId === policy.id ? null : policy.id)}>
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-secondary-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-secondary-100 font-medium truncate">{policy.title}</h3>
                    <span className={`badge text-xs ${statusColor(policy.status)}`}>{policy.status}</span>
                  </div>
                  {policy.description && <p className="text-secondary-500 text-sm">{policy.description}</p>}
                  {policy.category && <span className="badge bg-secondary-700 text-secondary-400 text-xs mt-1">{policy.category}</span>}
                  {selectedId === policy.id && (
                    <div className="mt-3 pt-3 border-t border-secondary-700 animate-fade-in" onClick={e => e.stopPropagation()}>
                      <pre className="text-secondary-300 text-xs bg-secondary-900 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">{policy.content}</pre>
                      <div className="flex gap-2 mt-3">
                        {policy.status === 'draft' && <button onClick={() => activate(policy.id)} className="btn-primary text-sm"><CheckCircle className="w-3 h-3" /> Activate</button>}
                        {policy.status === 'active' && <button onClick={() => archive(policy.id)} className="btn-secondary text-sm"><Archive className="w-3 h-3" /> Archive</button>}
                        <button onClick={() => del(policy.id)} className="btn-ghost text-danger-400 text-sm"><Trash2 className="w-3 h-3" /> Delete</button>
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-xs text-secondary-500 flex-shrink-0">{new Date(policy.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="card-elevated p-6 w-full max-w-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-white mb-4">Create Security Policy</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Title</label>
                  <input type="text" value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="No Hardcoded Secrets" className="input" autoFocus />
                </div>
                <div>
                  <label className="label">Category</label>
                  <input type="text" value={form.category} onChange={e => setForm({...form, category: e.target.value})} placeholder="Secrets, Access Control..." className="input" />
                </div>
              </div>
              <div>
                <label className="label">Description</label>
                <input type="text" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Brief summary" className="input" />
              </div>
              <div>
                <label className="label">Severity</label>
                <select value={form.severity} onChange={e => setForm({...form, severity: e.target.value})} className="input max-w-xs">
                  {['critical','high','medium','low'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Policy Rules / Content</label>
                <textarea value={form.content} onChange={e => setForm({...form, content: e.target.value})}
                  placeholder={`DENY: secrets in source code\nDENY: API keys committed to repo\nALLOW: environment variables via .env.example only`}
                  rows={7} className="input font-mono text-sm" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleCreate} disabled={saving || !form.title.trim() || !form.content.trim()} className="btn-primary flex-1">{saving ? 'Creating...' : 'Create Policy'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
