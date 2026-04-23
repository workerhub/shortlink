import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Users, Link2, Settings, ArrowLeft, Menu } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { Button } from '@/components/ui/button'

export default function AdminLayout() {
  const location = useLocation()
  const { t } = useTranslation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const navItems = [
    { to: '/admin/users', label: t('admin.users'), icon: Users },
    { to: '/admin/links', label: t('admin.allLinks'), icon: Link2 },
    { to: '/admin/settings', label: t('nav.settings'), icon: Settings },
  ]

  const sidebarContent = (
    <>
      <div className="p-4 border-b flex items-center gap-2">
        <img src="/logo.svg" alt="" className="h-6 w-6 shrink-0" />
        <span className="font-bold text-lg">{t('admin.adminPanel')}</span>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            onClick={() => setMobileOpen(false)}
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
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('nav.backToDashboard')}
        </Link>
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-background">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          'flex flex-col w-60 border-r bg-background',
          'fixed inset-y-0 left-0 z-50 transition-transform md:relative md:z-auto md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {sidebarContent}
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b shrink-0">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-bold text-lg">{t('admin.adminPanel')}</span>
        </div>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
