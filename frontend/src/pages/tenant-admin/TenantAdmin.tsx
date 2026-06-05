import { useParams, Routes, Route, useNavigate as useNav } from 'react-router-dom'
import Layout from '../../components/Layout'
import ConnectorsPage from './pages/ConnectorsPage'
import ResourcesPage from './pages/ResourcesPage'
import ResourceDetailPage from './pages/ResourceDetailPage'
import PipelinePage from './pages/PipelinePage'

export default function TenantAdmin() {
  const { slug } = useParams()
  const tenantName = slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : ''

  const sidebar = [
    { label: 'Overzicht', path: `/tenant/${slug}/admin`, icon: '📋' },
    { label: 'Users', path: `/tenant/${slug}/admin/users`, icon: '👥' },
    { label: 'Connectors', path: `/tenant/${slug}/admin/connectors`, icon: '🔌' },
    { label: 'Resources', path: `/tenant/${slug}/admin/resources`, icon: '📦' },
    { label: 'Data Pipeline', path: `/tenant/${slug}/admin/pipeline`, icon: '🔀' },
    { label: 'Audit Log', path: `/tenant/${slug}/admin/audit`, icon: '📜' },
    { label: 'Gebruik', path: `/tenant/${slug}/admin/usage`, icon: '📈' },
  ]

  return (
    <Layout title={`${tenantName} Beheer`} sidebar={sidebar}>
      <Routes>
        <Route index element={<OverviewPage tenantName={tenantName} />} />
        <Route path="users" element={<UsersPage tenantName={tenantName} />} />
        <Route path="connectors" element={<ConnectorsPage />} />
        <Route path="connectors/:connectorId/resources/:resourceSlug" element={<ResourceDetailPage />} />
        <Route path="resources" element={<ResourcesPage />} />
        <Route path="resources/:resourceId" element={<ResourceDetailPage />} />
        <Route path="pipeline" element={<PipelinePage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="usage" element={<UsagePage />} />
      </Routes>
    </Layout>
  )
}

function OverviewPage({ tenantName }: { tenantName: string }) {
  const { slug } = useParams()
  const navigate = useNav()
  return (
    <div className="space-y-6">
      <div className="bg-bg-header rounded-xl p-6 border border-surface">
        <h2 className="text-text text-xl font-semibold mb-4">{tenantName} overzicht</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-surface rounded-lg p-4">
            <div className="text-text/60 text-sm">Users</div>
            <div className="text-text text-2xl font-bold">1</div>
          </div>
          <div className="bg-surface rounded-lg p-4">
            <div className="text-text/60 text-sm">Connectors</div>
            <div className="text-text text-2xl font-bold">1</div>
          </div>
          <div className="bg-surface rounded-lg p-4">
            <div className="text-text/60 text-sm">Actieve resources</div>
            <div className="text-text text-2xl font-bold">3</div>
          </div>
          <div className="bg-surface rounded-lg p-4">
            <div className="text-text/60 text-sm">Materialized views</div>
            <div className="text-text text-2xl font-bold">0</div>
          </div>
        </div>
      </div>
      <div className="bg-bg-header rounded-xl p-6 border border-surface">
        <h3 className="text-text font-semibold mb-3">Snelle acties</h3>
        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/tenant/${slug}/admin/connectors`)}
            className="bg-primary/10 text-primary px-4 py-2 rounded-lg text-sm hover:bg-primary/20 transition-colors"
          >
            Connectors beheren
          </button>
          <button
            onClick={() => navigate(`/tenant/${slug}/admin/pipeline`)}
            className="bg-primary/10 text-primary px-4 py-2 rounded-lg text-sm hover:bg-primary/20 transition-colors"
          >
            View aanmaken
          </button>
        </div>
      </div>
    </div>
  )
}

function UsersPage({ tenantName }: { tenantName: string }) {
  return (
    <div className="bg-bg-header rounded-xl p-6 border border-surface">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-text text-xl font-semibold">{tenantName} users</h2>
        <button className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg text-sm transition-colors">
          User uitnodigen
        </button>
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-left text-text/60 text-sm border-b border-surface">
            <th className="pb-2">Email</th>
            <th className="pb-2">Rol</th>
            <th className="pb-2">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-surface/50">
            <td className="py-3 text-text">colin@colynomial.com</td>
            <td className="py-3"><span className="bg-primary/20 text-primary px-2 py-0.5 rounded text-xs">Admin</span></td>
            <td className="py-3"><span className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded text-xs">Actief</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function AuditPage() {
  return (
    <div className="bg-bg-header rounded-xl p-6 border border-surface">
      <h2 className="text-text text-xl font-semibold mb-4">Audit Log</h2>
      <div className="bg-surface rounded-lg p-8 text-center">
        <span className="text-text/40">Nog geen activiteit geregistreerd</span>
      </div>
    </div>
  )
}

function UsagePage() {
  return (
    <div className="bg-bg-header rounded-xl p-6 border border-surface">
      <h2 className="text-text text-xl font-semibold mb-4">Gebruik</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-surface rounded-lg p-4">
          <div className="text-text/60 text-sm">API calls (deze maand)</div>
          <div className="text-text text-2xl font-bold">0</div>
        </div>
        <div className="bg-surface rounded-lg p-4">
          <div className="text-text/60 text-sm">Records opgeslagen</div>
          <div className="text-text text-2xl font-bold">0</div>
        </div>
        <div className="bg-surface rounded-lg p-4">
          <div className="text-text/60 text-sm">Ingestion runs</div>
          <div className="text-text text-2xl font-bold">0</div>
        </div>
      </div>
      <div className="bg-surface rounded-lg p-8 text-center">
        <span className="text-text/40">Gedetailleerd verbruik verschijnt hier zodra het systeem actief is</span>
      </div>
    </div>
  )
}
