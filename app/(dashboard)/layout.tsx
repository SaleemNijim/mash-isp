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
  SlidersHorizontal, Trash2, ScrollText,
  type LucideIcon,
} from 'lucide-react'
import { TenantBrand } from '@/components/shared/TenantBrand'
import {
  getNavForRole,
  isDashboardNavActive,
  type DashboardNavIcon,
} from '@/lib/navigation'
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
import { fetchPendingInbox } from '@/lib/pending-tasks/inbox'

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
  SlidersHorizontal,
  Trash2,
  ScrollText,
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
    queryKey: ['pending-inbox-count', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return 0
      const items = await fetchPendingInbox(supabase, tenant.id)
      return items.length
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
          fixed top-0 right-0 z-30 h-full bg-white text-mash-text-secondary
          border-l border-[#D1E8E2] flex flex-col shadow-[2px_0_20px_rgba(15,110,86,0.04)]
          transition-[width,transform] duration-200 ease-out
          ${sidebarWidth}
          lg:translate-x-0
          ${mobileOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        `}
      >
        <div className={`flex items-center h-14 px-3 border-b border-[#D1E8E2] shrink-0 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {collapsed ? (
            <TenantBrand
              name={tenant?.name ?? 'MASH'}
              logoUrl={tenant?.logo_url}
              collapsed
            />
          ) : (
            <TenantBrand
              name={tenant?.name ?? 'MASH ISP'}
              logoUrl={tenant?.logo_url}
              subtitle={isCashier ? 'كاشير' : undefined}
            />
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
              flex items-center gap-2.5 px-3 min-h-9 rounded-xl text-[13px] font-medium transition-colors mb-0.5
              ${active
                ? 'bg-[#E8F5F1] text-[#0F6E56] font-bold shadow-sm'
                : available
                  ? 'text-mash-text-secondary hover:bg-[#F8FFFE] hover:text-[#0D1F1A]'
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

        <div className="shrink-0 border-t border-[#D1E8E2] p-2 space-y-1">
          {!collapsed && tenant && !tenant.logo_url && (
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
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-[#D1E8E2] bg-white/90 px-4 backdrop-blur-xl">
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
