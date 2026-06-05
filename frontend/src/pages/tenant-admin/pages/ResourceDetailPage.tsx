import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../../api/client'
import { useAuth } from '../../../hooks/useAuth'

interface ResourceDetail {
  id: number
  resource_slug: string
  resource_name: string
  is_active: boolean
  sync_frequency: string
  last_synced_at: string | null
  total_records: number
  preview_record_count: number | null
  preview_fields: { name: string; type: string }[] | null
  preview_data: Record<string, unknown>[] | null
  parameters: Record<string, unknown>
}

interface IngestionRun {
  id: number
  run_type: string
  status: 'running' | 'success' | 'partial' | 'failed'
  records_fetched: number
  records_created: number
  records_updated: number
  api_calls_made: number
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  error_message: string
}

export default function ResourceDetailPage() {
  const { slug, connectorId, resourceSlug, resourceId } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()
  const [resource, setResource] = useState<ResourceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState('')
  const [preloadFrom, setPreloadFrom] = useState('')
  const [activeRun, setActiveRun] = useState<IngestionRun | null>(null)
  const [previewError, setPreviewError] = useState('')
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    loadResource(true)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  async function loadResource(checkRuns = false) {
    try {
      let r: ResourceDetail | null = null
      if (resourceId) {
        r = await api.get(`/api/warehouse/resources/${resourceId}/`, token, slug)
      } else if (connectorId && resourceSlug) {
        const resources = await api.get(
          `/api/warehouse/connectors/${connectorId}/resources/`,
          token, slug
        )
        r = resources.find((res: ResourceDetail) => res.resource_slug === resourceSlug)
      }
      if (r) {
        setResource(r)
        if (checkRuns) await checkActiveRun(r.id)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function checkActiveRun(resourceId: number) {
    try {
      const runs: IngestionRun[] = await api.get(
        `/api/warehouse/resources/${resourceId}/runs/`,
        token, slug
      )
      const running = runs.find(r => r.status === 'running')
      if (running) {
        setActiveRun(running)
        startPolling(resourceId)
      }
      // Don't clear activeRun here — let completed runs stay visible
    } catch (e) {
      // runs endpoint may not exist yet
    }
  }

  function startPolling(resourceId: number) {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const runs: IngestionRun[] = await api.get(
          `/api/warehouse/resources/${resourceId}/runs/`,
          token, slug
        )
        const latest = runs[0]
        if (latest && latest.status === 'running') {
          setActiveRun(latest)
        } else {
          // Run finished — show final state and stop polling
          if (latest) setActiveRun(latest)
          if (pollRef.current) clearInterval(pollRef.current)
          // Reload resource to get updated stats
          loadResource()
        }
      } catch {
        if (pollRef.current) clearInterval(pollRef.current)
      }
    }, 2000)
  }

  async function fetchPreview() {
    setActionLoading('preview')
    setPreviewError('')
    try {
      const result = await api.post(
        `/api/warehouse/resources/${resource?.id}/preview/`,
        {}, token, slug
      )
      // The response IS the updated resource with preview_data
      if (result && result.preview_data) {
        setResource(result)
      } else {
        await loadResource()
      }
    } catch (e) {
      setPreviewError((e as Error).message || 'Preview mislukt')
    } finally {
      setActionLoading('')
    }
  }

  async function startPreload() {
    if (!preloadFrom) {
      setPreloadFrom(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
    }
    setActionLoading('preload')
    try {
      const result = await api.post(
        `/api/warehouse/resources/${resource?.id}/preload/`,
        { from_date: preloadFrom || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] },
        token, slug
      )
      // Immediately start polling - run is already created
      if (resource && result?.run_id) {
        setActiveRun({ id: result.run_id, run_type: 'preload', status: 'running', records_fetched: 0, records_created: 0, records_updated: 0, api_calls_made: 0, started_at: new Date().toISOString(), completed_at: null, duration_ms: null, error_message: '' })
        startPolling(resource.id)
      }
    } catch (e) {
      setPreviewError((e as Error).message || 'Preload mislukt')
    } finally {
      setActionLoading('')
    }
  }

  async function startSync() {
    setActionLoading('sync')
    try {
      const result = await api.post(
        `/api/warehouse/resources/${resource?.id}/sync/`,
        {}, token, slug
      )
      if (resource && result?.run_id) {
        setActiveRun({ id: result.run_id, run_type: 'incremental', status: 'running', records_fetched: 0, records_created: 0, records_updated: 0, api_calls_made: 0, started_at: new Date().toISOString(), completed_at: null, duration_ms: null, error_message: '' })
        startPolling(resource.id)
      }
    } catch (e) {
      setPreviewError((e as Error).message || 'Sync mislukt')
    } finally {
      setActionLoading('')
    }
  }

  if (loading) return <div className="text-text/50">Laden...</div>
  if (!resource) return <div className="text-text/50">Resource niet gevonden</div>

  const defaultPreloadFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  return (
    <div className="space-y-6 min-w-0 overflow-hidden">
      {/* Back nav */}
      <button
        onClick={() => navigate(`/tenant/${slug}/admin/connectors`)}
        className="text-text/50 text-sm hover:text-text transition-colors"
      >
        ← Terug naar connectors
      </button>

      {/* Resource header */}
      <div className="bg-bg-header rounded-xl p-6 border border-surface">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-text text-xl font-semibold">{resource.resource_name}</h2>
            <p className="text-text/50 text-sm mt-1">
              Resource: <code className="bg-surface px-1.5 py-0.5 rounded text-xs">{resource.resource_slug}</code>
              {' · '} Frequentie: {resource.sync_frequency}
              {' · '} Records: {resource.total_records}
            </p>
          </div>
          {resource.total_records > 0 ? (
            <span className="bg-green-500/20 text-green-400 px-3 py-1 rounded text-sm">Actief</span>
          ) : (
            <span className="bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded text-sm">Wacht op data</span>
          )}
        </div>

        {resource.last_synced_at && (
          <div className="text-text/50 text-sm">
            Laatste sync: {new Date(resource.last_synced_at).toLocaleString('nl-NL')}
          </div>
        )}
      </div>

      {/* Active ingestion progress bar */}
      {activeRun && (
        <IngestionProgressBar run={activeRun} onDismiss={() => setActiveRun(null)} />
      )}

      {/* Error message */}
      {previewError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <span className="text-red-400 text-sm">{previewError}</span>
          <button onClick={() => setPreviewError('')} className="ml-3 text-text/50 text-sm hover:text-text">✕</button>
        </div>
      )}

      {/* Actions */}
      <div className="bg-bg-header rounded-xl p-6 border border-surface">
        <h3 className="text-text font-semibold mb-4">Acties</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Preview */}
          <div className="bg-surface rounded-lg p-4">
            <h4 className="text-text text-sm font-medium mb-2">Preview ophalen</h4>
            <p className="text-text/50 text-xs mb-3">Haal 25 records op om velden en structuur te bekijken</p>
            <button
              onClick={fetchPreview}
              disabled={!!actionLoading || !!activeRun}
              className="bg-primary/10 text-primary px-3 py-1.5 rounded text-sm hover:bg-primary/20 transition-colors disabled:opacity-50 w-full"
            >
              {actionLoading === 'preview' ? 'Ophalen...' : 'Preview ophalen'}
            </button>
          </div>

          {/* Preload */}
          <div className="bg-surface rounded-lg p-4">
            <h4 className="text-text text-sm font-medium mb-2">Preload starten</h4>
            <p className="text-text/50 text-xs mb-3">Haal alle historische data op vanaf een startdatum</p>
            <input
              type="date"
              value={preloadFrom || defaultPreloadFrom}
              onChange={e => setPreloadFrom(e.target.value)}
              className="w-full bg-bg-dark border border-surface rounded px-2 py-1.5 text-text text-sm mb-2 focus:border-primary focus:outline-none"
            />
            <button
              onClick={startPreload}
              disabled={!!actionLoading || !!activeRun}
              className="bg-primary hover:bg-primary-hover text-white px-3 py-1.5 rounded text-sm transition-colors disabled:opacity-50 w-full"
            >
              {actionLoading === 'preload' ? 'Starten...' : 'Preload starten'}
            </button>
          </div>

          {/* Manual sync */}
          <div className="bg-surface rounded-lg p-4">
            <h4 className="text-text text-sm font-medium mb-2">Handmatige sync</h4>
            <p className="text-text/50 text-xs mb-3">Haal nieuwe data op sinds de laatste sync</p>
            <button
              onClick={startSync}
              disabled={resource.total_records === 0 || !!actionLoading || !!activeRun}
              className={`px-3 py-1.5 rounded text-sm w-full transition-colors ${
                resource.total_records === 0
                  ? 'bg-surface text-text/50 cursor-not-allowed'
                  : 'bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50'
              }`}
            >
              {actionLoading === 'sync' ? 'Starten...' : resource.total_records === 0 ? 'Sync (eerst preload nodig)' : 'Sync nu'}
            </button>
          </div>
        </div>
      </div>

      {/* Preview data table */}
      {resource.preview_data && resource.preview_data.length > 0 && (
        <div className="bg-bg-header rounded-xl p-6 border border-surface min-w-0 overflow-hidden">
          <h3 className="text-text font-semibold mb-4">
            Preview Data
            <span className="text-text/50 font-normal text-sm ml-2">
              (eerste {resource.preview_data.length} van {resource.preview_record_count} records)
            </span>
            {selectedColumn && (
              <button
                onClick={() => setSelectedColumn(null)}
                className="ml-3 text-text/40 text-xs hover:text-text"
              >
                ✕ Sluit kolom-info
              </button>
            )}
          </h3>
          <div className="flex gap-4 min-w-0">
            {/* Table with horizontal scroll */}
            <div className={`${selectedColumn ? 'flex-1' : 'w-full'} min-w-0`}>
              <div className="overflow-x-auto overflow-y-auto max-h-[500px] border border-surface rounded-lg scrollbar-thin">
                <table className="text-xs" style={{ width: 'max-content' }}>
                  <thead className="sticky top-0 bg-surface z-10">
                    <tr className="text-left text-text/60">
                      {Object.keys(resource.preview_data[0]).map(key => (
                        <th
                          key={key}
                          onClick={() => setSelectedColumn(selectedColumn === key ? null : key)}
                          className={`px-3 py-2 font-medium whitespace-nowrap cursor-pointer hover:bg-primary/10 transition-colors border-b border-surface ${
                            selectedColumn === key ? 'bg-primary/15 text-primary' : ''
                          }`}
                        >
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resource.preview_data.map((row, i) => (
                      <tr key={i} className="border-b border-surface/20 hover:bg-surface/30">
                        {Object.entries(row).map(([key, val]) => (
                          <td
                            key={key}
                            className={`px-3 py-1.5 text-text/70 whitespace-nowrap max-w-[250px] truncate ${
                              selectedColumn === key ? 'bg-primary/5' : ''
                            }`}
                          >
                            {typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-text/30 text-[10px] mt-1">← Scroll horizontaal voor meer kolommen →</p>
            </div>

            {/* Column stats card */}
            {selectedColumn && (
              <ColumnStatsCard
                columnName={selectedColumn}
                resourceId={resource.id}
                token={token}
                tenantSlug={slug!}
                fieldType={resource.preview_fields?.find(f => f.name === selectedColumn)?.type}
              />
            )}
          </div>
        </div>
      )}

      {/* Field/column overview */}
      {resource.preview_fields && resource.preview_fields.length > 0 && (
        <div className="bg-bg-header rounded-xl p-6 border border-surface">
          <h3 className="text-text font-semibold mb-4">
            Velden ({resource.preview_fields.length})
            {resource.preview_record_count != null && (
              <span className="text-text/50 font-normal text-sm ml-2">
                (gebaseerd op {resource.preview_record_count} beschikbare records)
              </span>
            )}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text/60 border-b border-surface">
                  <th className="pb-2 pr-4">Veldnaam</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Beschrijving</th>
                </tr>
              </thead>
              <tbody>
                {resource.preview_fields.map((field, i) => (
                  <tr key={i} className="border-b border-surface/30">
                    <td className="py-2 pr-4">
                      <code className="text-primary text-xs bg-primary/5 px-1.5 py-0.5 rounded">{field.name}</code>
                    </td>
                    <td className="py-2 pr-4">
                      <TypeBadge type={field.type} />
                    </td>
                    <td className="py-2 pr-4 text-text/40 text-xs">
                      {inferDescription(field.name)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No preview yet */}
      {(!resource.preview_fields || resource.preview_fields.length === 0) && (
        <div className="bg-bg-header rounded-xl p-6 border border-surface">
          <h3 className="text-text font-semibold mb-4">Velden</h3>
          <div className="bg-surface rounded-lg p-8 text-center">
            <span className="text-text/40">
              Klik op "Preview ophalen" om de velden en structuur van deze resource te bekijken
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

interface ColumnStats {
  total: number
  filled: number
  null_count: number
  unique_count: number
  min?: number
  max?: number
  avg?: number
  min_length?: number
  max_length?: number
  avg_length?: number
  top_values?: [string, number][]
  inferred_type?: string
}

function ColumnStatsCard({ columnName, resourceId, token, tenantSlug, fieldType }: {
  columnName: string
  resourceId: number
  token: string | null | undefined
  tenantSlug: string
  fieldType?: string
}) {
  const [stats, setStats] = useState<ColumnStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadStats()
  }, [columnName])

  async function loadStats() {
    setLoading(true)
    setError('')
    try {
      const result = await api.get(
        `/api/warehouse/resources/${resourceId}/column-stats/?column=${encodeURIComponent(columnName)}`,
        token, tenantSlug
      )
      setStats(result)
    } catch (e) {
      setError((e as Error).message || 'Kon stats niet laden')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-72 shrink-0 bg-surface rounded-lg p-4 border border-surface max-h-[500px] overflow-y-auto scrollbar-thin">
      <h4 className="text-text font-semibold text-sm mb-1 flex items-center gap-2">
        <code className="text-primary bg-primary/5 px-1.5 py-0.5 rounded">{columnName}</code>
      </h4>
      {fieldType && (
        <div className="mb-3">
          <TypeBadge type={fieldType} />
        </div>
      )}

      {loading && (
        <div className="text-text/40 text-xs py-4 text-center">Statistieken laden...</div>
      )}

      {error && (
        <div className="text-red-400 text-xs py-2">{error}</div>
      )}

      {stats && !loading && (
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-text/50">Records (totaal)</span>
            <span className="text-text font-medium">{stats.total.toLocaleString('nl-NL')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text/50">Gevuld</span>
            <span className="text-text">{stats.filled.toLocaleString('nl-NL')} ({stats.total > 0 ? Math.round(stats.filled / stats.total * 100) : 0}%)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text/50">Leeg/null</span>
            <span className="text-text">{stats.null_count.toLocaleString('nl-NL')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text/50">Unieke waarden</span>
            <span className="text-text">{stats.unique_count.toLocaleString('nl-NL')}</span>
          </div>

          {/* Numeric stats */}
          {stats.min !== undefined && (
            <>
              <div className="border-t border-bg-dark pt-2 mt-2">
                <span className="text-text/60 font-medium">Numeriek</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text/50">Min</span>
                <span className="text-text">{stats.min.toLocaleString('nl-NL')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text/50">Max</span>
                <span className="text-text">{stats.max!.toLocaleString('nl-NL')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text/50">Gemiddeld</span>
                <span className="text-text">{stats.avg!.toLocaleString('nl-NL', { maximumFractionDigits: 2 })}</span>
              </div>
            </>
          )}

          {/* String length stats */}
          {stats.min_length !== undefined && stats.min === undefined && (
            <>
              <div className="border-t border-bg-dark pt-2 mt-2">
                <span className="text-text/60 font-medium">Tekst lengte</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text/50">Min</span>
                <span className="text-text">{stats.min_length} chars</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text/50">Max</span>
                <span className="text-text">{stats.max_length} chars</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text/50">Gem.</span>
                <span className="text-text">{stats.avg_length} chars</span>
              </div>
            </>
          )}

          {/* Top values */}
          {stats.top_values && stats.top_values.length > 0 && (
            <>
              <div className="border-t border-bg-dark pt-2 mt-2">
                <span className="text-text/60 font-medium">Top waarden</span>
              </div>
              {stats.top_values.map(([val, count]) => (
                <div key={val} className="flex justify-between items-center">
                  <span className="text-text/70 truncate max-w-[150px]" title={val}>{val}</span>
                  <span className="text-text/40 text-[10px] ml-2 shrink-0">{count.toLocaleString('nl-NL')}×</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function IngestionProgressBar({ run, onDismiss }: { run: IngestionRun; onDismiss?: () => void }) {
  const isRunning = run.status === 'running'
  const elapsed = run.started_at
    ? Math.round((Date.now() - new Date(run.started_at).getTime()) / 1000)
    : 0

  const statusColors = {
    running: 'bg-primary',
    success: 'bg-green-500',
    partial: 'bg-yellow-500',
    failed: 'bg-red-500',
  }

  const statusLabels = {
    running: 'Bezig met ophalen...',
    success: 'Voltooid',
    partial: 'Gedeeltelijk voltooid',
    failed: 'Mislukt',
  }

  return (
    <div className="bg-bg-header rounded-xl p-5 border border-surface">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {isRunning && (
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          )}
          <div>
            <span className="text-text font-medium text-sm">{statusLabels[run.status]}</span>
            <span className="text-text/50 text-xs ml-2">
              ({run.run_type === 'preload' ? 'Preload' : run.run_type === 'preview' ? 'Preview' : 'Sync'})
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-text/50 text-xs">
            {isRunning ? `${elapsed}s` : run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : ''}
          </span>
          {!isRunning && onDismiss && (
            <button onClick={onDismiss} className="text-text/30 hover:text-text/60 text-xs transition-colors">✕</button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-surface rounded-full overflow-hidden mb-3">
        {isRunning ? (
          <div className={`h-full ${statusColors[run.status]} rounded-full animate-pulse`} style={{ width: '60%' }} />
        ) : (
          <div className={`h-full ${statusColors[run.status]} rounded-full transition-all`} style={{ width: '100%' }} />
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 text-center">
        <div>
          <div className="text-text font-semibold text-lg">{run.records_fetched}</div>
          <div className="text-text/50 text-xs">Opgehaald</div>
        </div>
        <div>
          <div className="text-text font-semibold text-lg">{run.records_created}</div>
          <div className="text-text/50 text-xs">Nieuw</div>
        </div>
        <div>
          <div className="text-text font-semibold text-lg">{run.records_updated}</div>
          <div className="text-text/50 text-xs">Bijgewerkt</div>
        </div>
        <div>
          <div className="text-text font-semibold text-lg">{run.api_calls_made}</div>
          <div className="text-text/50 text-xs">API calls</div>
        </div>
      </div>

      {/* Error message */}
      {run.error_message && (
        <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded p-2">
          <span className="text-red-400 text-xs">{run.error_message}</span>
        </div>
      )}
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    string: 'bg-blue-500/15 text-blue-400',
    guid: 'bg-purple-500/15 text-purple-400',
    number: 'bg-green-500/15 text-green-400',
    integer: 'bg-green-500/15 text-green-400',
    date: 'bg-orange-500/15 text-orange-400',
    datetime: 'bg-orange-500/15 text-orange-400',
    boolean: 'bg-pink-500/15 text-pink-400',
    array: 'bg-cyan-500/15 text-cyan-400',
    object: 'bg-yellow-500/15 text-yellow-400',
  }
  const color = colors[type?.toLowerCase()] || 'bg-surface text-text/50'
  return (
    <span className={`${color} px-2 py-0.5 rounded text-xs`}>
      {type || 'unknown'}
    </span>
  )
}

function inferDescription(fieldName: string): string {
  const map: Record<string, string> = {
    guid: 'Unieke identifier',
    name: 'Naam',
    email: 'E-mailadres',
    startDate: 'Startdatum',
    endDate: 'Einddatum',
    statusName: 'Status label',
    statusId: 'Status ID',
    candidateGuid: 'Verwijzing naar kandidaat',
    candidateName: 'Naam kandidaat',
    employerGuid: 'Verwijzing naar werkgever',
    employerName: 'Naam werkgever',
    agencyGuid: 'Verwijzing naar bureau',
    lastUpdatedDateTimeUtc: 'Laatste wijziging (UTC)',
    createdDateTimeUtc: 'Aanmaakdatum (UTC)',
  }
  return map[fieldName] || ''
}
