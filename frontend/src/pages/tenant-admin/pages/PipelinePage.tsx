import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../../../api/client'
import { useAuth } from '../../../hooks/useAuth'

interface MaterializedViewItem {
  id: number
  slug: string
  title: string
  description: string
  query: string
  status: string
  row_count: number | null
  last_refreshed_at: string | null
  refresh_duration_ms: number | null
  auto_refresh: boolean
}

interface AvailableTable {
  type: 'raw' | 'view'
  name: string
  slug: string
  description: string
  resource_id?: number
  records: number | null
  status?: string
  query_hint: string
  fields: { name: string; type: string }[] | null
}

interface TablePreview {
  columns: string[]
  rows: Record<string, unknown>[]
  row_count: number
  total: number
}

interface ColumnStats {
  total: number
  filled: number
  null_count: number
  unique_count: number
  top_values?: [string, number][]
}

export default function PipelinePage() {
  const { slug } = useParams()
  const { token } = useAuth()
  const [views, setViews] = useState<MaterializedViewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState({ slug: '', title: '', description: '', query: '' })
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<{ columns: string[]; rows: Record<string, unknown>[]; row_count: number } | null>(null)
  const [testError, setTestError] = useState('')
  const [refreshingId, setRefreshingId] = useState<number | null>(null)

  // Table browser
  const [tables, setTables] = useState<AvailableTable[]>([])
  const [selectedTable, setSelectedTable] = useState<AvailableTable | null>(null)
  const [tablePreview, setTablePreview] = useState<TablePreview | null>(null)
  const [tablePreviewLoading, setTablePreviewLoading] = useState(false)
  const [selectedTableColumn, setSelectedTableColumn] = useState<string | null>(null)
  const [columnStats, setColumnStats] = useState<ColumnStats | null>(null)
  const [columnStatsLoading, setColumnStatsLoading] = useState(false)

  useEffect(() => {
    loadViews()
    loadTables()
  }, [])

  async function loadViews() {
    try {
      const data = await api.get('/api/warehouse/views/', token, slug)
      setViews(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function loadTables() {
    try {
      const data = await api.get('/api/warehouse/views/tables/', token, slug)
      setTables(data)
    } catch (e) {
      console.error(e)
    }
  }

  async function selectTable(table: AvailableTable) {
    setSelectedTable(table)
    setTablePreview(null)
    setSelectedTableColumn(null)
    setColumnStats(null)
    setTablePreviewLoading(true)
    try {
      const params = table.type === 'raw'
        ? `type=raw&resource_id=${table.resource_id}`
        : `type=view&slug=${table.slug}`
      const data = await api.get(`/api/warehouse/views/table-preview/?${params}`, token, slug)
      setTablePreview(data)
    } catch (e) {
      console.error(e)
    } finally {
      setTablePreviewLoading(false)
    }
  }

  async function loadColumnStats(column: string) {
    if (!selectedTable) return
    setSelectedTableColumn(column)
    setColumnStats(null)
    setColumnStatsLoading(true)
    try {
      const params = selectedTable.type === 'raw'
        ? `type=raw&resource_id=${selectedTable.resource_id}&column=${encodeURIComponent(column)}`
        : `type=view&slug=${selectedTable.slug}&column=${encodeURIComponent(column)}`
      const data = await api.get(`/api/warehouse/views/table-column-stats/?${params}`, token, slug)
      setColumnStats(data)
    } catch (e) {
      console.error(e)
    } finally {
      setColumnStatsLoading(false)
    }
  }

  function insertQueryHint(hint: string) {
    setFormData(d => ({ ...d, query: d.query ? d.query + '\n' + hint : hint }))
  }

  async function createView() {
    if (!formData.slug || !formData.title || !formData.query) {
      alert('Vul slug, titel en query in')
      return
    }
    setSaving(true)
    try {
      await api.post('/api/warehouse/views/', formData, token, slug)
      setShowCreateForm(false)
      setFormData({ slug: '', title: '', description: '', query: '' })
      setTestResult(null)
      setTestError('')
      await loadViews()
      await loadTables()
    } catch (e) {
      alert('Fout bij aanmaken: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function testQuery() {
    setTestResult(null)
    setTestError('')
    if (!formData.query.trim()) {
      setTestError('Voer een SQL query in')
      return
    }
    setSaving(true)
    try {
      const created = await api.post('/api/warehouse/views/', {
        ...formData,
        slug: formData.slug || 'temp_test_' + Date.now(),
        title: formData.title || 'Test',
      }, token, slug)
      const result = await api.post(`/api/warehouse/views/${created.id}/test/`, {}, token, slug)
      setTestResult(result)
      if (!formData.slug) {
        await api.delete(`/api/warehouse/views/${created.id}/`, token, slug)
      }
      await loadViews()
    } catch (e) {
      setTestError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function refreshView(viewId: number) {
    setRefreshingId(viewId)
    try {
      const result = await api.post(`/api/warehouse/views/${viewId}/refresh/`, {}, token, slug)
      alert(`View ververst: ${result.row_count} rijen in ${result.duration_ms}ms`)
      await loadViews()
      await loadTables()
    } catch (e) {
      alert('Refresh mislukt: ' + (e as Error).message)
    } finally {
      setRefreshingId(null)
    }
  }

  async function deleteView(viewId: number, viewTitle: string) {
    if (!confirm(`Weet je zeker dat je "${viewTitle}" wilt verwijderen?`)) return
    try {
      await api.delete(`/api/warehouse/views/${viewId}/`, token, slug)
      await loadViews()
      await loadTables()
    } catch (e) {
      alert('Verwijderen mislukt: ' + (e as Error).message)
    }
  }

  if (loading) return <div className="text-text/50">Laden...</div>

  return (
    <div className="space-y-6 min-w-0 overflow-hidden">
      {/* Header */}
      <div className="bg-bg-header rounded-xl p-6 border border-surface">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-text text-xl font-semibold">Data Pipeline</h2>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg text-sm transition-colors"
          >
            {showCreateForm ? 'Annuleren' : 'View aanmaken'}
          </button>
        </div>

        {!showCreateForm && (
          <div className="bg-surface/50 rounded-lg p-4 text-sm text-text/60">
            Materialized views transformeren ruwe data uit je connectors naar bruikbare tabellen.
            Gebruik de tabel-browser hieronder om beschikbare data te verkennen.
          </div>
        )}
      </div>

      {/* Create form with table browser */}
      {showCreateForm && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Table browser - left panel */}
          <div className="lg:col-span-2 bg-bg-header rounded-xl p-5 border border-surface">
            <h3 className="text-text font-semibold mb-3 text-sm">Beschikbare tabellen</h3>

            {/* Table list */}
            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto scrollbar-thin">
              {tables.length === 0 ? (
                <p className="text-text/40 text-xs">Nog geen data beschikbaar. Activeer eerst een resource.</p>
              ) : (
                tables.map(table => (
                  <button
                    key={table.slug}
                    onClick={() => selectTable(table)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedTable?.slug === table.slug
                        ? 'bg-primary/15 border border-primary/30'
                        : 'bg-surface hover:bg-surface/80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <span className="text-text font-medium text-xs block truncate">{table.description}</span>
                        <code className="text-text/40 text-[10px]">
                          {table.type === 'raw' ? `resource_id=${table.resource_id}` : table.name}
                        </code>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          table.type === 'raw' ? 'bg-blue-500/15 text-blue-400' : 'bg-green-500/15 text-green-400'
                        }`}>
                          {table.type === 'raw' ? 'Raw' : 'View'}
                        </span>
                        {table.records != null && (
                          <span className="text-text/40 text-[10px]">{table.records?.toLocaleString('nl-NL')}</span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Selected table preview */}
            {selectedTable && (
              <div className="border-t border-surface pt-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-text/70 text-xs font-medium">
                    Preview: {selectedTable.description}
                  </h4>
                  <button
                    onClick={() => insertQueryHint(selectedTable.query_hint)}
                    className="text-primary text-[10px] hover:underline shrink-0"
                  >
                    Voeg query toe →
                  </button>
                </div>

                {tablePreviewLoading && <p className="text-text/40 text-xs">Laden...</p>}

                {tablePreview && !tablePreviewLoading && (
                  <div className="overflow-x-auto overflow-y-auto max-h-48 border border-surface rounded scrollbar-thin">
                    <table className="text-[10px]" style={{ width: 'max-content' }}>
                      <thead className="sticky top-0 bg-surface">
                        <tr>
                          {tablePreview.columns.map(col => (
                            <th
                              key={col}
                              onClick={() => loadColumnStats(col)}
                              className={`px-2 py-1 text-left font-medium whitespace-nowrap cursor-pointer hover:bg-primary/10 ${
                                selectedTableColumn === col ? 'bg-primary/15 text-primary' : 'text-text/60'
                              }`}
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tablePreview.rows.slice(0, 5).map((row, i) => (
                          <tr key={i} className="border-t border-surface/30">
                            {tablePreview.columns.map(col => (
                              <td key={col} className={`px-2 py-0.5 text-text/60 whitespace-nowrap max-w-[120px] truncate ${
                                selectedTableColumn === col ? 'bg-primary/5' : ''
                              }`}>
                                {typeof row[col] === 'object' && row[col] !== null
                                  ? JSON.stringify(row[col])
                                  : String(row[col] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {tablePreview && (
                  <p className="text-text/30 text-[10px] mt-1">
                    {tablePreview.total?.toLocaleString('nl-NL')} records totaal · Klik op een kolom voor stats
                  </p>
                )}

                {/* Column stats mini-card */}
                {selectedTableColumn && (
                  <div className="mt-3 bg-surface rounded-lg p-3 border border-surface">
                    <div className="flex items-center justify-between mb-2">
                      <code className="text-primary text-xs">{selectedTableColumn}</code>
                      <button onClick={() => setSelectedTableColumn(null)} className="text-text/40 text-xs">✕</button>
                    </div>
                    {columnStatsLoading && <p className="text-text/40 text-[10px]">Laden...</p>}
                    {columnStats && !columnStatsLoading && (
                      <div className="space-y-1 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-text/50">Gevuld</span>
                          <span className="text-text">{columnStats.filled.toLocaleString('nl-NL')}/{columnStats.total.toLocaleString('nl-NL')} ({columnStats.total > 0 ? Math.round(columnStats.filled / columnStats.total * 100) : 0}%)</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text/50">Uniek</span>
                          <span className="text-text">{columnStats.unique_count.toLocaleString('nl-NL')}</span>
                        </div>
                        {columnStats.top_values && columnStats.top_values.length > 0 && (
                          <div className="border-t border-bg-dark pt-1 mt-1">
                            <span className="text-text/40 text-[10px]">Top waarden:</span>
                            {columnStats.top_values.slice(0, 5).map(([val, cnt]) => (
                              <div key={val} className="flex justify-between text-[10px]">
                                <span className="text-text/60 truncate max-w-[100px]">{val}</span>
                                <span className="text-text/40">{cnt}×</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {selectedTable?.type === 'raw' && (
                          <div className="border-t border-bg-dark pt-1 mt-1">
                            <span className="text-text/40 text-[10px]">Query fragment:</span>
                            <code
                              className="text-primary/70 text-[10px] block mt-0.5 cursor-pointer hover:text-primary"
                              onClick={() => insertQueryHint(`data->>'${selectedTableColumn}'`)}
                            >
                              data-&gt;&gt;'{selectedTableColumn}'
                            </code>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Query form - right panel */}
          <div className="lg:col-span-3 bg-bg-header rounded-xl p-6 border border-primary/30">
            <h3 className="text-text font-semibold mb-4">Nieuwe view aanmaken</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-text/70 text-sm block mb-1">Slug (unieke naam)</label>
                <input
                  type="text"
                  placeholder="bijv. active_contracts"
                  value={formData.slug}
                  onChange={e => setFormData(d => ({ ...d, slug: e.target.value.replace(/[^a-z0-9_]/g, '') }))}
                  className="w-full bg-bg-dark border border-surface rounded-lg px-3 py-2 text-text text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="text-text/70 text-sm block mb-1">Titel</label>
                <input
                  type="text"
                  placeholder="bijv. Actieve Contracten"
                  value={formData.title}
                  onChange={e => setFormData(d => ({ ...d, title: e.target.value }))}
                  className="w-full bg-bg-dark border border-surface rounded-lg px-3 py-2 text-text text-sm focus:border-primary focus:outline-none"
                />
              </div>
            </div>
            <div className="mb-4">
              <label className="text-text/70 text-sm block mb-1">Beschrijving</label>
              <input
                type="text"
                placeholder="Korte beschrijving van wat deze view bevat"
                value={formData.description}
                onChange={e => setFormData(d => ({ ...d, description: e.target.value }))}
                className="w-full bg-bg-dark border border-surface rounded-lg px-3 py-2 text-text text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div className="mb-4">
              <label className="text-text/70 text-sm block mb-1">
                SQL Query
                <span className="text-text/40 text-xs ml-2">Klik op een tabel links om kolommen te verkennen</span>
              </label>
              <textarea
                rows={10}
                placeholder={`SELECT\n  data->>'guid' as contract_guid,\n  data->>'candidateName' as kandidaat,\n  (data->>'startDate')::date as startdatum,\n  data->>'employerName' as werkgever,\n  data->>'statusName' as status\nFROM warehouse_rawrecord\nWHERE connector_resource_id = 1`}
                value={formData.query}
                onChange={e => setFormData(d => ({ ...d, query: e.target.value }))}
                className="w-full bg-bg-dark border border-surface rounded-lg px-3 py-2 text-text text-sm font-mono focus:border-primary focus:outline-none resize-y"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={createView}
                disabled={saving}
                className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {saving ? 'Bezig...' : 'Aanmaken'}
              </button>
              <button
                onClick={testQuery}
                disabled={saving}
                className="bg-surface text-text px-4 py-2 rounded-lg text-sm hover:bg-surface/80 transition-colors disabled:opacity-50"
              >
                Query testen
              </button>
            </div>

            {/* Test result */}
            {testError && (
              <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                <span className="text-red-400 text-sm">{testError}</span>
              </div>
            )}
            {testResult && (
              <div className="mt-4 bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <div className="text-green-400 text-sm mb-2">
                  ✓ Query succesvol: {testResult.row_count} rijen gevonden
                </div>
                {testResult.rows.length > 0 && (
                  <div className="overflow-x-auto scrollbar-thin">
                    <table className="text-xs text-text" style={{ width: 'max-content' }}>
                      <thead>
                        <tr className="border-b border-green-500/20">
                          {testResult.columns.map(col => (
                            <th key={col} className="px-2 py-1 text-left text-text/60 whitespace-nowrap">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {testResult.rows.slice(0, 5).map((row, i) => (
                          <tr key={i} className="border-b border-green-500/10">
                            {testResult.columns.map(col => (
                              <td key={col} className="px-2 py-1 max-w-[200px] truncate whitespace-nowrap">{String(row[col] ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {testResult.row_count > 5 && (
                      <div className="text-text/40 text-xs mt-1">... en {testResult.row_count - 5} meer</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Existing views table */}
      <div className="bg-bg-header rounded-xl p-6 border border-surface">
        <h3 className="text-text font-semibold mb-4">Views ({views.length})</h3>
        {views.length === 0 ? (
          <div className="bg-surface rounded-lg p-8 text-center">
            <span className="text-text/40">Nog geen views aangemaakt. Maak je eerste view aan om data te transformeren.</span>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text/60 border-b border-surface">
                  <th className="pb-2 pr-4">Titel</th>
                  <th className="pb-2 pr-4">Tabel naam</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Rijen</th>
                  <th className="pb-2 pr-4">Laatste refresh</th>
                  <th className="pb-2">Acties</th>
                </tr>
              </thead>
              <tbody>
                {views.map(view => (
                  <tr key={view.id} className="border-b border-surface/30">
                    <td className="py-3 pr-4">
                      <div className="text-text font-medium">{view.title}</div>
                      {view.description && (
                        <div className="text-text/40 text-xs mt-0.5">{view.description}</div>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <code className="text-primary/70 text-xs bg-primary/5 px-1.5 py-0.5 rounded">
                        mv_{view.slug}
                      </code>
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={view.status} />
                    </td>
                    <td className="py-3 pr-4 text-text/70">
                      {view.row_count?.toLocaleString('nl-NL') ?? '—'}
                    </td>
                    <td className="py-3 pr-4 text-text/50 text-xs">
                      {view.last_refreshed_at
                        ? new Date(view.last_refreshed_at).toLocaleString('nl-NL')
                        : 'Nooit'
                      }
                      {view.refresh_duration_ms != null && (
                        <span className="text-text/30 ml-1">({view.refresh_duration_ms}ms)</span>
                      )}
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => refreshView(view.id)}
                          disabled={refreshingId === view.id}
                          className="text-primary text-xs hover:text-primary-hover transition-colors disabled:opacity-50"
                        >
                          {refreshingId === view.id ? '⏳' : '🔄'} Refresh
                        </button>
                        <button
                          onClick={() => deleteView(view.id, view.title)}
                          className="text-red-400 text-xs hover:text-red-300 transition-colors"
                        >
                          🗑 Verwijder
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-gray-500/20 text-gray-400',
    active: 'bg-green-500/20 text-green-400',
    error: 'bg-red-500/20 text-red-400',
  }
  const labels: Record<string, string> = {
    draft: 'Draft',
    active: 'Actief',
    error: 'Fout',
  }
  return (
    <span className={`${styles[status] || styles.draft} px-2 py-0.5 rounded text-xs`}>
      {labels[status] || status}
    </span>
  )
}
