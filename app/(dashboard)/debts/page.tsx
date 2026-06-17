'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataPanel } from '@/components/shared/DataPanel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface CustomerDebt {
  id: string
  customer_id: string
  original_amount: number
  remaining_amount: number | null
  status: string
  reason: string | null
  created_at: string
  customers: { name: string; phone: string | null } | null
}

interface DistributorDebt {
  id: string
  name: string
  phone: string | null
  balance_due: number
}

const STATUS_LABELS: Record<string, string> = {
  active: 'نشط',
  temporary: 'مؤقت',
  paid: 'مسدّد',
  cancelled: 'ملغى',
}

export default function DebtsPage() {
  const supabase = createClient()
  const { data: tenant } = useTenant()

  const { data: customerDebts = [], isLoading, refetch } = useQuery<CustomerDebt[]>({
    queryKey: ['debts-customers', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return []
      const { data, error } = await supabase
        .from('debts')
        .select(
          'id, customer_id, original_amount, remaining_amount, status, reason, created_at, customers(name, phone)',
        )
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
        .in('status', ['active', 'temporary'])
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((row) => {
        const c = row.customers as
          | { name: string; phone: string | null }
          | { name: string; phone: string | null }[]
          | null
        const customers = Array.isArray(c) ? c[0] ?? null : c
        return { ...row, customers } as CustomerDebt
      })
    },
    enabled: !!tenant?.id,
  })

  const { data: distributorDebts = [] } = useQuery<DistributorDebt[]>({
    queryKey: ['debts-distributors', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return []
      const { data, error } = await supabase
        .from('distributors')
        .select('id, name, phone, balance_due')
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
        .gt('balance_due', 0)
        .order('balance_due', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!tenant?.id,
  })

  const customerTotal = useMemo(
    () =>
      customerDebts.reduce(
        (s, d) => s + Number(d.remaining_amount ?? d.original_amount),
        0,
      ),
    [customerDebts],
  )

  const distributorTotal = useMemo(
    () => distributorDebts.reduce((s, d) => s + Number(d.balance_due), 0),
    [distributorDebts],
  )

  return (
    <div dir="rtl" className="space-y-6">
      <PageHeader
        title="سجل الدائنين"
        description="مستحقات المشتركين والموزعين — من لم يُسدّد بعد"
        actions={
          <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
            <RefreshCw size={14} />
            تحديث
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <DataPanel className="p-4">
          <p className="text-sm text-muted-foreground">ديون مشتركين</p>
          <p className="text-2xl font-bold tabular-nums mt-1">
            {customerTotal.toLocaleString('ar-EG')} ج.م
          </p>
        </DataPanel>
        <DataPanel className="p-4">
          <p className="text-sm text-muted-foreground">مستحقات موزعين</p>
          <p className="text-2xl font-bold tabular-nums mt-1">
            {distributorTotal.toLocaleString('ar-EG')} ج.م
          </p>
        </DataPanel>
      </div>

      <Tabs defaultValue="customers">
        <TabsList>
          <TabsTrigger value="customers">مشتركون ({customerDebts.length})</TabsTrigger>
          <TabsTrigger value="distributors">موزعون ({distributorDebts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="mt-4">
          <DataPanel noPadding>
            {isLoading && (
              <p className="py-10 text-center text-sm text-muted-foreground">جارٍ التحميل...</p>
            )}
            {!isLoading && customerDebts.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">لا توجد ديون نشطة</p>
            )}
            {customerDebts.length > 0 && (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="px-4 py-2.5 text-right font-semibold">المشترك</th>
                    <th className="px-4 py-2.5 text-right font-semibold">المبلغ</th>
                    <th className="px-4 py-2.5 text-right font-semibold">الحالة</th>
                    <th className="px-4 py-2.5 text-right font-semibold">السبب</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {customerDebts.map((d) => (
                    <tr key={d.id} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{d.customers?.name ?? '—'}</p>
                        {d.customers?.phone && (
                          <p className="text-xs text-muted-foreground">{d.customers.phone}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums font-medium">
                        {Number(d.remaining_amount ?? d.original_amount).toLocaleString('ar-EG')} ج.م
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="secondary">{STATUS_LABELS[d.status] ?? d.status}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">
                        {d.reason ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </DataPanel>
        </TabsContent>

        <TabsContent value="distributors" className="mt-4">
          <DataPanel noPadding>
            {distributorDebts.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                لا مستحقات على الموزعين
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {distributorDebts.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/distributors/${d.id}`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-muted/20"
                    >
                      <div>
                        <p className="font-medium">{d.name}</p>
                        {d.phone && (
                          <p className="text-xs text-muted-foreground">{d.phone}</p>
                        )}
                      </div>
                      <span className="font-semibold tabular-nums text-amber-700">
                        {Number(d.balance_due).toLocaleString('ar-EG')} ج.م
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </DataPanel>
        </TabsContent>
      </Tabs>
    </div>
  )
}
