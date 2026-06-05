import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import ProtectedRoute from './components/ProtectedRoute'
import Landing from './pages/Landing'
import Login from './pages/Login'
import AppPicker from './pages/AppPicker'
import PlatformAdmin from './pages/platform-admin/PlatformAdmin'
import TenantAdmin from './pages/tenant-admin/TenantAdmin'
import FaamDashboard from './pages/demo-apps/faam-dashboard/FaamDashboard'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/apps" element={<ProtectedRoute><AppPicker /></ProtectedRoute>} />
          <Route path="/platform/*" element={<ProtectedRoute><PlatformAdmin /></ProtectedRoute>} />
          <Route path="/tenant/:slug/admin/*" element={<ProtectedRoute><TenantAdmin /></ProtectedRoute>} />
          <Route path="/tenant/:slug/app/:appSlug/*" element={<ProtectedRoute><FaamDashboard /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
