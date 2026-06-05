import { useParams, Routes, Route } from 'react-router-dom'
import Layout from '../../../components/Layout'

export default function FaamDashboard() {
  const { slug } = useParams()
  const tenantName = slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : ''

  const sidebar = [
    { label: 'Overzicht', path: `/tenant/${slug}/app/dashboard`, icon: '📊' },
    { label: 'Contracten', path: `/tenant/${slug}/app/dashboard/contracts`, icon: '📄' },
    { label: 'Medewerkers', path: `/tenant/${slug}/app/dashboard/candidates`, icon: '👥' },
    { label: 'Uren', path: `/tenant/${slug}/app/dashboard/timecards`, icon: '⏱️' },
  ]

  return (
    <Layout title={`${tenantName} Dashboard`} sidebar={sidebar}>
      <Routes>
        <Route index element={<OverviewPage />} />
        <Route path="contracts" element={<ContractsPage />} />
        <Route path="candidates" element={<CandidatesPage />} />
        <Route path="timecards" element={<TimecardsPage />} />
      </Routes>
    </Layout>
  )
}

function OverviewPage() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Actieve contracten" value="0" />
        <StatCard label="Medewerkers" value="0" />
        <StatCard label="Uren deze week" value="0" />
        <StatCard label="Openstaande facturen" value="0" />
      </div>

      <div className="bg-bg-header rounded-xl p-6 border border-surface">
        <h3 className="text-text font-semibold mb-4">Recente activiteit</h3>
        <div className="bg-surface rounded-lg p-8 text-center">
          <span className="text-text/40">Data verschijnt hier zodra de HelloFlex connector actief is en een preload is uitgevoerd</span>
        </div>
      </div>

      <div className="bg-bg-header rounded-xl p-6 border border-surface">
        <h3 className="text-text font-semibold mb-4">Status data pipeline</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <PipelineStatus name="Contracts" lastSync="Nog niet gesynchroniseerd" records={0} />
          <PipelineStatus name="Timecards" lastSync="Nog niet gesynchroniseerd" records={0} />
          <PipelineStatus name="Candidates" lastSync="Nog niet gesynchroniseerd" records={0} />
        </div>
      </div>
    </div>
  )
}

function ContractsPage() {
  return (
    <div className="bg-bg-header rounded-xl p-6 border border-surface">
      <h2 className="text-text text-xl font-semibold mb-4">Contracten</h2>
      <p className="text-text/50 text-sm mb-4">
        Overzicht van alle contracten uit HelloFlex. Maak een materialized view aan in Beheer → Data Pipeline om gefilterde data hier te tonen.
      </p>
      <div className="bg-surface rounded-lg p-8 text-center">
        <span className="text-text/40">Geen data beschikbaar. Start een preload via Beheer → Connectors.</span>
      </div>
    </div>
  )
}

function CandidatesPage() {
  return (
    <div className="bg-bg-header rounded-xl p-6 border border-surface">
      <h2 className="text-text text-xl font-semibold mb-4">Medewerkers</h2>
      <p className="text-text/50 text-sm mb-4">
        Alle flexwerkers/kandidaten uit HelloFlex.
      </p>
      <div className="bg-surface rounded-lg p-8 text-center">
        <span className="text-text/40">Geen data beschikbaar. Start een preload via Beheer → Connectors.</span>
      </div>
    </div>
  )
}

function TimecardsPage() {
  return (
    <div className="bg-bg-header rounded-xl p-6 border border-surface">
      <h2 className="text-text text-xl font-semibold mb-4">Urenstaten</h2>
      <p className="text-text/50 text-sm mb-4">
        Timecard registraties uit HelloFlex.
      </p>
      <div className="bg-surface rounded-lg p-8 text-center">
        <span className="text-text/40">Geen data beschikbaar. Start een preload via Beheer → Connectors.</span>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-header rounded-xl p-5 border border-surface">
      <div className="text-text/60 text-sm">{label}</div>
      <div className="text-text text-2xl font-bold mt-1">{value}</div>
    </div>
  )
}

function PipelineStatus({ name, lastSync, records }: { name: string; lastSync: string; records: number }) {
  return (
    <div className="bg-surface rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-text text-sm font-medium">{name}</span>
        <span className="text-text/40 text-xs">{records} records</span>
      </div>
      <div className="text-text/50 text-xs">{lastSync}</div>
    </div>
  )
}
