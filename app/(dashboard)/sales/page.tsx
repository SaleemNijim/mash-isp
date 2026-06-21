'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, ShoppingCart } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { usePermissions } from '@/hooks/usePermissions'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataPanel } from '@/components/shared/DataPanel'
import { NewSaleModal, type SaleSelection } from '@/components/sales/NewSaleModal'
import { RetailCardSaleModal } from '@/components/sales/RetailCardSaleModal'
import { SellToDistributorModal } from '@/components/card-sales/SellToDistributorModal'
import { SubscriptionPickModal } from '@/components/sales/SubscriptionPickModal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface TodaySaleRow {
  id: string
  kind: 'retail' | 'distributor' | 'renewal'
  label: string
  amount: number
  discountPercent?: number | null
  created_at: string
}

function todayStartISO(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function SalesPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { data: tenant } = useTenant()
  const role = usePermissions((s) => s.role)
  const userName = role === 'employee' ? 'كاشير' : 'مبيعات'

  const [newSaleOpen, setNewSaleOpen] = useState(false)
  const [retailSale, setRetailSale] = useState<Extract<SaleSelection, { type: 'retail' }> | null>(
    null,
  )
  const [distributorOpen, setDistributorOpen] = useState(false)
  const [renewalOpen, setRenewalOpen] = useState(false)

  const todayStart = todayStartISO()

  const { data: todaySales = [], refetch, isLoading } = useQuery<TodaySaleRow[]>({
    queryKey: ['sales-today', tenant?.id, todayStart],
    queryFn: async () => {
      if (!tenant?.id) return []

      const [retailRes, distRes, payRes] = await Promise.all([
        supabase
          .from('card_retail_sales')
          .select('id, total_amount, sale_type, discount_percent, created_at, card_products(name)')
          .eq('tenant_id', tenant.id)
          .eq('is_deleted', false)
          .gte('created_at', todayStart)
          .order('created_at', { ascending: false }),
        supabase
          .from('card_distributor_sales')
          .select('id, total_amount, distributor_name, created_at')
          .eq('tenant_id', tenant.id)
          .eq('is_deleted', false)
          .gte('created_at', todayStart)
          .order('created_at', { ascending: false }),
        supabase
          .from('payments')
          .select('id, amount, created_at, customers(name)')
          .eq('tenant_id', tenant.id)
          .eq('is_deleted', false)
          .gte('created_at', todayStart)
          .order('created_at', { ascending: false }),
      ])

      const rows: TodaySaleRow[] = []

      for (const r of retailRes.data ?? []) {
        const productRaw = r.card_products as { name?: string } | { name?: string }[] | null
        const product = Array.isArray(productRaw) ? productRaw[0] : productRaw
        rows.push({
          id: r.id,
          kind: 'retail',
          label: product?.name ? `بطاقة — ${product.name}` : 'بيع بطاقة',
          amount: Number(r.total_amount),
          discountPercent: r.discount_percent != null ? Number(r.discount_percent) : null,
          created_at: r.created_at,
        })
      }

      for (const d of distRes.data ?? []) {
        rows.push({
          id: d.id,
          kind: 'distributor',
          label: `موزع: ${d.distributor_name}`,
          amount: Number(d.total_amount ?? 0),
          created_at: d.created_at,
        })
      }

      for (const p of payRes.data ?? []) {
        const customerRaw = p.customers as { name?: string } | { name?: string }[] | null
        const customer = Array.isArray(customerRaw) ? customerRaw[0] : customerRaw
        rows.push({
          id: p.id,
          kind: 'renewal',
          label: `تجديد PPP — ${customer?.name ?? ''}`,
          amount: Number(p.amount),
          created_at: p.created_at,
        })
      }

      rows.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )

      return rows
    },
    enabled: !!tenant?.id,
    refetchInterval: 30_000,
  })

  const todayTotal = useMemo(
    () => todaySales.reduce((sum, s) => sum + s.amount, 0),
    [todaySales],
  )

  function handleSaleSelect(selection: SaleSelection) {
    if (selection.type === 'retail') setRetailSale(selection)
    else if (selection.type === 'distributor') setDistributorOpen(true)
    else if (selection.type === 'renewal') setRenewalOpen(true)
  }

  function handleSuccess() {
    void refetch()
    void queryClient.invalidateQueries({ queryKey: ['card-products-for-sale'] })
    void queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
  }

  const kindBadge = (kind: TodaySaleRow['kind']) => {
    if (kind === 'retail') return <Badge variant="secondary">بطاقات</Badge>
    if (kind === 'distributor') return <Badge variant="outline">موزع</Badge>
    return <Badge>PPP</Badge>
  }

  return (
    <div dir="rtl" className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="المبيعات"
        description={`واجهة ${userName} — تسجيل عمليات البيع اليومية`}
        actions={
          <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
            <RefreshCw size={14} />
            تحديث
          </Button>
        }
      />

      <div className="rounded-xl border border-mash-border bg-primary-50 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">إجمالي مبيعات اليوم</p>
            <p className="text-3xl font-bold tabular-nums text-primary mt-1">
              {todayTotal.toLocaleString('ar-EG')} ج.م
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {todaySales.length} عملية
            </p>
          </div>
          <Button
            size="lg"
            className="gap-2 h-12 px-6 text-base shadow-md"
            onClick={() => setNewSaleOpen(true)}
          >
            <Plus size={20} />
            إضافة عملية بيع
          </Button>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <ShoppingCart size={16} />
          سجل اليوم
        </h2>
        <DataPanel>
          {isLoading && (
            <p className="text-sm text-muted-foreground text-center py-10">جارٍ التحميل...</p>
          )}
          {!isLoading && todaySales.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10">
              لا توجد عمليات اليوم — اضغط «إضافة عملية بيع»
            </p>
          )}
          {todaySales.length > 0 && (
            <ul className="divide-y divide-border">
              {todaySales.map((sale) => (
                <li
                  key={`${sale.kind}-${sale.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/20"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {kindBadge(sale.kind)}
                    <span className="text-sm truncate">{sale.label}</span>
                  </div>
                  <div className="text-left shrink-0">
                    <p className="text-sm font-medium tabular-nums">
                      {sale.amount.toLocaleString('ar-EG')} ج.م
                    </p>
                    {sale.discountPercent != null && sale.discountPercent > 0 && (
                      <p className="text-xs text-emerald-700 tabular-nums">
                        خصم {sale.discountPercent.toLocaleString('ar-EG')}%
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">{formatTime(sale.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DataPanel>
      </div>

      <NewSaleModal
        open={newSaleOpen}
        onClose={() => setNewSaleOpen(false)}
        onSelect={handleSaleSelect}
      />

      <RetailCardSaleModal
        open={retailSale !== null}
        productId={retailSale?.productId ?? ''}
        productName={retailSale?.productName ?? ''}
        cardType={retailSale?.cardType ?? null}
        onClose={() => setRetailSale(null)}
        onSuccess={handleSuccess}
      />

      <SellToDistributorModal
        open={distributorOpen}
        onClose={() => setDistributorOpen(false)}
        onSuccess={handleSuccess}
      />

      <SubscriptionPickModal
        open={renewalOpen}
        onClose={() => setRenewalOpen(false)}
        onSuccess={handleSuccess}
      />
    </div>
  )
}
