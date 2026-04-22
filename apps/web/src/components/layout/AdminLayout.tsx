import { Link, Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Users, Link2, Settings, ArrowLeft } from 'lucide-react'
import { useTranslation } from '@/i18n'

export default function AdminLayout() {
  const location = useLocation()
  const { t } = useTranslation()

  const navItems = [
    { to: '/admin/users', label: t('admin.users'), icon: Users },
    { to: '/admin/links', label: t('admin.allLinks'), icon: Link2 },
    { to: '/admin/settings', label: t('nav.settings'), icon: Settings },
  ]

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-60 border-r flex flex-col">
        <div className="p-4 border-b flex items-center gap-2">
          <img src="/logo.svg" alt="" className="h-6 w-6 shrink-0" />
          <span className="font-bold text-lg">{t('admin.adminPanel')}</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                location.pathname === to
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t">
          <Link
            to="/dashboard"
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('nav.backToDashboard')}
          </Link>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
