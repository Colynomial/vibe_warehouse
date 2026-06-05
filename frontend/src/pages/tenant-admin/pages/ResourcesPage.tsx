import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../../api/client'
import { useAuth } from '../../../hooks/useAuth'

interface Resource {
  id: number
  resource_slug: string
  resource_name: string
  custom_name: string
  is_active: boolean
  api_path: string
  cursor_field: string
  id_field: string
  parameters: Record<string, unknown>
  sync_frequency: string
  last_synced_at: string | null
  total_records: number
  connector: number
  connector_name: string
  connector_type_slug: string
  depends_on: number | null
  depends_on_name: string | null
  depends_on_column: string
  dependent_path_template: string
  notes: string
}

interface Connector {
  id: number
  name: string
  connector_type_slug: string
  connector_type_name: string
}

interface EndpointParam {
  key: string
  label: string
  type: string
  default?: unknown
}

interface AvailableResource {
  slug: string
  name: string
  path: string
  description?: string
  cursor_field: string | null
  id_field: string | null
  parameters: EndpointParam[]
}

interface ConnectorType {
  id: number
  slug: string
  name: string
  available_resources: AvailableResource[]
}

export default function ResourcesPage() {
  const { slug } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()
  const [resources, setResources] = useState<Resource[]>([])
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [connectorTypes, setConnectorTypes] = useState<ConnectorType[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'create'>('list')
  const [deleteTarget, setDeleteTarget] = useState<Resource | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [syncing, setSyncing] = useState<number | null>(null)

  const load = async () => {
    const [res, con, types] = await Promise.all([
      api.get('/api/warehouse/resources/', token, slug),
      api.get('/api/warehouse/connectors/', token, slug),
      api.get('/api/warehouse/connector-types/', token, slug),
    ])
    setResources(res)
    setConnectors(con)
    setConnectorTypes(types)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleSync = async (id: number) => {
    setSyncing(id)
    try {
      await api.post(`/api/warehouse/resources/${id}/sync/`, {}, token, slug)
      await load()
    } finally {
      setSyncing(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await api.delete(`/api/warehouse/resources/${deleteTarget.id}/`, token, slug)
    setDeleteTarget(null)
    setDeleteConfirm('')
    load()
  }

  if (loading) return <div className="text-white/60 p-8">Loading...</div>

  if (view === 'create') {
    return (
      <CreateResourceView
        connectors={connectors}
        connectorTypes={connectorTypes}
        resources={resources}
        token={token}
        tenantSlug={slug!}
        onCancel={() => setView('list')}
        onCreated={() => { setView('list'); load() }}
      />
    )
  }

  return (
    <div className="space-y-6 min-h-0">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Resources</h2>
          <p className="text-sm text-white/40 mt-1">Data sources linked to your connectors</p>
        </div>
        <button
          onClick={() => setView('create')}
          className="px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/80 font-medium transition-colors"
        >
          + Add Resource
        </button>
      </div>

      {/* Resources Table */}
      <div className="bg-surface rounded-xl overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="bg-bg-header text-white/60 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Connector</th>
                <th className="px-4 py-3 text-left">Endpoint</th>
                <th className="px-4 py-3 text-right">Records</th>
                <th className="px-4 py-3 text-left">Last Sync</th>
                <th className="px-4 py-3 text-left">Frequency</th>
                <th className="px-4 py-3 text-right w-36">Actions</th>
              </tr>
            </thead>
            <tbody className="text-white divide-y divide-white/5">
              {resources.map(r => (
                <tr key={r.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => navigate(`/tenant/${slug}/admin/resources/${r.id}`)}
                      className="text-primary hover:underline font-medium"
                    >
                      {r.resource_name}
                    </button>
                    {r.depends_on_name && (
                      <span className="ml-2 text-xs bg-white/10 px-1.5 py-0.5 rounded text-white/50">
                        ↳ {r.depends_on_name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-white/60">{r.connector_name}</td>
                  <td className="px-4 py-3">
                    <code className="text-xs bg-white/5 px-2 py-0.5 rounded text-white/50">{r.api_path || r.resource_slug}</code>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{r.total_records.toLocaleString()}</td>
                  <td className="px-4 py-3 text-white/60 text-xs">
                    {r.last_synced_at ? new Date(r.last_synced_at).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : <span className="text-white/30">Never</span>}
                  </td>
                  <td className="px-4 py-3 text-white/60 capitalize">{r.sync_frequency}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleSync(r.id)}
                        disabled={syncing === r.id}
                        className="px-2.5 py-1 text-xs bg-primary/20 text-primary rounded hover:bg-primary/30 transition-colors disabled:opacity-50"
                      >
                        {syncing === r.id ? '⟳' : '▶'} Sync
                      </button>
                      <button
                        onClick={() => setDeleteTarget(r)}
                        className="px-2 py-1 text-xs bg-red-500/10 text-red-400/70 rounded hover:bg-red-500/20 hover:text-red-400 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {resources.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="text-white/30 text-lg mb-2">No resources yet</div>
                    <p className="text-white/20 text-sm">Click "+ Add Resource" to connect your first data source</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => { setDeleteTarget(null); setDeleteConfirm('') }}>
          <div className="bg-surface border border-white/10 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 text-lg">⚠</div>
              <div>
                <h3 className="text-lg font-bold text-white">Delete Resource</h3>
                <p className="text-sm text-white/40">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-white/70 text-sm mb-4">
              This will permanently delete <strong className="text-white">{deleteTarget.resource_name}</strong> and all
              its <strong className="text-white">{deleteTarget.total_records.toLocaleString()}</strong> synced records.
            </p>
            <label className="block text-white/50 text-xs mb-1.5">
              Type <strong className="text-white/80">delete</strong> to confirm
            </label>
            <input
              type="text"
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder="delete"
              className="w-full px-3 py-2 bg-bg-dark border border-white/10 rounded text-white text-sm mb-4 focus:border-red-500/50 focus:outline-none"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteConfirm('') }}
                className="px-4 py-2 text-white/60 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteConfirm !== 'delete'}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Delete Resource
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* =========================================
   CREATE RESOURCE - Full page view
   ========================================= */

function CreateResourceView({ connectors, connectorTypes, resources, token, tenantSlug, onCancel, onCreated }: {
  connectors: Connector[]
  connectorTypes: ConnectorType[]
  resources: Resource[]
  token: string | null
  tenantSlug: string
  onCancel: () => void
  onCreated: () => void
}) {
  // Step 1: Choose connector
  const [selectedConnector, setSelectedConnector] = useState<number | null>(null)
  // Step 2: Choose endpoint
  const [selectedEndpoint, setSelectedEndpoint] = useState<AvailableResource | null>(null)
  // Step 3: Configure
  const [customName, setCustomName] = useState('')
  const [cursorField, setCursorField] = useState('')
  const [idField, setIdField] = useState('')
  const [syncFrequency, setSyncFrequency] = useState('daily')
  const [notes, setNotes] = useState('')
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  // Dependency
  const [dependsOn, setDependsOn] = useState<number | null>(null)
  const [dependsOnColumn, setDependsOnColumn] = useState('')
  const [dependentPathTemplate, setDependentPathTemplate] = useState('')
  // State
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const connector = connectors.find(c => c.id === selectedConnector)
  const connectorType = connector
    ? connectorTypes.find(ct => ct.slug === connector.connector_type_slug)
    : null
  const availableEndpoints = connectorType?.available_resources || []

  const handleEndpointSelect = (ep: AvailableResource) => {
    setSelectedEndpoint(ep)
    setCustomName(ep.name)
    setCursorField(ep.cursor_field || '')
    setIdField(ep.id_field || '')
    setFilterValues({})
  }

  const handleSubmit = async () => {
    if (!selectedConnector || !selectedEndpoint) return
    setSaving(true)
    setError('')

    // Build parameters from filter values (only non-empty)
    const apiParameters: Record<string, string> = {}
    Object.entries(filterValues).forEach(([k, v]) => {
      if (v !== '' && v !== undefined) apiParameters[k] = v
    })

    try {
      await api.post('/api/warehouse/resources/', {
        connector: selectedConnector,
        resource_slug: selectedEndpoint.slug,
        custom_name: customName,
        api_path: selectedEndpoint.path,
        cursor_field: cursorField,
        id_field: idField,
        sync_frequency: syncFrequency,
        parameters: Object.keys(apiParameters).length > 0 ? { api_parameters: apiParameters } : {},
        notes,
        depends_on: dependsOn || null,
        depends_on_column: dependsOnColumn,
        dependent_path_template: dependentPathTemplate,
      }, token, tenantSlug)
      onCreated()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create')
    } finally {
      setSaving(false)
    }
  }

  const currentStep = !selectedConnector ? 1 : !selectedEndpoint ? 2 : 3

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={onCancel} className="text-white/40 hover:text-white transition-colors text-lg">
          ←
        </button>
        <div>
          <h2 className="text-xl font-bold text-white">Add Resource</h2>
          <p className="text-sm text-white/40 mt-0.5">Step {currentStep} of 3</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1">
        {[1, 2, 3].map(s => (
          <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= currentStep ? 'bg-primary' : 'bg-white/10'}`} />
        ))}
      </div>

      {error && <div className="p-3 bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-sm">{error}</div>}

      {/* Step 1: Connector */}
      <div className={`bg-surface rounded-xl p-5 border transition-colors ${currentStep === 1 ? 'border-primary/30' : 'border-white/5'}`}>
        <h3 className="text-white font-medium mb-3 flex items-center gap-2">
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${selectedConnector ? 'bg-primary text-white' : 'bg-white/10 text-white/40'}`}>1</span>
          Select Connector
        </h3>
        {connectors.length === 0 ? (
          <p className="text-white/40 text-sm">No connectors configured yet. Go to Connectors to add one first.</p>
        ) : (
          <div className="grid gap-2">
            {connectors.map(c => (
              <button
                key={c.id}
                onClick={() => { setSelectedConnector(c.id); setSelectedEndpoint(null) }}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all ${
                  selectedConnector === c.id
                    ? 'border-primary bg-primary/10 text-white'
                    : 'border-white/10 hover:border-white/20 text-white/70 hover:text-white'
                }`}
              >
                <span className="text-lg">🔌</span>
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-white/40">{c.connector_type_name}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Step 2: Endpoint */}
      {selectedConnector && (
        <div className={`bg-surface rounded-xl p-5 border transition-colors ${currentStep === 2 ? 'border-primary/30' : 'border-white/5'}`}>
          <h3 className="text-white font-medium mb-3 flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${selectedEndpoint ? 'bg-primary text-white' : 'bg-white/10 text-white/40'}`}>2</span>
            Choose Endpoint
          </h3>
          <div className="grid gap-2 max-h-80 overflow-y-auto scrollbar-thin pr-2">
            {availableEndpoints.map(ep => (
              <button
                key={ep.slug}
                onClick={() => handleEndpointSelect(ep)}
                className={`flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-all ${
                  selectedEndpoint?.slug === ep.slug
                    ? 'border-primary bg-primary/10 text-white'
                    : 'border-white/10 hover:border-white/20 text-white/70 hover:text-white'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{ep.name}</div>
                  <div className="text-xs text-white/40 truncate">{ep.description}</div>
                </div>
                <code className="text-xs bg-white/5 px-2 py-0.5 rounded text-white/30 ml-3 shrink-0">{ep.path}</code>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Configure */}
      {selectedEndpoint && (
        <div className="bg-surface rounded-xl p-5 border border-primary/30">
          <h3 className="text-white font-medium mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-white/10 text-white/40">3</span>
            Configure
          </h3>

          <div className="space-y-4">
            {/* Name + frequency row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-white/50 text-xs mb-1.5 uppercase tracking-wider">Display Name</label>
                <input
                  type="text"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  className="w-full px-3 py-2 bg-bg-dark border border-white/10 rounded-lg text-white focus:border-primary/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-white/50 text-xs mb-1.5 uppercase tracking-wider">Sync Frequency</label>
                <select
                  value={syncFrequency}
                  onChange={e => setSyncFrequency(e.target.value)}
                  className="w-full px-3 py-2 bg-bg-dark border border-white/10 rounded-lg text-white focus:border-primary/50 focus:outline-none"
                >
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
            </div>

            {/* Cursor + ID fields (prefilled, editable) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-white/50 text-xs mb-1.5 uppercase tracking-wider">Cursor Field (incremental sync)</label>
                <input
                  type="text"
                  value={cursorField}
                  onChange={e => setCursorField(e.target.value)}
                  placeholder="No cursor (full sync each time)"
                  className="w-full px-3 py-2 bg-bg-dark border border-white/10 rounded-lg text-white text-sm font-mono focus:border-primary/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-white/50 text-xs mb-1.5 uppercase tracking-wider">ID Field (deduplication)</label>
                <input
                  type="text"
                  value={idField}
                  onChange={e => setIdField(e.target.value)}
                  placeholder="guid"
                  className="w-full px-3 py-2 bg-bg-dark border border-white/10 rounded-lg text-white text-sm font-mono focus:border-primary/50 focus:outline-none"
                />
              </div>
            </div>

            {/* API Filters */}
            {selectedEndpoint.parameters.length > 0 && (
              <div>
                <label className="block text-white/50 text-xs mb-2 uppercase tracking-wider">
                  API Filters <span className="text-white/30 normal-case">(optional — applied on every sync)</span>
                </label>
                <div className="bg-bg-dark rounded-lg border border-white/5 p-4 space-y-3">
                  {selectedEndpoint.parameters.map(param => (
                    <div key={param.key} className="flex items-center gap-3">
                      <label className="w-52 shrink-0 text-sm text-white/60">{param.label}</label>
                      {param.type === 'boolean' ? (
                        <select
                          value={filterValues[param.key] ?? ''}
                          onChange={e => setFilterValues(prev => ({ ...prev, [param.key]: e.target.value }))}
                          className="flex-1 px-3 py-1.5 bg-surface border border-white/10 rounded text-white text-sm focus:border-primary/50 focus:outline-none"
                        >
                          <option value="">— default —</option>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      ) : param.type === 'date-time' ? (
                        <input
                          type="text"
                          value={filterValues[param.key] ?? ''}
                          onChange={e => setFilterValues(prev => ({ ...prev, [param.key]: e.target.value }))}
                          placeholder="YYYY-MM-DD or leave empty"
                          className="flex-1 px-3 py-1.5 bg-surface border border-white/10 rounded text-white text-sm font-mono focus:border-primary/50 focus:outline-none"
                        />
                      ) : (
                        <input
                          type="text"
                          value={filterValues[param.key] ?? ''}
                          onChange={e => setFilterValues(prev => ({ ...prev, [param.key]: e.target.value }))}
                          placeholder={param.default !== undefined ? String(param.default) : ''}
                          className="flex-1 px-3 py-1.5 bg-surface border border-white/10 rounded text-white text-sm focus:border-primary/50 focus:outline-none"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dependency (collapsible) */}
            <details className="group">
              <summary className="text-white/50 text-xs uppercase tracking-wider cursor-pointer hover:text-white/70 transition-colors">
                ▸ Dependent Resource (advanced)
              </summary>
              <div className="mt-3 space-y-3 pl-4 border-l-2 border-white/10">
                <div>
                  <label className="block text-white/50 text-xs mb-1">Parent Resource</label>
                  <select
                    value={dependsOn ?? ''}
                    onChange={e => setDependsOn(Number(e.target.value) || null)}
                    className="w-full px-3 py-2 bg-bg-dark border border-white/10 rounded-lg text-white text-sm focus:border-primary/50 focus:outline-none"
                  >
                    <option value="">No dependency</option>
                    {resources.map(r => (
                      <option key={r.id} value={r.id}>{r.resource_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-white/50 text-xs mb-1">Column from parent (provides IDs)</label>
                  <input
                    type="text"
                    value={dependsOnColumn}
                    onChange={e => setDependsOnColumn(e.target.value)}
                    placeholder="e.g. guid"
                    className="w-full px-3 py-2 bg-bg-dark border border-white/10 rounded-lg text-white text-sm font-mono focus:border-primary/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-white/50 text-xs mb-1">Path template (use {'{'}column{'}'} as placeholder)</label>
                  <input
                    type="text"
                    value={dependentPathTemplate}
                    onChange={e => setDependentPathTemplate(e.target.value)}
                    placeholder="/api/contracts/{guid}/details"
                    className="w-full px-3 py-2 bg-bg-dark border border-white/10 rounded-lg text-white text-sm font-mono focus:border-primary/50 focus:outline-none"
                  />
                </div>
              </div>
            </details>

            {/* Notes */}
            <div>
              <label className="block text-white/50 text-xs mb-1.5 uppercase tracking-wider">Notes <span className="text-white/30 normal-case">(context for AI processing)</span></label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="e.g. Only active contracts for Faam agency..."
                className="w-full px-3 py-2 bg-bg-dark border border-white/10 rounded-lg text-white text-sm focus:border-primary/50 focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/5">
            <button onClick={onCancel} className="text-white/40 hover:text-white text-sm transition-colors">Cancel</button>
            <button
              onClick={handleSubmit}
              disabled={saving || !customName}
              className="px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/80 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-all"
            >
              {saving ? 'Creating...' : 'Create Resource'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
