import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function AppPicker() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  if (!user) return null

  const cards = [
    ...(user.is_platform_admin ? [{
      title: 'Platform Beheer',
      description: 'Beheer tenants, users, en platform configuratie',
      icon: '🏠',
      path: '/platform',
      color: 'border-primary',
    }] : []),
    ...user.tenants.map(t => ({
      title: `${t.name} Beheer`,
      description: `Tenant admin voor ${t.name}`,
      icon: '⚙️',
      path: `/tenant/${t.slug}/admin`,
      color: 'border-purple-400',
    })),
    ...user.tenants.map(t => ({
      title: `${t.name} Dashboard`,
      description: `Data dashboard voor ${t.name}`,
      icon: '📊',
      path: `/tenant/${t.slug}/app/dashboard`,
      color: 'border-indigo-400',
    })),
  ]

  return (
    <div className="min-h-screen bg-bg-dark">
      {/* Header */}
      <header className="bg-bg-header border-b border-surface px-6 py-4 flex items-center justify-between">
        <h1 className="text-text font-semibold text-xl">
          Vibe <span className="text-primary">Warehouse</span>
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-text/70 text-sm">{user.email}</span>
          <button onClick={logout} className="text-sm text-primary hover:text-primary-hover">
            Uitloggen
          </button>
        </div>
      </header>

      {/* App cards */}
      <main className="max-w-4xl mx-auto p-8">
        <h2 className="text-text text-2xl font-bold mb-6">Kies een app</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card) => (
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
      </main>
    </div>
  )
}
