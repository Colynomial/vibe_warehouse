import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { ReactNode } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from '../../components/Layout'
import { api } from '../../api/client'
import { useAuth } from '../../hooks/useAuth'

const sidebar = [
  { label: 'Dashboard', path: '/platform', icon: '📊' },
  { label: 'Tenants', path: '/platform/tenants', icon: '🏢' },
  { label: 'Users', path: '/platform/users', icon: '👥' },
  { label: 'Apps', path: '/platform/apps', icon: '🧩' },
  { label: 'Monitoring', path: '/platform/monitoring', icon: '📈' },
]

interface Tenant {
  id: number
  name: string
  slug: string
  schema_name: string
  is_active: boolean
  created_at: string
  users_count: number
}

interface Membership {
  id?: number
  tenant_id: number
  tenant_name?: string
  tenant_slug?: string
  tenant_role: 'admin' | 'dev' | 'user'
  is_active: boolean
}

interface PlatformUser {
  id: number
  email: string
  first_name: string
  last_name: string
  is_platform_admin: boolean
  is_active: boolean
  memberships: Membership[]
}

interface DemoApp {
  id: number
  tenant: number
  tenant_name: string
  tenant_slug: string
  slug: string
  name: string
  description: string
  is_active: boolean
  created_at: string
}

interface MonitoringSummary {
  requests: number
  avg_duration_ms: number
  errors: number
  success_rate: number
  ingestion_runs: number
  ingestion_running: number
  ingestion_failed: number
  ingestion_success: number
}

interface MonitoringBucket {
  bucket: string
  requests: number
  errors: number
  avg_duration_ms: number
}

interface MonitoringData {
  summary: MonitoringSummary
  series: MonitoringBucket[]
  top_endpoints: { endpoint: string; method: string; requests: number; avg_duration_ms: number }[]
  filters: {
    tenants: { id: number; name: string; slug: string }[]
    users: { id: number; email: string; first_name: string; last_name: string }[]
    apps: { id: number; name: string; slug: string; tenant_id: number; tenant__name: string }[]
  }
}

type TimeRange = '24h' | '7d' | '1y'

function DashboardPage() {
  const { token } = useAuth()
  const [summary, setSummary] = useState<MonitoringSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const data: MonitoringData = await api.get('/api/monitoring/overview/?range=24h', token)
        setSummary(data.summary)
      } finally {
        setLoading(false)
      }
    })()
  }, [token])

  return (
    <div className="bg-bg-header rounded-xl p-6 border border-surface">
      <h2 className="text-text text-xl font-semibold mb-4">Platform overzicht</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface rounded-lg p-4">
          <div className="text-text/60 text-sm">Requests (24u)</div>
          <div className="text-text text-2xl font-bold">{loading ? '...' : summary?.requests ?? 0}</div>
        </div>
        <div className="bg-surface rounded-lg p-4">
          <div className="text-text/60 text-sm">Avg. response</div>
          <div className="text-text text-2xl font-bold">{loading ? '...' : `${Math.round(summary?.avg_duration_ms ?? 0)} ms`}</div>
        </div>
        <div className="bg-surface rounded-lg p-4">
          <div className="text-text/60 text-sm">Errors (24u)</div>
          <div className="text-text text-2xl font-bold">{loading ? '...' : summary?.errors ?? 0}</div>
        </div>
      </div>
    </div>
  )
}

