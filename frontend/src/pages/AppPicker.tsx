import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { api } from '../api/client'

interface TenantApp {
  id?: number
  slug: string
  name: string
  description?: string
}

interface TenantAccess {
  id: number
  name: string
  slug: string
  role: string
  apps?: TenantApp[]
}

interface CurrentUser {
  id: number
  email: string
  is_platform_admin: boolean
  tenants: TenantAccess[]
}

export default function AppPicker() {
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()
  const [liveUser, setLiveUser] = useState<CurrentUser | null>(user as CurrentUser | null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!token) return
    api.get('/api/auth/me/', token)
      .then((data) => setLiveUser(data))
      .catch(() => setLiveUser(user as CurrentUser | null))
  }, [token, user])

  if (!liveUser) return null

  const cards = [
    ...(liveUser.is_platform_admin ? [{
      title: 'Platform Beheer',
      description: 'Beheer tenants, users, en platform configuratie',
      icon: '🏠',
      path: '/platform',
      color: 'border-primary',
    }] : []),
    ...liveUser.tenants
      .filter(t => t.role === 'admin')
      .map(t => ({
      title: `${t.name} Beheer`,
      description: `Tenant admin voor ${t.name}`,
      icon: '⚙️',
      path: `/tenant/${t.slug}/admin`,
      color: 'border-purple-400',
    })),
    ...liveUser.tenants.flatMap(t => {
      const apps = t.apps && t.apps.length > 0
        ? t.apps
        : [{ slug: 'dashboard', name: `${t.name} Dashboard`, description: `Data dashboard voor ${t.name}` }]
      return apps.map((app: TenantApp) => ({
        title: app.name,
        description: app.description || `Demo app voor ${t.name}`,
        icon: '📊',
        path: `/tenant/${t.slug}/app/${app.slug}`,
        color: 'border-indigo-400',
      }))
    }),
  ]

  const normalizedSearch = search.trim().toLowerCase()
  const filteredCards = normalizedSearch
    ? cards.filter((card) =>
        card.title.toLowerCase().includes(normalizedSearch) ||
        card.description.toLowerCase().includes(normalizedSearch)
      )
    : cards

  return (
    <div className="min-h-screen bg-bg-dark">
      {/* Header */}
      <header className="bg-bg-header border-b border-surface px-6 py-4 flex items-center justify-between">
        <h1 className="text-text font-semibold text-xl">
          Vibe <span className="text-primary">Warehouse</span>
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-text/70 text-sm">{liveUser.email}</span>
          <button onClick={logout} className="text-sm text-primary hover:text-primary-hover">
            Uitloggen
          </button>
        </div>
      </header>

      {/* App cards */}
      <main className="max-w-4xl mx-auto p-8">
        <h2 className="text-text text-2xl font-bold mb-4">Kies een app</h2>
        <div className="mb-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek op app of tenant..."
            className="w-full bg-bg-header border border-surface rounded-lg px-4 py-2 text-text placeholder:text-text/40 focus:outline-none focus:border-primary"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCards.map((card) => (
            <button
              key={card.path}
              onClick={() => navigate(card.path)}
              className={`bg-bg-header border-l-4 ${card.color} rounded-lg p-6 text-left hover:bg-surface transition-colors`}
            >
              <div className="text-3xl mb-3">{card.icon}</div>
              <h3 className="text-text font-semibold mb-1">{card.title}</h3>
              <p className="text-text/60 text-sm">{card.description}</p>
            </button>
          ))}
        </div>
        {filteredCards.length === 0 && (
          <div className="mt-6 text-text/50 text-sm">
            Geen apps gevonden voor "{search}".
          </div>
        )}
      </main>
    </div>
  )
}
