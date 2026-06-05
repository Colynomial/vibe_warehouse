import { Routes, Route } from 'react-router-dom'
import Layout from '../../components/Layout'

const sidebar = [
  { label: 'Dashboard', path: '/platform', icon: '📊' },
  { label: 'Tenants', path: '/platform/tenants', icon: '🏢' },
  { label: 'Users', path: '/platform/users', icon: '👥' },
  { label: 'Connector Types', path: '/platform/connector-types', icon: '🔌' },
  { label: 'Monitoring', path: '/platform/monitoring', icon: '📈' },
]

function DashboardPage() {
  return (
    <div className="bg-bg-header rounded-xl p-6 border border-surface">
      <h2 className="text-text text-xl font-semibold mb-4">Platform overzicht</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface rounded-lg p-4">
          <div className="text-text/60 text-sm">Actieve tenants</div>
          <div className="text-text text-2xl font-bold">1</div>
        </div>
        <div className="bg-surface rounded-lg p-4">
          <div className="text-text/60 text-sm">Totaal users</div>
          <div className="text-text text-2xl font-bold">1</div>
        </div>
        <div className="bg-surface rounded-lg p-4">
          <div className="text-text/60 text-sm">API calls (vandaag)</div>
          <div className="text-text text-2xl font-bold">0</div>
        </div>
      </div>
    </div>
  )
}

function TenantsPage() {
  return (
    <div className="bg-bg-header rounded-xl p-6 border border-surface">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-text text-xl font-semibold">Tenants</h2>
        <button className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg text-sm transition-colors">
          Nieuwe tenant
        </button>
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-left text-text/60 text-sm border-b border-surface">
            <th className="pb-2">Naam</th>
            <th className="pb-2">Slug</th>
            <th className="pb-2">Status</th>
            <th className="pb-2">Aangemaakt</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-surface/50">
            <td className="py-3 text-text font-medium">Faam</td>
            <td className="py-3 text-text/70">faam</td>
            <td className="py-3"><span className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded text-xs">Actief</span></td>
            <td className="py-3 text-text/50 text-sm">2026-06-01</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function UsersPage() {
  return (
    <div className="bg-bg-header rounded-xl p-6 border border-surface">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-text text-xl font-semibold">Platform users</h2>
        <button className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg text-sm transition-colors">
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
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-surface/50">
            <td className="py-3 text-text">colin@colynomial.com</td>
            <td className="py-3 text-text/70">Colin van Garderen</td>
            <td className="py-3"><span className="bg-primary/20 text-primary px-2 py-0.5 rounded text-xs">Ja</span></td>
            <td className="py-3 text-text/50 text-sm">Faam</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function ConnectorTypesPage() {
  return (
    <div className="bg-bg-header rounded-xl p-6 border border-surface">
      <h2 className="text-text text-xl font-semibold mb-4">Beschikbare connector types</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface rounded-lg p-5 border border-surface">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">🔗</span>
            <h3 className="text-text font-semibold">HelloFlex</h3>
          </div>
          <p className="text-text/60 text-sm mb-3">Uitzendbureau ERP: flexwerkers, contracten, urenstaten</p>
          <div className="flex gap-2 flex-wrap">
            <span className="bg-bg-dark text-text/60 px-2 py-0.5 rounded text-xs">OAuth2</span>
            <span className="bg-bg-dark text-text/60 px-2 py-0.5 rounded text-xs">6 resources</span>
            <span className="bg-bg-dark text-text/60 px-2 py-0.5 rounded text-xs">2 req/100ms</span>
          </div>
        </div>
        <div className="bg-surface rounded-lg p-5 border border-surface">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">📱</span>
            <h3 className="text-text font-semibold">Meta Ads</h3>
          </div>
          <p className="text-text/60 text-sm mb-3">Facebook/Instagram advertising: performance en demografie</p>
          <div className="flex gap-2 flex-wrap">
            <span className="bg-bg-dark text-text/60 px-2 py-0.5 rounded text-xs">Token</span>
            <span className="bg-bg-dark text-text/60 px-2 py-0.5 rounded text-xs">4 resources</span>
            <span className="bg-bg-dark text-text/60 px-2 py-0.5 rounded text-xs">200/uur</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function MonitoringPage() {
  return (
    <div className="bg-bg-header rounded-xl p-6 border border-surface">
      <h2 className="text-text text-xl font-semibold mb-4">Monitoring</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-surface rounded-lg p-4">
          <div className="text-text/60 text-sm">Requests (24u)</div>
          <div className="text-text text-2xl font-bold">0</div>
        </div>
        <div className="bg-surface rounded-lg p-4">
          <div className="text-text/60 text-sm">Gem. responstijd</div>
          <div className="text-text text-2xl font-bold">0 ms</div>
        </div>
        <div className="bg-surface rounded-lg p-4">
          <div className="text-text/60 text-sm">Errors (24u)</div>
          <div className="text-text text-2xl font-bold">0</div>
        </div>
        <div className="bg-surface rounded-lg p-4">
          <div className="text-text/60 text-sm">Ingestion runs (24u)</div>
          <div className="text-text text-2xl font-bold">0</div>
        </div>
      </div>
      <div className="bg-surface rounded-lg p-6 text-center">
        <span className="text-text/40">Recente API logs verschijnen hier zodra het systeem actief is</span>
      </div>
    </div>
  )
}

export default function PlatformAdmin() {
  return (
    <Layout title="Platform Beheer" sidebar={sidebar}>
      <Routes>
        <Route index element={<DashboardPage />} />
        <Route path="tenants" element={<TenantsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="connector-types" element={<ConnectorTypesPage />} />
        <Route path="monitoring" element={<MonitoringPage />} />
      </Routes>
    </Layout>
  )
}
