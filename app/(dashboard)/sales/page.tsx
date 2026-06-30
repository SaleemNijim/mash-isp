'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarDays, Pencil, Plus, RefreshCw, ShoppingCart } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { usePermissions } from '@/hooks/usePermissions'
import { fetchSalesInRange, paymentMethodLabel, type SaleRow } from '@/lib/sales/fetch-sales'
import {
  dayEndISO,
  dayStartISO,
  formatDateLabel,
  todayDateStr,
  todayStartISO,
} from '@/lib/sales/date-range'
import { formatAmount } from '@/lib/format-money'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataPanel } from '@/components/shared/DataPanel'
import { NewSaleModal, type SaleSelection } from '@/components/sales/NewSaleModal'
import { RetailCardSaleModal } from '@/components/sales/RetailCardSaleModal'
import { SellToDistributorModal } from '@/components/card-sales/SellToDistributorModal'
import { SubscriptionPickModal } from '@/components/sales/SubscriptionPickModal'
import { EditRetailSaleModal, type RetailSaleEditTarget } from '@/components/sales/EditRetailSaleModal'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function yesterdayDateStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function kindBadge(kind: SaleRow['kind']) {
  if (kind === 'retail') return <Badge variant="secondary">بطاقات</Badge>
  if (kind === 'distributor') return <Badge variant="outline">موزع</Badge>
  if (kind === 'new') return <Badge variant="default">اشتراك جديد</Badge>
  return <Badge>تجديد</Badge>
}

function canEditSale(sale: SaleRow): boolean {
  if (sale.kind === 'retail') return !!sale.retailEdit
  if (sale.kind === 'distributor') return true
  return !!sale.customerId
}

