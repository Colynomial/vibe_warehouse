import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../../api/client'
import { useAuth } from '../../../hooks/useAuth'

interface Resource {
  id: number
  resource_slug: string
  resource_name: string
  is_active: boolean
  sync_frequency: string
  last_synced_at: string | null
  total_records: number
  preview_record_count: number | null
  preview_fields: { name: string; type: string }[] | null
  parameters: Record<string, unknown>
}

interface Connector {
  id: number
  name: string
  connector_type: number
  connector_type_name: string
  connector_type_slug: string
  is_active: boolean
  last_validated_at: string | null
  validation_error: string
  resources: Resource[]
  credentials_masked: Record<string, string>
}

interface ConnectorType {
  id: number
  slug: string
  name: string
  description: string
  auth_type: string
  credential_schema: { key: string; label: string; type: string; required?: boolean; default?: string }[]
  available_resources: { slug: string; name: string; description?: string; cursor_field?: string; id_field?: string; parameters?: { key: string; label: string; type: string; default?: unknown }[] }[]
}

export default function ConnectorsPage() {
  const { slug } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [connectorTypes, setConnectorTypes] = useState<ConnectorType[]>([])
  const [loading, setLoading] = useState(true)
  const [editingCredentials, setEditingCredentials] = useState<Connector | null>(null)
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [activatingResource, setActivatingResource] = useState<{ connector: Connector; resource: { slug: string; name: string; description?: string; cursor_field?: string; id_field?: string; parameters?: { key: string; label: string; type: string; default?: unknown }[] } } | null>(null)
  const [resourceConfig, setResourceConfig] = useState<{ cursor_field: string; id_field: string; sync_frequency: string; api_parameters: Record<string, string> }>({ cursor_field: '', id_field: '', sync_frequency: 'daily', api_parameters: {} })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setError('')
    try {
      const [c, types] = await Promise.all([
        api.get('/api/warehouse/connectors/', token, slug),
        api.get('/api/warehouse/connector-types/', token, slug),
      ])
      setConnectors(Array.isArray(c) ? c : c.results || [])
      setConnectorTypes(Array.isArray(types) ? types : types.results || [])
    } catch (e) {
      console.error(e)
      setError((e as Error).message || 'Kan connectors niet laden')
    } finally {
      setLoading(false)
    }
  }

  function getCredentialSchema(connector: Connector) {
    return connectorTypes.find(t => t.slug === connector.connector_type_slug)?.credential_schema || []
  }

  function startEditCredentials(connector: Connector) {
    setEditingCredentials(connector)
    // Pre-fill with masked values (user can overwrite)
    const schema = getCredentialSchema(connector)
    const initial: Record<string, string> = {}
    for (const field of schema) {
      const masked = connector.credentials_masked?.[field.key] || ''
      // Don't pre-fill password fields with masked values
      initial[field.key] = field.type === 'password' ? '' : masked
    }
    setCredentialValues(initial)
  }

  async function saveCredentials() {
    if (!editingCredentials) return
    setSaving(true)
    try {
      // Only send non-empty values (empty passwords = keep current)
      const schema = getCredentialSchema(editingCredentials)
      const creds: Record<string, string> = {}
      for (const field of schema) {
        const val = credentialValues[field.key]
        if (val) {
          creds[field.key] = val
        }
      }
      await api.patch(
        `/api/warehouse/connectors/${editingCredentials.id}/`,
        { credentials: creds },
        token, slug
      )
      setEditingCredentials(null)
      loadData()
    } catch (e) {
      alert('Fout bij opslaan: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function testConnection(connectorId: number) {
    try {
      const result = await api.post(`/api/warehouse/connectors/${connectorId}/test/`, {}, token, slug)
      alert(result.message || 'Verbinding succesvol!')
      loadData()
    } catch (e) {
      alert('Test mislukt: ' + (e as Error).message)
    }
  }

  async function deleteConnector(connector: Connector) {
    const totalRecords = connector.resources.reduce((sum, r) => sum + r.total_records, 0)
    const msg = `⚠️ Weet je zeker dat je "${connector.name}" wilt verwijderen?\n\nDit verwijdert ook:\n• ${connector.resources.length} resource(s)\n• ${totalRecords.toLocaleString('nl-NL')} opgehaalde records\n• Alle ingestion history\n\nDit kan niet ongedaan worden gemaakt.`
    if (!confirm(msg)) return
    // Double-check
    if (!confirm(`Laatste check: typ je echt ALLE data van "${connector.name}" wilt verwijderen?`)) return
    try {
      await api.delete(`/api/warehouse/connectors/${connector.id}/`, token, slug)
      loadData()
    } catch (e) {
      alert('Verwijderen mislukt: ' + (e as Error).message)
    }
  }

  function startActivateResource(connector: Connector, resource: { slug: string; name: string; description?: string; cursor_field?: string; id_field?: string; parameters?: { key: string; label: string; type: string; default?: unknown }[] }) {
    setActivatingResource({ connector, resource })
    setResourceConfig({
      cursor_field: resource.cursor_field || 'lastUpdatedDateTimeUtcFrom',
      id_field: resource.id_field || 'guid',
      sync_frequency: 'daily',
      api_parameters: {},
    })
  }

  async function activateResource() {
    if (!activatingResource) return
    setSaving(true)
    try {
      await api.post(
        `/api/warehouse/connectors/${activatingResource.connector.id}/resources/`,
        {
          resource_slug: activatingResource.resource.slug,
          sync_frequency: resourceConfig.sync_frequency,
          parameters: {
            cursor_field: resourceConfig.cursor_field,
            id_field: resourceConfig.id_field,
            api_parameters: resourceConfig.api_parameters,
          },
        },
        token, slug
      )
      setActivatingResource(null)
      loadData()
    } catch (e) {
      alert('Activeren mislukt: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-text/50">Laden...</div>

  return (
    <div className="space-y-6">
      {/* Error message */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <span className="text-red-400 text-sm">Fout bij laden: {error}</span>
          <button onClick={loadData} className="ml-3 text-primary text-sm hover:underline">Opnieuw proberen</button>
        </div>
      )}

      {/* Credential edit modal */}
      {editingCredentials && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-bg-header rounded-xl border border-surface p-6 w-full max-w-lg">
            <h3 className="text-text text-lg font-semibold mb-1">
              Credentials: {editingCredentials.name}
            </h3>
            <p className="text-text/50 text-sm mb-4">
              Vul de API-gegevens in om deze connector te autoriseren.
              {editingCredentials.validation_error && (
                <span className="block mt-1 text-red-400">
                  Laatste fout: {editingCredentials.validation_error}
                </span>
              )}
            </p>
            <div className="space-y-3">
              {getCredentialSchema(editingCredentials).map(field => (
                <div key={field.key}>
                  <label className="text-text/70 text-sm block mb-1">
                    {field.label}
                    {field.required && <span className="text-red-400 ml-1">*</span>}
                  </label>
                  <input
                    type={field.type === 'password' ? 'password' : 'text'}
                    placeholder={
                      field.type === 'password'
                        ? (editingCredentials.credentials_masked?.[field.key]
                            ? `Huidig: ${editingCredentials.credentials_masked[field.key]}`
                            : 'Niet ingesteld')
                        : field.default || ''
                    }
                    value={credentialValues[field.key] || ''}
                    onChange={e => setCredentialValues(v => ({ ...v, [field.key]: e.target.value }))}
                    className="w-full bg-bg-dark border border-surface rounded-lg px-3 py-2 text-text text-sm focus:border-primary focus:outline-none"
                  />
                  {field.type === 'password' && editingCredentials.credentials_masked?.[field.key] && (
                    <p className="text-text/40 text-xs mt-0.5">Laat leeg om huidige waarde te behouden</p>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={saveCredentials}
                disabled={saving}
                className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {saving ? 'Opslaan...' : 'Opslaan'}
              </button>
              <button
                onClick={() => setEditingCredentials(null)}
                className="bg-surface text-text px-4 py-2 rounded-lg text-sm hover:bg-surface/80 transition-colors"
              >
                Annuleren
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resource activation modal */}
      {activatingResource && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-bg-header rounded-xl border border-surface p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin">
            <h3 className="text-text text-lg font-semibold mb-1">
              Resource activeren: {activatingResource.resource.name}
            </h3>
            <p className="text-text/50 text-sm mb-4">
              Configureer hoe deze resource wordt opgehaald en gesynchroniseerd.
              {activatingResource.resource.description && (
                <span className="block mt-1 text-text/40">{activatingResource.resource.description}</span>
              )}
            </p>

            <div className="space-y-4">
              {/* Cursor field - which date field to use for incremental sync */}
              <div>
                <label className="text-text/70 text-sm block mb-1">
                  Cursor veld (datum voor sync)
                  <span className="text-text/40 text-xs ml-1">— bepaalt vanaf wanneer nieuwe data wordt opgehaald</span>
                </label>
                <input
                  type="text"
                  value={resourceConfig.cursor_field}
                  onChange={e => setResourceConfig(c => ({ ...c, cursor_field: e.target.value }))}
                  placeholder="bijv. lastUpdatedDateTimeUtcFrom"
                  className="w-full bg-bg-dark border border-surface rounded-lg px-3 py-2 text-text text-sm font-mono focus:border-primary focus:outline-none"
                />
              </div>

              {/* ID field - unique identifier in each record */}
              <div>
                <label className="text-text/70 text-sm block mb-1">
                  ID veld (unieke identifier)
                  <span className="text-text/40 text-xs ml-1">— hoe records worden geïdentificeerd voor upsert</span>
                </label>
                <input
                  type="text"
                  value={resourceConfig.id_field}
                  onChange={e => setResourceConfig(c => ({ ...c, id_field: e.target.value }))}
                  placeholder="bijv. guid"
                  className="w-full bg-bg-dark border border-surface rounded-lg px-3 py-2 text-text text-sm font-mono focus:border-primary focus:outline-none"
                />
              </div>

              {/* Sync frequency */}
              <div>
                <label className="text-text/70 text-sm block mb-1">Sync frequentie</label>
                <select
                  value={resourceConfig.sync_frequency}
                  onChange={e => setResourceConfig(c => ({ ...c, sync_frequency: e.target.value }))}
                  className="w-full bg-bg-dark border border-surface rounded-lg px-3 py-2 text-text text-sm focus:border-primary focus:outline-none"
                >
                  <option value="hourly">Elk uur</option>
                  <option value="daily">Dagelijks</option>
                  <option value="weekly">Wekelijks</option>
                </select>
              </div>

              {/* API-specific parameters */}
              {activatingResource.resource.parameters && activatingResource.resource.parameters.length > 0 && (
                <div>
                  <label className="text-text/70 text-sm block mb-2">API Parameters</label>
                  <div className="space-y-2">
                    {activatingResource.resource.parameters.map(param => (
                      <div key={param.key} className="flex items-center gap-3">
                        <label className="text-text/60 text-sm min-w-[150px]">{param.label}</label>
                        {param.type === 'boolean' ? (
                          <input
                            type="checkbox"
                            checked={resourceConfig.api_parameters[param.key] === 'true'}
                            onChange={e => setResourceConfig(c => ({
                              ...c,
                              api_parameters: { ...c.api_parameters, [param.key]: String(e.target.checked) }
                            }))}
                            className="accent-primary"
                          />
                        ) : (
                          <input
                            type="text"
                            value={resourceConfig.api_parameters[param.key] || String(param.default ?? '')}
                            onChange={e => setResourceConfig(c => ({
                              ...c,
                              api_parameters: { ...c.api_parameters, [param.key]: e.target.value }
                            }))}
                            className="flex-1 bg-bg-dark border border-surface rounded px-2 py-1.5 text-text text-sm focus:border-primary focus:outline-none"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={activateResource}
                disabled={saving}
                className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {saving ? 'Activeren...' : 'Resource activeren'}
              </button>
              <button
                onClick={() => setActivatingResource(null)}
                className="bg-surface text-text px-4 py-2 rounded-lg text-sm hover:bg-surface/80 transition-colors"
              >
                Annuleren
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-bg-header rounded-xl p-6 border border-surface">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-text text-xl font-semibold">Connectors</h2>
        </div>

        {connectors.length === 0 ? (
          <div className="bg-surface rounded-lg p-8 text-center">
            <span className="text-text/40">Nog geen connectors geconfigureerd</span>
          </div>
        ) : (
          <div className="space-y-4">
            {connectors.map(connector => (
              <div key={connector.id} className="bg-surface rounded-lg p-5 border border-surface">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🔗</span>
                    <div>
                      <h3 className="text-text font-semibold">{connector.name}</h3>
                    <p className="text-text/50 text-sm">
                      {connector.connector_type_name}
                      {connector.last_validated_at ? (
                        connector.validation_error ? (
                          <span className="ml-2 text-red-400">· Autorisatie mislukt</span>
                        ) : (
                          <span className="ml-2 text-green-400">· Geautoriseerd</span>
                        )
                      ) : (
                        <span className="ml-2 text-yellow-400">· Niet gevalideerd</span>
                      )}
                    </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => startEditCredentials(connector)}
                      className="bg-bg-dark text-text/70 px-3 py-1.5 rounded text-sm hover:bg-bg-dark/80 transition-colors"
                    >
                      Credentials
                    </button>
                    <button
                      onClick={() => testConnection(connector.id)}
                      className="bg-primary/10 text-primary px-3 py-1.5 rounded text-sm hover:bg-primary/20 transition-colors"
                    >
                      Test verbinding
                    </button>
                    <button
                      onClick={() => deleteConnector(connector)}
                      className="bg-red-500/10 text-red-400 px-3 py-1.5 rounded text-sm hover:bg-red-500/20 transition-colors"
                    >
                      Verwijder
                    </button>
                  </div>
                </div>

                {/* Active resources */}
                <div className="mt-4 border-t border-bg-dark pt-4">
                  <h4 className="text-text/70 text-sm font-medium mb-3">Actieve resources</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {connector.resources.filter(r => r.is_active).map(resource => (
                      <button
                        key={resource.id}
                        onClick={() => navigate(`/tenant/${slug}/admin/connectors/${connector.id}/resources/${resource.resource_slug}`)}
                        className="bg-bg-dark rounded-lg p-3 text-left hover:bg-bg-dark/70 transition-colors group"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-text text-sm font-medium group-hover:text-primary transition-colors">
                            {resource.resource_name}
                          </span>
                          {resource.total_records > 0 ? (
                            <span className="bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded text-xs">
                              {resource.total_records} records
                            </span>
                          ) : (
                            <span className="bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded text-xs">
                              Wacht op preload
                            </span>
                          )}
                        </div>
                        <div className="text-text/40 text-xs">
                          {resource.last_synced_at
                            ? `Laatste sync: ${new Date(resource.last_synced_at).toLocaleString('nl-NL')}`
                            : 'Nog niet gesynchroniseerd'
                          }
                        </div>
                        <div className="text-primary/60 text-xs mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          Klik voor details →
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Available but inactive */}
                {(() => {
                  const type = connectorTypes.find(t => t.slug === connector.connector_type_slug)
                  const activeSlgs = connector.resources.filter(r => r.is_active).map(r => r.resource_slug)
                  const inactive = type?.available_resources.filter(r => !activeSlgs.includes(r.slug)) || []
                  if (inactive.length === 0) return null
                  return (
                    <div className="mt-4 border-t border-bg-dark pt-4">
                      <h4 className="text-text/70 text-sm font-medium mb-3">Beschikbare resources</h4>
                      <div className="flex flex-wrap gap-2">
                        {inactive.map(r => (
                          <button
                            key={r.slug}
                            onClick={() => startActivateResource(connector, r)}
                            className="bg-bg-dark text-text/50 px-3 py-1.5 rounded text-sm hover:bg-surface hover:text-text/70 transition-colors"
                          >
                            + {r.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