function TenantsPage() {
  const { token } = useAuth()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Tenant | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', is_active: true })

  const load = async () => {
    const data = await api.get('/api/tenants/platform/tenants/', token)
    setTenants(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [token])

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', slug: '', is_active: true })
    setShowModal(true)
  }

  const openEdit = (tenant: Tenant) => {
    setEditing(tenant)
    setForm({ name: tenant.name, slug: tenant.slug, is_active: tenant.is_active })
    setShowModal(true)
  }

  const saveTenant = async (e: FormEvent) => {
    e.preventDefault()
    if (editing) {
      await api.patch(`/api/tenants/platform/tenants/${editing.id}/`, form, token)
    } else {
      await api.post('/api/tenants/platform/tenants/', form, token)
    }
    setShowModal(false)
    await load()
  }

  return (
    <div className="bg-bg-header rounded-xl p-6 border border-surface">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-text text-xl font-semibold">Tenants</h2>
        <button onClick={openCreate} className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg text-sm transition-colors">
          Nieuwe tenant
        </button>
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-left text-text/60 text-sm border-b border-surface">
            <th className="pb-2">Naam</th>
            <th className="pb-2">Slug</th>
            <th className="pb-2">Status</th>
            <th className="pb-2">Users</th>
            <th className="pb-2">Aangemaakt</th>
            <th className="pb-2"></th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td className="py-3 text-text/60" colSpan={6}>Laden...</td></tr>
          ) : tenants.map((tenant) => (
            <tr key={tenant.id} className="border-b border-surface/50">
              <td className="py-3 text-text font-medium">{tenant.name}</td>
              <td className="py-3 text-text/70">{tenant.slug}</td>
              <td className="py-3">
                <span className={`px-2 py-0.5 rounded text-xs ${tenant.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  {tenant.is_active ? 'Actief' : 'Inactief'}
                </span>
              </td>
              <td className="py-3 text-text/60 text-sm">{tenant.users_count}</td>
              <td className="py-3 text-text/50 text-sm">{new Date(tenant.created_at).toLocaleDateString('nl-NL')}</td>
              <td className="py-3 text-right">
                <button onClick={() => openEdit(tenant)} className="text-primary text-sm hover:underline">Bewerken</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <Modal title={editing ? 'Tenant bewerken' : 'Nieuwe tenant'} onClose={() => setShowModal(false)}>
          <form onSubmit={saveTenant} className="space-y-3">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Naam" className="w-full bg-surface border border-surface rounded px-3 py-2 text-text" required />
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })} placeholder="slug" className="w-full bg-surface border border-surface rounded px-3 py-2 text-text" required />
            <label className="flex items-center gap-2 text-text/80 text-sm">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Actief
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="px-3 py-2 rounded bg-surface text-text/70">Annuleren</button>
              <button type="submit" className="px-3 py-2 rounded bg-primary text-white">Opslaan</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function UsersPage() {
  const { token } = useAuth()
  const [users, setUsers] = useState<PlatformUser[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<PlatformUser | null>(null)
  const [form, setForm] = useState({
    email: '', first_name: '', last_name: '', password: '',
    is_platform_admin: false, is_active: true,
  })
  const [rights, setRights] = useState<Record<number, { enabled: boolean; role: 'admin' | 'dev' | 'user'; active: boolean }>>({})

  const load = async () => {
    const [usersData, tenantsData] = await Promise.all([
      api.get('/api/auth/platform/users/', token),
      api.get('/api/tenants/platform/tenants/', token),
    ])
    setUsers(usersData)
    setTenants(tenantsData)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [token])

  const initializeRights = (memberships: Membership[] = []) => {
    const next: Record<number, { enabled: boolean; role: 'admin' | 'dev' | 'user'; active: boolean }> = {}
    tenants.forEach((t) => {
      const m = memberships.find((x) => x.tenant_id === t.id)
      next[t.id] = { enabled: !!m, role: (m?.tenant_role || 'user') as 'admin' | 'dev' | 'user', active: m?.is_active ?? true }
    })
    setRights(next)
  }

  const openCreate = () => {
    setEditingUser(null)
    setForm({ email: '', first_name: '', last_name: '', password: '', is_platform_admin: false, is_active: true })
    initializeRights([])
    setShowModal(true)
  }

  const openEdit = (user: PlatformUser) => {
    setEditingUser(user)
    setForm({
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      password: '',
      is_platform_admin: user.is_platform_admin,
      is_active: user.is_active,
    })
    initializeRights(user.memberships)
    setShowModal(true)
  }

  const saveUser = async (e: FormEvent) => {
    e.preventDefault()
    const memberships = Object.entries(rights)
      .filter(([, value]) => value.enabled)
      .map(([tenantId, value]) => ({
        tenant_id: Number(tenantId),
        tenant_role: value.role,
        is_active: value.active,
      }))

    const payload: Record<string, unknown> = {
      email: form.email,
      first_name: form.first_name,
      last_name: form.last_name,
      is_platform_admin: form.is_platform_admin,
      is_active: form.is_active,
      memberships,
    }
    if (form.password) payload.password = form.password

    if (editingUser) {
      await api.patch(`/api/auth/platform/users/${editingUser.id}/`, payload, token)
    } else {
      if (!form.password) {
        alert('Password is verplicht bij nieuwe users.')
        return
      }
      await api.post('/api/auth/platform/users/', payload, token)
    }

    setShowModal(false)
    await load()
  }

  const deleteUser = async (user: PlatformUser) => {
    if (!confirm(`User ${user.email} verwijderen?`)) return
    await api.delete(`/api/auth/platform/users/${user.id}/`, token)
    await load()
  }

  return (
    <div className="bg-bg-header rounded-xl p-6 border border-surface">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-text text-xl font-semibold">Platform users</h2>
        <button onClick={openCreate} className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg text-sm transition-colors">
          User toevoegen
        </button>
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-left text-text/60 text-sm border-b border-surface">
            <th className="pb-2">Email</th>
            <th className="pb-2">Naam</th>
            <th className="pb-2">Platform admin</th>
            <th className="pb-2">Tenants</th>
            <th className="pb-2"></th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td className="py-3 text-text/60" colSpan={5}>Laden...</td></tr>
          ) : users.map((user) => (
            <tr key={user.id} className="border-b border-surface/50 align-top">
              <td className="py-3 text-text">{user.email}</td>
              <td className="py-3 text-text/70">{`${user.first_name} ${user.last_name}`.trim() || '-'}</td>
              <td className="py-3">
                <span className={`px-2 py-0.5 rounded text-xs ${user.is_platform_admin ? 'bg-primary/20 text-primary' : 'bg-surface text-text/60'}`}>
                  {user.is_platform_admin ? 'Ja' : 'Nee'}
                </span>
              </td>
              <td className="py-3 text-text/50 text-sm">
                <div className="flex gap-1 flex-wrap">
                  {user.memberships.map((m) => (
                    <span key={`${user.id}-${m.tenant_id}`} className={`px-2 py-0.5 rounded text-xs ${m.is_active ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                      {m.tenant_name} ({m.tenant_role})
                    </span>
                  ))}
                </div>
              </td>
              <td className="py-3 text-right">
                <button onClick={() => openEdit(user)} className="text-primary text-sm hover:underline mr-3">Bewerken</button>
                <button onClick={() => deleteUser(user)} className="text-red-400 text-sm hover:underline">Verwijderen</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <Modal title={editingUser ? 'User bewerken' : 'User toevoegen'} onClose={() => setShowModal(false)} wide>
          <form onSubmit={saveUser} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" type="email" className="w-full bg-surface border border-surface rounded px-3 py-2 text-text" required />
              <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editingUser ? 'Nieuw wachtwoord (optioneel)' : 'Wachtwoord'} type="password" className="w-full bg-surface border border-surface rounded px-3 py-2 text-text" />
              <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} placeholder="Voornaam" className="w-full bg-surface border border-surface rounded px-3 py-2 text-text" />
              <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} placeholder="Achternaam" className="w-full bg-surface border border-surface rounded px-3 py-2 text-text" />
            </div>
            <div className="flex gap-6 text-sm text-text/80">
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_platform_admin} onChange={(e) => setForm({ ...form, is_platform_admin: e.target.checked })} /> Platform admin</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Actief</label>
            </div>

            <div className="border border-surface rounded-lg p-3 bg-bg-dark">
              <div className="text-text font-medium mb-2">Tenantrechten</div>
              <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-thin pr-2">
                {tenants.map((tenant) => {
                  const value = rights[tenant.id] || { enabled: false, role: 'user' as const, active: true }
                  return (
                    <div key={tenant.id} className="grid grid-cols-[1.3fr_0.8fr_0.8fr] gap-2 items-center text-sm">
                      <label className="flex items-center gap-2 text-text/80">
                        <input
                          type="checkbox"
                          checked={value.enabled}
                          onChange={(e) => setRights({ ...rights, [tenant.id]: { ...value, enabled: e.target.checked } })}
                        />
                        {tenant.name}
                      </label>
                      <select
                        disabled={!value.enabled}
                        value={value.role}
                        onChange={(e) => setRights({ ...rights, [tenant.id]: { ...value, role: e.target.value as 'admin' | 'dev' | 'user' } })}
                        className="bg-surface border border-surface rounded px-2 py-1 text-text disabled:opacity-50"
                      >
                        <option value="admin">admin</option>
                        <option value="dev">dev</option>
                        <option value="user">user</option>
                      </select>
                      <label className="flex items-center gap-2 text-text/70">
                        <input
                          type="checkbox"
                          disabled={!value.enabled}
                          checked={value.active}
                          onChange={(e) => setRights({ ...rights, [tenant.id]: { ...value, active: e.target.checked } })}
                        /> actief
                      </label>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="px-3 py-2 rounded bg-surface text-text/70">Annuleren</button>
              <button type="submit" className="px-3 py-2 rounded bg-primary text-white">Opslaan</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function AppsPage() {
  const { token } = useAuth()
  const [apps, setApps] = useState<DemoApp[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<DemoApp | null>(null)
  const [form, setForm] = useState({ tenant: 0, slug: '', name: '', description: '', is_active: true })

  const load = async () => {
    const [appsData, tenantsData] = await Promise.all([
      api.get('/api/tenants/platform/apps/', token),
      api.get('/api/tenants/platform/tenants/', token),
    ])
    setApps(appsData)
    setTenants(tenantsData)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [token])

  const openCreate = () => {
    const defaultTenant = tenants[0]?.id || 0
    setEditing(null)
    setForm({ tenant: defaultTenant, slug: '', name: '', description: '', is_active: true })
    setShowModal(true)
  }

  const openEdit = (appItem: DemoApp) => {
    setEditing(appItem)
    setForm({
      tenant: appItem.tenant,
      slug: appItem.slug,
      name: appItem.name,
      description: appItem.description || '',
      is_active: appItem.is_active,
    })
    setShowModal(true)
  }

  const saveApp = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.tenant) return
    if (editing) {
      await api.patch(`/api/tenants/platform/apps/${editing.id}/`, form, token)
    } else {
      await api.post('/api/tenants/platform/apps/', form, token)
    }
    setShowModal(false)
    await load()
  }

  const deleteApp = async (appItem: DemoApp) => {
    if (!confirm(`App ${appItem.name} verwijderen?`)) return
    await api.delete(`/api/tenants/platform/apps/${appItem.id}/`, token)
    await load()
  }

  return (
    <div className="bg-bg-header rounded-xl p-6 border border-surface">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-text text-xl font-semibold">Apps</h2>
        <button onClick={openCreate} className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg text-sm transition-colors">
          App toevoegen
        </button>
      </div>

      <table className="w-full">
        <thead>
          <tr className="text-left text-text/60 text-sm border-b border-surface">
            <th className="pb-2">Naam</th>
            <th className="pb-2">Slug</th>
            <th className="pb-2">Tenant</th>
            <th className="pb-2">Status</th>
            <th className="pb-2"></th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td className="py-3 text-text/60" colSpan={5}>Laden...</td></tr>
          ) : apps.map((appItem) => (
            <tr key={appItem.id} className="border-b border-surface/50">
              <td className="py-3 text-text">{appItem.name}</td>
              <td className="py-3 text-text/70">{appItem.slug}</td>
              <td className="py-3 text-text/70">{appItem.tenant_name}</td>
              <td className="py-3">
                <span className={`px-2 py-0.5 rounded text-xs ${appItem.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  {appItem.is_active ? 'Actief' : 'Inactief'}
                </span>
              </td>
              <td className="py-3 text-right">
                <button onClick={() => openEdit(appItem)} className="text-primary text-sm hover:underline mr-3">Bewerken</button>
                <button onClick={() => deleteApp(appItem)} className="text-red-400 text-sm hover:underline">Verwijderen</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <Modal title={editing ? 'App bewerken' : 'App toevoegen'} onClose={() => setShowModal(false)}>
          <form onSubmit={saveApp} className="space-y-3">
            <select value={form.tenant} onChange={(e) => setForm({ ...form, tenant: Number(e.target.value) })} className="w-full bg-surface border border-surface rounded px-3 py-2 text-text" required>
              {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
            </select>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="App naam" className="w-full bg-surface border border-surface rounded px-3 py-2 text-text" required />
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })} placeholder="app-slug" className="w-full bg-surface border border-surface rounded px-3 py-2 text-text" required />
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Beschrijving" className="w-full bg-surface border border-surface rounded px-3 py-2 text-text" rows={3} />
            <label className="flex items-center gap-2 text-text/80 text-sm">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Actief
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="px-3 py-2 rounded bg-surface text-text/70">Annuleren</button>
              <button type="submit" className="px-3 py-2 rounded bg-primary text-white">Opslaan</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function MonitoringPage() {
  const { token } = useAuth()
  const [range, setRange] = useState<TimeRange>('24h')
  const [tenantId, setTenantId] = useState('')
  const [userId, setUserId] = useState('')
  const [appId, setAppId] = useState('')
  const [data, setData] = useState<MonitoringData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const params = new URLSearchParams({ range })
    if (tenantId) params.set('tenant_id', tenantId)
    if (userId) params.set('user_id', userId)
    if (appId) params.set('app_id', appId)
    const response = await api.get(`/api/monitoring/overview/?${params.toString()}`, token)
    setData(response)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [token, range, tenantId, userId, appId])

  const maxRequests = useMemo(() => {
    if (!data?.series?.length) return 1
    return Math.max(...data.series.map((x) => x.requests), 1)
  }, [data])

  const yTicks = useMemo(() => {
    const max = maxRequests
    return [max, Math.round(max * 0.66), Math.round(max * 0.33), 0]
  }, [maxRequests])

  const xLabelStep = useMemo(() => {
    const len = data?.series?.length || 0
    if (len <= 8) return 1
    if (len <= 16) return 2
    if (len <= 32) return 4
    return Math.ceil(len / 8)
  }, [data])

  return (
    <div className="bg-bg-header rounded-xl p-6 border border-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-text text-xl font-semibold">Monitoring</h2>
        <div className="flex gap-2">
          {(['24h', '7d', '1y'] as TimeRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded text-sm ${range === r ? 'bg-primary text-white' : 'bg-surface text-text/70 hover:text-text'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="bg-surface border border-surface rounded px-3 py-2 text-text">
          <option value="">Alle tenants</option>
          {data?.filters.tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
          ))}
        </select>
        <select value={userId} onChange={(e) => setUserId(e.target.value)} className="bg-surface border border-surface rounded px-3 py-2 text-text">
          <option value="">Alle users</option>
          {data?.filters.users.map((user) => (
            <option key={user.id} value={user.id}>{user.email}</option>
          ))}
        </select>
        <select value={appId} onChange={(e) => setAppId(e.target.value)} className="bg-surface border border-surface rounded px-3 py-2 text-text">
          <option value="">Alle apps</option>
          {data?.filters.apps.map((app) => (
            <option key={app.id} value={app.id}>{app.name} ({app.tenant__name})</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-surface rounded-lg p-4">
          <div className="text-text/60 text-sm">Requests</div>
          <div className="text-text text-2xl font-bold">{loading ? '...' : data?.summary.requests ?? 0}</div>
        </div>
        <div className="bg-surface rounded-lg p-4">
          <div className="text-text/60 text-sm">Gem. responstijd</div>
          <div className="text-text text-2xl font-bold">{loading ? '...' : `${Math.round(data?.summary.avg_duration_ms ?? 0)} ms`}</div>
        </div>
        <div className="bg-surface rounded-lg p-4">
          <div className="text-text/60 text-sm">Errors</div>
          <div className="text-text text-2xl font-bold">{loading ? '...' : data?.summary.errors ?? 0}</div>
        </div>
        <div className="bg-surface rounded-lg p-4">
          <div className="text-text/60 text-sm">Ingestion runs</div>
          <div className="text-text text-2xl font-bold">{loading ? '...' : data?.summary.ingestion_runs ?? 0}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <div className="xl:col-span-2 bg-surface rounded-lg p-4 border border-surface">
          <div className="text-text font-medium mb-3">Requests per interval</div>
          <div className="grid grid-cols-[40px_1fr] gap-3">
            <div className="h-52 flex flex-col justify-between text-[10px] text-text/40">
              {yTicks.map((tick, idx) => (
                <span key={`${tick}-${idx}`} className="leading-none">{tick}</span>
              ))}
            </div>
            <div>
              <div className="h-52 flex items-end gap-1">
                {(data?.series || []).map((point) => (
                  <div key={point.bucket} className="flex-1 flex flex-col justify-end items-center gap-1 min-w-[6px]">
                    <div
                      className="w-full bg-primary/70 rounded-t"
                      style={{ height: `${Math.max(4, (point.requests / maxRequests) * 180)}px` }}
                      title={`${point.requests} requests`}
                    />
                    {point.errors > 0 && (
                      <div
                        className="w-full bg-red-500/50 rounded-t"
                        style={{ height: `${Math.max(2, (point.errors / Math.max(1, maxRequests)) * 50)}px` }}
                        title={`${point.errors} errors`}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-1">
                {(data?.series || []).map((point, idx) => (
                  <div key={`${point.bucket}-label`} className="flex-1 text-[10px] text-text/35 text-center truncate">
                    {idx % xLabelStep === 0 ? new Date(point.bucket).toLocaleDateString('nl-NL', range === '24h' ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit' }) : ''}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="text-xs text-text/40 mt-2">Y-as: aantal requests, X-as: tijd. Blauw: requests, Rood: errors (&gt;0)</div>
        </div>

        <div className="bg-surface rounded-lg p-4 border border-surface">
          <div className="text-text font-medium mb-3">Ingestion status</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-text/70"><span>Success</span><span>{data?.summary.ingestion_success ?? 0}</span></div>
            <div className="flex justify-between text-text/70"><span>Running</span><span>{data?.summary.ingestion_running ?? 0}</span></div>
            <div className="flex justify-between text-text/70"><span>Failed</span><span>{data?.summary.ingestion_failed ?? 0}</span></div>
            <div className="flex justify-between text-text/70"><span>Success rate</span><span>{data?.summary.success_rate ?? 100}%</span></div>
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-lg p-4 border border-surface">
        <div className="text-text font-medium mb-3">Top endpoints</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text/60 border-b border-surface">
              <th className="pb-2">Endpoint</th>
              <th className="pb-2">Method</th>
              <th className="pb-2">Requests</th>
              <th className="pb-2">Avg ms</th>
            </tr>
          </thead>
          <tbody>
            {(data?.top_endpoints || []).map((row) => (
              <tr key={`${row.method}-${row.endpoint}`} className="border-b border-surface/40">
                <td className="py-2 text-text/80">{row.endpoint}</td>
                <td className="py-2 text-text/70">{row.method}</td>
                <td className="py-2 text-text">{row.requests}</td>
                <td className="py-2 text-text">{Math.round(row.avg_duration_ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-bg-header border border-surface rounded-xl p-5 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-text font-semibold">{title}</h3>
          <button onClick={onClose} className="text-text/50 hover:text-text">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function PlatformAdmin() {
  const { user } = useAuth()

  if (!user?.is_platform_admin) {
    return (
      <Layout title="Platform Beheer" sidebar={sidebar}>
        <div className="bg-bg-header rounded-xl p-6 border border-surface text-text/80">
          Je hebt geen rechten om platform beheer te openen.
        </div>
      </Layout>
    )
  }

  return (
    <Layout title="Platform Beheer" sidebar={sidebar}>
      <Routes>
        <Route index element={<DashboardPage />} />
        <Route path="tenants" element={<TenantsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="apps" element={<AppsPage />} />
        <Route path="monitoring" element={<MonitoringPage />} />
      </Routes>
    </Layout>
  )
}