function SalesLogList({
  sales,
  isLoading,
  emptyMessage,
  onEdit,
}: {
  sales: SaleRow[]
  isLoading: boolean
  emptyMessage: string
  onEdit?: (sale: SaleRow) => void
}) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground text-center py-10">جارٍ التحميل...</p>
  }
  if (sales.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-10">{emptyMessage}</p>
  }
  return (
    <ul className="divide-y divide-border">
      {sales.map((sale) => (
        <li
          key={`${sale.kind}-${sale.id}`}
          className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/20"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {kindBadge(sale.kind)}
            <div className="min-w-0">
              <span className="text-sm truncate block">{sale.label}</span>
              {sale.paymentMethod && (
                <span className="text-xs text-muted-foreground">
                  {paymentMethodLabel(sale.paymentMethod)}
                  {sale.debtorName ? ` — ${sale.debtorName}` : ''}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onEdit && canEditSale(sale) && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onEdit(sale)}
                title="تعديل"
              >
                <Pencil size={14} />
              </Button>
            )}
            <div className="text-left">
              <p className="text-sm font-medium tabular-nums">
                {formatAmount(sale.amount)}
              </p>
              {sale.discountPercent != null && sale.discountPercent > 0 && (
                <p className="text-xs text-mash-success-text tabular-nums">
                  خصم {sale.discountPercent.toLocaleString('ar-EG')}%
                </p>
              )}
              <p className="text-xs text-muted-foreground">{formatTime(sale.created_at)}</p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

export default function SalesPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const router = useRouter()
  const { data: tenant } = useTenant()
  const role = usePermissions((s) => s.role)
  const userName = role === 'employee' ? 'كاشير' : 'مبيعات'

  const [newSaleOpen, setNewSaleOpen] = useState(false)
  const [retailSale, setRetailSale] = useState<Extract<SaleSelection, { type: 'retail' }> | null>(
    null,
  )
  const [distributorOpen, setDistributorOpen] = useState(false)
  const [renewalOpen, setRenewalOpen] = useState(false)
  const [historyDate, setHistoryDate] = useState(yesterdayDateStr)
  const [editRetail, setEditRetail] = useState<RetailSaleEditTarget | null>(null)
  const [voidDistributor, setVoidDistributor] = useState<{ id: string; label: string } | null>(null)

  const todayStart = todayStartISO()
  const todayEnd = dayEndISO(todayDateStr())

  const { data: todaySales = [], refetch, isLoading } = useQuery<SaleRow[]>({
    queryKey: ['sales-today', tenant?.id, todayStart],
    queryFn: async () => {
      if (!tenant?.id) return []
      return fetchSalesInRange(supabase, tenant.id, todayStart, todayEnd)
    },
    enabled: !!tenant?.id,
    refetchInterval: 30_000,
  })

  const {
    data: historySales = [],
    isLoading: historyLoading,
    refetch: refetchHistory,
  } = useQuery<SaleRow[]>({
    queryKey: ['sales-history', tenant?.id, historyDate],
    queryFn: async () => {
      if (!tenant?.id) return []
      return fetchSalesInRange(
        supabase,
        tenant.id,
        dayStartISO(historyDate),
        dayEndISO(historyDate),
      )
    },
    enabled: !!tenant?.id && !!historyDate,
  })

  const todayTotal = useMemo(
    () => todaySales.reduce((sum, s) => sum + s.amount, 0),
    [todaySales],
  )

  const historyTotal = useMemo(
    () => historySales.reduce((sum, s) => sum + s.amount, 0),
    [historySales],
  )

  function handleSaleSelect(selection: SaleSelection) {
    if (selection.type === 'retail') setRetailSale(selection)
    else if (selection.type === 'distributor') setDistributorOpen(true)
    else if (selection.type === 'renewal') setRenewalOpen(true)
  }

  function handleSuccess() {
    void refetch()
    void refetchHistory()
    void queryClient.invalidateQueries({ queryKey: ['card-products-for-sale'] })
    void queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
    void queryClient.invalidateQueries({ queryKey: ['debts-customers'] })
    void queryClient.invalidateQueries({ queryKey: ['pending-inbox'] })
  }

  function handleEdit(sale: SaleRow) {
    if (sale.kind === 'retail') {
      if (!sale.retailEdit) return
      setEditRetail({
        id: sale.id,
        label: sale.label,
        quantity: sale.retailEdit.quantity,
        unitPrice: sale.retailEdit.unitPrice,
        method: sale.retailEdit.method,
        notes: sale.retailEdit.notes,
        customerId: sale.retailEdit.customerId,
        contactLabel: sale.retailEdit.contactLabel,
        contactPhone: sale.retailEdit.contactPhone,
        dueAt: sale.retailEdit.dueAt,
      })
      return
    }

    if (sale.kind === 'distributor') {
      setVoidDistributor({ id: sale.id, label: sale.label })
      return
    }

    // اشتراك جديد / تجديد — التعديل عبر صفحة اشتراك المشترك
    if (sale.customerId) {
      router.push(`/subscriptions/customer/${sale.customerId}`)
    } else {
      toast.error('تعذّر فتح سجل المشترك لهذا الاشتراك')
    }
  }

  async function handleVoidDistributor() {
    if (!voidDistributor) return
    const { error } = await supabase.rpc('void_distributor_sale', {
      p_sale_id: voidDistributor.id,
      p_nonce: crypto.randomUUID(),
    })
    if (error) throw error
    toast.success('تم إلغاء بيع الموزع')
    handleSuccess()
  }

  function handleRefresh() {
    void refetch()
    void refetchHistory()
  }

  return (
    <div dir="rtl" className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="المبيعات"
        description={`واجهة ${userName} — تسجيل عمليات البيع اليومية`}
        actions={
          <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-1.5">
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
              {formatAmount(todayTotal)}
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
          <SalesLogList
            sales={todaySales}
            isLoading={isLoading}
            emptyMessage="لا توجد عمليات اليوم — اضغط «إضافة عملية بيع»"
            onEdit={handleEdit}
          />
        </DataPanel>
      </div>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <CalendarDays size={16} />
            سجل المبيعات
          </h2>
          <div className="flex items-center gap-2">
            <Label htmlFor="sales-history-date" className="text-sm text-muted-foreground shrink-0">
              فلترة باليوم
            </Label>
            <Input
              id="sales-history-date"
              type="date"
              value={historyDate}
              max={todayDateStr()}
              onChange={(e) => setHistoryDate(e.target.value)}
              className="w-auto"
              dir="ltr"
            />
          </div>
        </div>
        <DataPanel>
          <div className="px-4 py-3 border-b border-border bg-muted/20">
            <p className="text-sm font-medium">{formatDateLabel(historyDate)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {historyLoading
                ? 'جارٍ الحساب...'
                : `${formatAmount(historyTotal)} — ${historySales.length} عملية`}
            </p>
          </div>
          <SalesLogList
            sales={historySales}
            isLoading={historyLoading}
            emptyMessage="لا توجد عمليات بيع في هذا اليوم"
            onEdit={handleEdit}
          />
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

      <EditRetailSaleModal
        open={editRetail !== null}
        sale={editRetail}
        onClose={() => setEditRetail(null)}
        onSuccess={handleSuccess}
      />

      <DeleteConfirmModal
        open={voidDistributor !== null}
        onClose={() => setVoidDistributor(null)}
        onConfirm={handleVoidDistributor}
        recordName={voidDistributor?.label ?? 'بيع الموزع'}
        title="تأكيد إلغاء بيع الموزع"
        confirmKeyword="إلغاء"
        confirmLabel="تأكيد الإلغاء"
        consequences="سيُسترجَع المخزون ويُعكَس رصيد الموزع أو الحساب البنكي. لتصحيح البيع أعد تسجيله من «إضافة عملية بيع». لا يمكن التراجع."
      />
    </div>
  )
}
