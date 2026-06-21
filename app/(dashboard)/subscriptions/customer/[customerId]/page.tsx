'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useDeleteConfirm } from '@/hooks/useDeleteConfirm'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import { SubscriptionPeriodEditForm } from '@/components/subscriptions/SubscriptionPeriodEditForm'
import { type SubscriptionPeriodRow } from '@/lib/subscriptions/types'
import { formatMoney } from '@/lib/format-money'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataPanel } from '@/components/shared/DataPanel'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'لم يُدفع'
  return new Date(iso).toLocaleString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isZeroAmount(n: number | null | undefined): boolean {
  return n == null || Number(n) === 0
}

export default function CustomerSubscriptionHistoryPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const supabase = createClient()
  const customerId = params.customerId as string
  const editId = searchParams.get('edit')

  const { open: deleteOpen, target, openModal, closeModal } = useDeleteConfirm()

  const { data: customer } = useQuery({
    queryKey: ['customer-header', customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone')
        .eq('id', customerId)
        .eq('is_deleted', false)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!customerId,
  })

  const { data: activeSubscription } = useQuery({
    queryKey: ['customer-active-subscription', customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('id, customer_id, type, speed, price, end_date')
        .eq('customer_id', customerId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!customerId,
  })

  const { data: periods = [], isLoading, refetch } = useQuery<SubscriptionPeriodRow[]>({
    queryKey: ['subscription-periods', customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_periods')
        .select('*')
        .eq('customer_id', customerId)
        .eq('is_deleted', false)
        .order('period_start', { ascending: false })
      if (error) throw error
      return (data ?? []) as SubscriptionPeriodRow[]
    },
    enabled: !!customerId,
  })

  const editPeriod = useMemo(
    () => periods.find((p) => p.id === editId) ?? null,
    [periods, editId],
  )

  const invalidate = () => {
    void refetch()
    void queryClient.invalidateQueries({ queryKey: ['subscription-periods'] })
    void queryClient.invalidateQueries({ queryKey: ['known-mac-addresses'] })
    void queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
    void queryClient.invalidateQueries({ queryKey: ['debts'] })
  }

  const handleDeleteConfirm = async () => {
    if (!target) return
    const res = await fetch('/api/delete/soft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: target.table, id: target.id }),
    })
    if (!res.ok) throw new Error('delete_failed')
    toast.success('تم حذف السجل')
    invalidate()
  }

  function openEdit(id: string) {
    router.push(`/subscriptions/customer/${customerId}?edit=${id}`)
  }

  function closeEdit() {
    router.push(`/subscriptions/customer/${customerId}`)
  }

  const thClass =
    'px-3 py-3 text-right border-b border-border font-semibold text-muted-foreground whitespace-nowrap'
  const tdClass = 'px-3 py-2.5 align-middle border-b border-border/60'

  return (
    <div dir="rtl" className="w-full min-h-[calc(100vh-7rem)] flex flex-col gap-4">
      <PageHeader
        title={`سجل اشتراكات — ${customer?.name ?? '…'}`}
        description={customer?.phone ? `رقم التواصل: ${customer.phone}` : undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            {activeSubscription && (
              <PermissionGuard permission="renew_subscriptions">
                <Button size="sm" className="gap-1.5" asChild>
                  <Link href={`/subscriptions/renew/${activeSubscription.id}`}>
                    <RotateCcw size={14} />
                    تجديد
                  </Link>
                </Button>
              </PermissionGuard>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link href="/customers" className="gap-1.5">
                <ArrowRight size={14} />
                العودة للمشتركين
              </Link>
            </Button>
          </div>
        }
      />

      {editPeriod && (
        <SubscriptionPeriodEditForm
          period={editPeriod}
          customerId={customerId}
          onCancel={closeEdit}
          onSuccess={() => {
            invalidate()
            closeEdit()
          }}
        />
      )}

      <DataPanel noPadding className="flex-1 flex flex-col min-h-0 w-full">
        <div className="flex-1 w-full overflow-x-auto">
          <table className="w-full min-w-full text-sm border-collapse table-auto">
            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
              <tr>
                <th className={cn(thClass, 'w-[7%]')}>username</th>
                <th className={cn(thClass, 'w-[8%]')}>اسم المشترك</th>
                <th className={cn(thClass, 'w-[7%]')}>رقم التواصل</th>
                <th className={cn(thClass, 'w-[4%]')}>السرعة</th>
                <th className={cn(thClass, 'w-[10%]')}>MAC</th>
                <th className={cn(thClass, 'w-[8%]')}>بداية الاشتراك</th>
                <th className={cn(thClass, 'w-[5%]')}>السعر</th>
                <th className={cn(thClass, 'w-[5%]')}>النوع</th>
                <th className={cn(thClass, 'w-[4%]')}>الشهر</th>
                <th className={cn(thClass, 'w-[9%]')}>تاريخ الدفع</th>
                <th className={cn(thClass, 'w-[5%]')}>مستحق</th>
                <th className={cn(thClass, 'w-[5%]')}>نقداً</th>
                <th className={cn(thClass, 'w-[5%]')}>تطبيق</th>
                <th className={cn(thClass, 'w-[5%]')}>خصم</th>
                <th className={cn(thClass, 'w-[5%]')}>الباقي</th>
                <th className={cn(thClass, 'w-[8%]')}>ملاحظات</th>
                <th className={cn(thClass, 'w-[6%] text-center')}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={17} className="py-16 text-center text-muted-foreground">
                    جارٍ التحميل…
                  </td>
                </tr>
              )}
              {!isLoading && periods.length === 0 && (
                <tr>
                  <td colSpan={17} className="py-16 text-center text-muted-foreground">
                    لا توجد سجلات — أنشئ اشتراكاً أو جدّد لإضافة دورة
                  </td>
                </tr>
              )}
              {periods.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                  <td className={cn(tdClass, 'font-mono text-xs')} title={row.username ?? ''}>
                    {row.username ?? '—'}
                  </td>
                  <td className={tdClass}>{customer?.name ?? '—'}</td>
                  <td className={cn(tdClass, 'tabular-nums font-mono text-xs')}>
                    {customer?.phone ?? '—'}
                  </td>
                  <td className={tdClass}>{row.speed ?? '—'}</td>
                  <td className={cn(tdClass, 'font-mono text-xs')} title={row.mac_address ?? ''}>
                    {row.mac_address ?? '—'}
                  </td>
                  <td className={cn(tdClass, 'whitespace-nowrap')}>{formatDate(row.period_start)}</td>
                  <td className={cn(tdClass, 'tabular-nums')}>{formatMoney(row.price)}</td>
                  <td className={tdClass}>{row.billing_label}</td>
                  <td className={cn(tdClass, 'tabular-nums text-center')}>
                    {row.period_month ?? '—'}
                  </td>
                  <td
                    className={cn(
                      tdClass,
                      'whitespace-nowrap',
                      row.paid_at ? '' : 'text-amber-700 font-medium',
                    )}
                  >
                    {formatDateTime(row.paid_at)}
                  </td>
                  <td className={cn(tdClass, 'tabular-nums')}>{formatMoney(row.amount_due)}</td>
                  <td className={cn(tdClass, 'tabular-nums text-muted-foreground')}>
                    {isZeroAmount(row.cash_amount) ? '—' : formatMoney(row.cash_amount)}
                  </td>
                  <td className={cn(tdClass, 'tabular-nums text-muted-foreground')}>
                    {isZeroAmount(row.app_amount) ? '—' : formatMoney(row.app_amount)}
                  </td>
                  <td className={cn(tdClass, 'tabular-nums text-muted-foreground')}>
                    {isZeroAmount(row.discount_amount) ? '—' : formatMoney(row.discount_amount)}
                  </td>
                  <td
                    className={cn(
                      tdClass,
                      'tabular-nums font-semibold',
                      Number(row.balance_remaining) > 0 ? 'text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {isZeroAmount(row.balance_remaining) ? '—' : formatMoney(row.balance_remaining)}
                  </td>
                  <td className={cn(tdClass, 'truncate max-w-[10rem] text-muted-foreground')} title={row.notes ?? ''}>
                    {row.notes ?? '—'}
                  </td>
                  <td className={tdClass}>
                    <div className="flex items-center justify-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => openEdit(row.id)}
                        title="تعديل"
                      >
                        <Pencil size={14} />
                      </Button>
                      <PermissionGuard permission="delete_records">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive"
                          onClick={() =>
                            openModal({
                              id: row.id,
                              table: 'subscription_periods',
                              name: `${customer?.name ?? ''} — ${formatDate(row.period_start)}`,
                              consequences: 'سيُخفى السجل من القائمة.',
                            })
                          }
                          title="حذف"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </PermissionGuard>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataPanel>

      <DeleteConfirmModal
        open={deleteOpen}
        onClose={closeModal}
        onConfirm={handleDeleteConfirm}
        recordName={target?.name ?? ''}
        consequences={target?.consequences}
      />
    </div>
  )
}
