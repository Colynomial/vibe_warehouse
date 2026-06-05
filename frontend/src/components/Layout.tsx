import { type ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useNavigate, useLocation } from 'react-router-dom'

interface LayoutProps {
  title: string
  children: ReactNode
  sidebar?: { label: string; path: string; icon: string }[]
}

export default function Layout({ title, children, sidebar }: LayoutProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div className="h-screen w-screen overflow-hidden bg-bg-dark flex">
      {/* Sidebar */}
      {sidebar && (
        <aside className="w-64 bg-bg-header border-r border-surface p-4 flex flex-col">
          <h2 className="text-primary font-bold text-lg mb-6">{title}</h2>
          <nav className="flex-1 space-y-1">
            {sidebar.map((item) => {
              const isActive = location.pathname === item.path ||
                (item.path !== sidebar[0]?.path && location.pathname.startsWith(item.path))
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`w-full text-left px-3 py-2 rounded transition-colors ${
                    isActive
                      ? 'bg-primary/15 text-primary font-medium'
                      : 'text-text hover:bg-surface'
                  }`}
                >
                  <span className="mr-2">{item.icon}</span>
                  {item.label}
                </button>
              )
            })}
          </nav>
          <button
            onClick={() => navigate('/apps')}
            className="mt-4 text-sm text-text/60 hover:text-text transition-colors"
          >
            ← Terug naar apps
          </button>
        </aside>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="bg-bg-header border-b border-surface px-6 py-4 flex items-center justify-between">
          <h1 className="text-text font-semibold text-xl">{title}</h1>
          <div className="flex items-center gap-4">
            <span className="text-text/70 text-sm">{user?.email}</span>
            <button
              onClick={logout}
              className="text-sm text-primary hover:text-primary-hover transition-colors"
            >
              Uitloggen
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
