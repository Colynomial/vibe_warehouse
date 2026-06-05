import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Landing() {
  const navigate = useNavigate()
  const { user } = useAuth()

  if (user) {
    navigate('/apps', { replace: true })
    return null
  }

  return (
    <div className="min-h-screen bg-bg-dark flex flex-col items-center justify-center">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-text mb-4">
          Vibe <span className="text-primary">Warehouse</span>
        </h1>
        <p className="text-text/70 text-lg mb-8 max-w-md">
          Data platform voor het MKB. Jouw data, jouw dashboards, jouw apps.
        </p>
        <button
          onClick={() => navigate('/login')}
          className="bg-primary hover:bg-primary-hover text-white font-semibold px-8 py-3 rounded-lg transition-colors text-lg"
        >
          Inloggen
        </button>
      </div>
    </div>
  )
}
