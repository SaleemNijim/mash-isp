'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { Toaster } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { MessageNotificationBell } from '@/components/messages/MessageNotificationBell'

const NAV = [
  { href: '/super-admin/tenants', label: 'الشركات' },
  { href: '/super-admin/invoices', label: 'الفواتير' },
  { href: '/super-admin/plans', label: 'الأسعار' },
  { href: '/super-admin/messages', label: 'الرسائل' },
]

function SuperAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-mash-page" dir="rtl">
      <div className="w-full bg-primary-900 text-white text-sm font-medium text-center py-2 px-4">
        وضع Super Admin — أنت تتحكم بكل العملاء
      </div>

      <header className="sticky top-0 z-10 bg-mash-surface border-b border-mash-border">
        <div className="mx-auto max-w-6xl px-8 h-14 flex items-center gap-4">
          <span className="font-medium text-mash-text shrink-0">MASH — Super Admin</span>
          <nav className="flex items-center gap-1 flex-1">
            {NAV.map(({ href, label }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-3 py-2 min-h-9 rounded-md text-sm font-medium transition-colors inline-flex items-center ${
                    active
                      ? 'bg-primary-50 text-primary-800'
                      : 'text-mash-text-secondary hover:bg-mash-page'
                  }`}
                >
                  {label}
                </Link>
              )
            })}
          </nav>
          <MessageNotificationBell href="/super-admin/messages" />
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-mash-text-secondary hover:text-mash-text min-h-9"
            onClick={() => void handleLogout()}
          >
            <LogOut size={16} />
            تسجيل الخروج
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4 lg:p-6">{children}</main>
      <Toaster richColors position="top-center" dir="rtl" />
    </div>
  )
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 60_000 } },
})

export function SuperAdminLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuperAdminShell>{children}</SuperAdminShell>
    </QueryClientProvider>
  )
}
