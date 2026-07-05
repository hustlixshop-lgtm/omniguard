import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, Tables } from '../lib/supabase'
import { User, Layers, Search, X } from 'lucide-react'

type AuditLog = Tables<'audit_logs'>

const ACTION_COLORS: Record<string, string> = {
  scan_triggered: 'text-primary-400',
  scan_completed: 'text-accent-400',
  webhook_received: 'text-primary-300',
  finding_resolved: 'text-accent-400',
  finding_suppressed: 'text-secondary-400',
  member_invited: 'text-warning-400',
  policy_created: 'text-primary-400',
  api_key_created: 'text-warning-400',
  api_key_revoked: 'text-danger-400',
  integration_connected: 'text-accent-400',
  pr_scan_triggered: 'text-primary-300',
}

const PAGE_SIZE = 50

export function AuditLogs() {
  const { currentOrganizationId } = useAuth()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    if (!currentOrganizationId) return
    setLoading(true)
    let query = supabase.from('audit_logs').select('*', { count: 'exact' })
      .eq('organization_id', currentOrganizationId)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (actionFilter) query = query.eq('action', actionFilter)
    query.then(({ data, count }) => { setLogs(data || []); setTotal(count || 0); setLoading(false) })
  }, [currentOrganizationId, page, actionFilter])

  const filtered = search
    ? logs.filter(l => l.action.includes(search) || l.resource_type.includes(search) || l.resource_name?.toLowerCase().includes(search.toLowerCase()))
    : logs

  const uniqueActions = [...new Set(logs.map(l => l.action))].sort()

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-white">Audit Logs</h1>
        <p className="text-secondary-400 mt-1">Tamper-proof record of all platform activity</p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-500" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search logs..." className="input pl-9 w-60" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-secondary-500"><X className="w-4 h-4" /></button>}
        </div>
        <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(0) }} className="input w-48">
          <option value="">All Actions</option>
          {uniqueActions.map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
        </select>
        {actionFilter && <button onClick={() => { setActionFilter(''); setPage(0) }} className="btn-ghost text-sm text-secondary-400">Clear</button>}
        <span className="ml-auto text-secondary-500 text-sm">{total} total events</span>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-secondary-500">No audit events found</div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-secondary-700">
                  {['Timestamp', 'Action', 'Resource', 'Actor', 'Details'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-secondary-400 font-medium text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(log => (
                  <tr key={log.id} className="border-b border-secondary-800 hover:bg-secondary-800/30 transition-colors">
                    <td className="px-4 py-3 text-secondary-500 text-xs font-mono whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-mono font-medium ${ACTION_COLORS[log.action] || 'text-secondary-300'}`}>
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Layers className="w-3 h-3 text-secondary-600" />
                        <span className="badge bg-secondary-700 text-secondary-400 text-xs">{log.resource_type}</span>
                        {log.resource_name && <span className="text-secondary-400 text-xs truncate max-w-32">{log.resource_name}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {log.user_id ? <span className="flex items-center gap-1 text-secondary-400 text-xs"><User className="w-3 h-3" /><span className="font-mono">{log.user_id.slice(0, 8)}...</span></span>
                        : <span className="text-secondary-600 text-xs">System</span>}
                    </td>
                    <td className="px-4 py-3 text-secondary-500 text-xs">
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <span className="font-mono text-secondary-600">{JSON.stringify(log.metadata).slice(0, 60)}{JSON.stringify(log.metadata).length > 60 ? '...' : ''}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {total > PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-secondary-700">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="btn-secondary text-sm">Previous</button>
                <span className="text-secondary-500 text-sm">Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}</span>
                <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE_SIZE >= total} className="btn-secondary text-sm">Next</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
