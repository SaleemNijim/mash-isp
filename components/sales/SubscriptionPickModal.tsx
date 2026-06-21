'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface SubscriptionPickModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

interface SubRow {
  id: string
  customer_id: string
  type: 'bb' | 'we'
  price: number | null
  end_date: string | null
  customers: { name: string; phone: string | null } | null
}

export function SubscriptionPickModal({
  open,
  onClose,
  onSuccess,
}: SubscriptionPickModalProps) {
  const router = useRouter()
  const { data: tenant } = useTenant()
  const supabase = createClient()
  const [search, setSearch] = useState('')

  const { data: rows = [], isLoading } = useQuery<SubRow[]>({
    queryKey: ['sales-subscription-pick', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return []
      const { data, error } = await supabase
        .from('subscriptions')
        .select('id, customer_id, type, price, end_date, customers(name, phone)')
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
        .order('end_date', { ascending: true })
        .limit(300)
      if (error) throw error
      return (data ?? []).map((row) => {
        const c = row.customers as
          | { name: string; phone: string | null }
          | { name: string; phone: string | null }[]
          | null
        const customers = Array.isArray(c) ? c[0] ?? null : c
        return { ...row, customers } as SubRow
      })
    },
    enabled: open && !!tenant?.id,
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const name = r.customers?.name?.toLowerCase() ?? ''
      const phone = r.customers?.phone ?? ''
      return name.includes(q) || phone.includes(q)
    })
  }, [rows, search])

  function pickSubscription(id: string) {
    onClose()
    onSuccess()
    router.push(`/subscriptions/renew/${id}`)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>اختر اشتراكاً للتجديد</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search
            size={16}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الهاتف..."
            className="pr-9"
            dir="rtl"
          />
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1 min-h-[200px]">
          {isLoading && (
            <p className="text-sm text-muted-foreground text-center py-8">جارٍ التحميل...</p>
          )}
          {!isLoading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">لا توجد اشتراكات</p>
          )}
          {filtered.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => pickSubscription(row.id)}
              className="w-full rounded-lg border border-border px-3 py-2.5 text-right hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">{row.customers?.name ?? '—'}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {row.type.toUpperCase()} — ينتهي {row.end_date ?? '—'}
                {row.customers?.phone ? ` — ${row.customers.phone}` : ''}
              </p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
