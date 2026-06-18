'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import {
  LayoutDashboard, Users, Wifi, CreditCard, Package,
  Network, DollarSign, FileText, FileSpreadsheet, Settings, Menu, X, ClipboardList,
  ShoppingCart, KeyRound, Landmark, LogOut, Truck, PanelLeftClose, PanelLeft, Mail,
  type LucideIcon,
} from 'lucide-react'
import {
  getNavForRole,
  isDashboardNavActive,
  type DashboardNavIcon,
} from '@/lib/navigation'
import { NetworkIndicator } from '@/components/offline/NetworkIndicator'
import { MessageNotificationBell } from '@/components/messages/MessageNotificationBell'
import { TrialBanner } from '@/components/trial/TrialBanner'
import { IdleTimeout } from '@/components/shared/IdleTimeout'
import { useRealtimeChannels } from '@/hooks/useRealtimeChannels'
import { useTenant } from '@/hooks/useTenant'
import { usePermissions } from '@/hooks/usePermissions'
import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { initSyncEngine, runSyncEngine } from '@/lib/sync/engine'

const NAV_ICONS: Record<DashboardNavIcon, LucideIcon> = {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Wifi,
  CreditCard,
  Package,
  Network,
  DollarSign,
  ClipboardList,
  FileText,
  FileSpreadsheet,
  Settings,
  KeyRound,
  Landmark,
  Truck,
  Mail,
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { collapsed, toggle, hydrated } = useSidebarCollapsed()
  const { data: tenant } = useTenant()
  const loadPermissions = usePermissions((s) => s.loadPermissions)
  const subscribePermissions = usePermissions((s) => s.subscribe)
  const role = usePermissions((s) => s.role)
  const hasPermission = usePermissions((s) => s.hasPermission)
  const isCashier = role === 'employee'

  useRealtimeChannels(tenant?.id ?? '')

  useEffect(() => {
    const cleanup = initSyncEngine()
    void runSyncEngine()
    return cleanup
  }, [])

  useEffect(() => {
    void loadPermissions()

    const supabase = createClient()
    let cancelled = false
    let unsubscribe: (() => void) | undefined

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!cancelled && user) {
        unsubscribe = subscribePermissions(user.id)
      }
    })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [loadPermissions, subscribePermissions])

  const supabase = createClient()
  const { data: pendingCount } = useQuery({
    queryKey: ['pending-tasks-count', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return 0
      const { count } = await supabase
        .from('pending_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .in('status', ['pending', 'reminded'])
      return count ?? 0
    },
    enabled: !!tenant?.id && !isCashier,
    refetchInterval: 60_000,
  })

  const navItems = getNavForRole(role, hasPermission)
  const sidebarWidth = collapsed ? 'w-16' : 'w-[220px]'
  const mainMargin = collapsed ? 'lg:mr-16' : 'lg:mr-[220px]'

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-mash-page" dir="rtl">
      <IdleTimeout />

      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={`
          fixed top-0 right-0 z-30 h-full bg-mash-surface text-mash-text-secondary
          border-l border-mash-border flex flex-col
          transition-[width,transform] duration-200 ease-out
          ${sidebarWidth}
          lg:translate-x-0
          ${mobileOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        `}
      >
        <div className={`flex items-center h-14 px-3 border-b border-mash-border shrink-0 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 rounded-md bg-primary-600 flex items-center justify-center shrink-0">
                <span className="text-white text-xs font-medium">M</span>
              </div>
              <span className="text-sm font-medium text-mash-text truncate">
                {isCashier ? 'MASH — كاشير' : 'MASH ISP'}
              </span>
            </div>
          )}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden text-mash-text-muted hover:text-mash-text min-h-11 min-w-11 inline-flex items-center justify-center"
            aria-label="إغلاق القائمة"
          >
            <X size={18} />
          </button>
          {hydrated && (
            <button
              onClick={toggle}
              className={`hidden lg:inline-flex items-center justify-center min-h-9 min-w-9 rounded-md text-mash-text-muted hover:bg-mash-page hover:text-mash-text ${collapsed ? '' : ''}`}
              aria-label={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
            >
              {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {navItems.map(({ href, label, icon, available, pendingBadge }) => {
            const Icon = NAV_ICONS[icon]
            const active = isDashboardNavActive(pathname, href)
            const itemClass = `
              flex items-center gap-2.5 px-3 min-h-9 rounded-md text-[13px] font-medium transition-colors mb-0.5
              ${active
                ? 'bg-primary-50 text-primary-800'
                : available
                  ? 'text-mash-text-secondary hover:bg-mash-page'
                  : 'text-mash-text-muted/50 cursor-not-allowed'
              }
              ${collapsed ? 'justify-center px-2' : ''}
            `

            if (!available) {
              return (
                <div
                  key={href}
                  className={itemClass}
                  aria-disabled="true"
                  title={collapsed ? label : 'قريباً'}
                >
                  <Icon size={17} className="shrink-0 opacity-60" />
                  {!collapsed && <span className="flex-1">{label}</span>}
                </div>
              )
            }

            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={itemClass}
                title={collapsed ? label : undefined}
              >
                <Icon size={17} className="shrink-0" />
                {!collapsed && <span className="flex-1">{label}</span>}
                {!collapsed && pendingBadge && pendingCount! > 0 && (
                  <Badge variant="destructive" className="text-[10px] h-4 px-1.5">
                    {pendingCount}
                  </Badge>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="shrink-0 border-t border-mash-border p-2 space-y-1">
          {!collapsed && tenant && (
            <p className="text-xs text-mash-text-muted truncate px-2 py-1">{tenant.name}</p>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={`w-full gap-2 text-mash-text-secondary hover:text-mash-text hover:bg-mash-page min-h-9 ${collapsed ? 'justify-center px-0' : 'justify-start'}`}
            onClick={() => void handleLogout()}
            title={collapsed ? 'تسجيل الخروج' : undefined}
          >
            <LogOut size={16} />
            {!collapsed && 'تسجيل الخروج'}
          </Button>
        </div>
      </aside>

      <div className={`${mainMargin} flex flex-col min-h-screen transition-[margin] duration-200 ease-out`}>
        <header className="sticky top-0 z-10 bg-mash-surface/95 border-b border-mash-border h-12 flex items-center gap-3 px-4">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden text-mash-text-muted hover:text-mash-text min-h-11 min-w-11 inline-flex items-center justify-center"
            aria-label="فتح القائمة"
          >
            <Menu size={20} />
          </button>
          <div className="flex-1" />
          <MessageNotificationBell href="/messages" />
        </header>

        <NetworkIndicator />
        {!isCashier && <TrialBanner />}

        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>

      <Toaster richColors position="top-center" dir="rtl" />
    </div>
  )
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 60_000 } },
})

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <DashboardShell>{children}</DashboardShell>
    </QueryClientProvider>
  )
}
