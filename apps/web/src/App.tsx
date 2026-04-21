import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext.tsx'
import LoginPage from './pages/auth/LoginPage.tsx'
import RegisterPage from './pages/auth/RegisterPage.tsx'
import TwoFactorPage from './pages/auth/TwoFactorPage.tsx'
import DashboardLayout from './components/layout/DashboardLayout.tsx'
import LinksPage from './pages/dashboard/LinksPage.tsx'
import AnalyticsPage from './pages/dashboard/AnalyticsPage.tsx'
import SettingsPage from './pages/dashboard/SettingsPage.tsx'
import AdminLayout from './components/layout/AdminLayout.tsx'
import AdminUsersPage from './pages/admin/AdminUsersPage.tsx'
import AdminLinksPage from './pages/admin/AdminLinksPage.tsx'
import AdminSettingsPage from './pages/admin/AdminSettingsPage.tsx'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <div className="flex h-screen items-center justify-center">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <div className="flex h-screen items-center justify-center">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export default function App() {
  const { user, isLoading } = useAuth()

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/two-factor" element={<TwoFactorPage />} />

      {/* Dashboard */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<LinksPage />} />
        <Route path="links" element={<LinksPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      {/* Admin */}
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminLayout />
          </AdminRoute>
        }
      >
        <Route index element={<AdminUsersPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="links" element={<AdminLinksPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
      </Route>

      {/* Root redirect — wait for auth state before redirecting */}
      <Route
        path="/"
        element={
          isLoading
            ? <div className="flex h-screen items-center justify-center">Loading...</div>
            : <Navigate to={user ? '/dashboard' : '/login'} replace />
        }
      />
      <Route path="/404" element={<div className="flex h-screen items-center justify-center text-muted-foreground">Link not found or expired.</div>} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  )
}
