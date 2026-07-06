'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, ArrowRight, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useDeleteConfirm } from '@/hooks/useDeleteConfirm'
import { usePermissions } from '@/hooks/usePermissions'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import { CredentialCorrectionDialog } from '@/components/subscriptions/CredentialCorrectionDialog'
import { SubscriptionPeriodEditForm } from '@/components/subscriptions/SubscriptionPeriodEditForm'
import { type SubscriptionPeriodRow } from '@/lib/subscriptions/types'
import { formatMoney } from '@/lib/format-money'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataPanel } from '@/components/shared/DataPanel'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  MASH_TABLE,
  MASH_TABLE_SCROLL,
  MASH_TD,
  MASH_TD_ACTIONS,
  MASH_TD_AMOUNT,
  MASH_TD_MAC,
  MASH_TH,
  MASH_TH_ACTIONS,
  MASH_TH_CENTER,
} from '@/lib/ui/mash-table'

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
  const role = usePermissions((s) => s.role)
  const canCorrectCredentials =
    role === 'admin' || role === 'super_admin' || role === 'employee'
  const [correctionOpen, setCorrectionOpen] = useState(false)

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
    void queryClient.invalidateQueries({ queryKey: ['customer-credential-current'] })
    void queryClient.invalidateQueries({ queryKey: ['customer-active-subscription'] })
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

  const thClass = cn(MASH_TH, 'whitespace-nowrap')
  const tdClass = 'px-3 py-2.5 align-middle border-b border-border/60'

  const headerActions = (
    <div className="flex flex-wrap gap-2 w-full sm:w-auto">
      {canCorrectCredentials && activeSubscription?.type === 'bb' && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 flex-1 sm:flex-none min-h-10"
          onClick={() => setCorrectionOpen(true)}
        >
          <ArrowLeftRight size={14} />
          <span className="sm:hidden">تصحيح</span>
          <span className="hidden sm:inline">تصحيح يوزر/باقة</span>
        </Button>
      )}
      {activeSubscription && (
        <PermissionGuard permission="renew_subscriptions">
          <Button size="sm" className="gap-1.5 flex-1 sm:flex-none min-h-10" asChild>
            <Link href={`/subscriptions/renew/${activeSubscription.id}`}>
              <RotateCcw size={14} />
              تجديد
            </Link>
          </Button>
        </PermissionGuard>
      )}
      <Button variant="outline" size="sm" className="gap-1.5 flex-1 sm:flex-none min-h-10" asChild>
        <Link href="/customers">
          <ArrowRight size={14} />
          <span className="sm:hidden">رجوع</span>
          <span className="hidden sm:inline">العودة للمشتركين</span>
        </Link>
      </Button>
    </div>
  )

  return (
    <div dir="rtl" className="w-full min-w-0 min-h-[calc(100vh-7rem)] flex flex-col gap-3 sm:gap-4">
      <PageHeader
        title={`سجل اشتراكات — ${customer?.name ?? '…'}`}
        description={customer?.phone ? `رقم التواصل: ${customer.phone}` : undefined}
        actions={headerActions}
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

      <DataPanel noPadding className="flex-1 flex flex-col min-h-0 min-w-0 w-full">
        {/* عرض بطاقات — هاتف */}
        <div className="md:hidden divide-y divide-border">
          {isLoading && (
            <p className="py-12 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>
          )}
          {!isLoading && periods.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground px-4">
              لا توجد سجلات — أنشئ اشتراكاً أو جدّد لإضافة دورة
            </p>
          )}
          {periods.map((row) => (
            <article key={row.id} className="p-3 sm:p-4 space-y-2">
              <div className="flex items-start justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{formatDate(row.period_start)}</p>
                  <p className="font-mono text-xs text-muted-foreground break-all" dir="ltr">
                    {row.username ?? '—'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0"
                    onClick={() => openEdit(row.id)}
                    title="تعديل"
                  >
                    <Pencil size={14} />
                  </Button>
                  <PermissionGuard permission="delete_records">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0 text-destructive"
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
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div>
                  <dt className="text-muted-foreground">السرعة</dt>
                  <dd>{row.speed ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">السعر</dt>
                  <dd className="tabular-nums">{formatMoney(row.price)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">المستحق</dt>
                  <dd className="tabular-nums">{formatMoney(row.amount_due)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">الباقي</dt>
                  <dd
                    className={cn(
                      'tabular-nums font-semibold',
                      Number(row.balance_remaining) > 0 ? 'text-destructive' : '',
                    )}
                  >
                    {isZeroAmount(row.balance_remaining) ? '—' : formatMoney(row.balance_remaining)}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">تاريخ الدفع</dt>
                  <dd className={row.paid_at ? '' : 'text-amber-700 font-medium'}>
                    {formatDateTime(row.paid_at)}
                  </dd>
                </div>
                {row.mac_address && (
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">MAC</dt>
                    <dd className="font-mono break-all" dir="ltr">
                      {row.mac_address}
                    </dd>
                  </div>
                )}
              </dl>
            </article>
          ))}
        </div>

        {/* جدول — تابلت وسطح مكتب */}
        <div className={cn('hidden md:block flex-1 w-full min-w-0', MASH_TABLE_SCROLL)}>
          <table className={cn(MASH_TABLE, 'min-w-[720px]')}>
            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
              <tr>
                <th className={thClass}>username</th>
                <th className={thClass}>السرعة</th>
                <th className={cn(thClass, 'hidden lg:table-cell')}>MAC</th>
                <th className={thClass}>بداية الاشتراك</th>
                <th className={cn(thClass, MASH_TH_CENTER)}>السعر</th>
                <th className={cn(thClass, 'hidden lg:table-cell')}>النوع</th>
                <th className={cn(thClass, 'hidden xl:table-cell')}>الشهر</th>
                <th className={thClass}>تاريخ الدفع</th>
                <th className={cn(thClass, MASH_TH_CENTER)}>مستحق</th>
                <th className={cn(thClass, MASH_TH_CENTER, 'hidden lg:table-cell')}>نقداً</th>
                <th className={cn(thClass, MASH_TH_CENTER, 'hidden xl:table-cell')}>تطبيق</th>
                <th className={cn(thClass, MASH_TH_CENTER, 'hidden xl:table-cell')}>خصم</th>
                <th className={cn(thClass, MASH_TH_CENTER)}>الباقي</th>
                <th className={cn(thClass, 'hidden xl:table-cell')}>ملاحظات</th>
                <th className={cn(thClass, MASH_TH_ACTIONS)}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={15} className="py-16 text-center text-muted-foreground">
                    جارٍ التحميل…
                  </td>
                </tr>
              )}
              {!isLoading && periods.length === 0 && (
                <tr>
                  <td colSpan={15} className="py-16 text-center text-muted-foreground">
                    لا توجد سجلات — أنشئ اشتراكاً أو جدّد لإضافة دورة
                  </td>
                </tr>
              )}
              {periods.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                  <td className={cn(tdClass, 'font-mono text-xs max-w-[8rem] truncate')} title={row.username ?? ''}>
                    {row.username ?? '—'}
                  </td>
                  <td className={tdClass}>{row.speed ?? '—'}</td>
                  <td className={cn(tdClass, MASH_TD_MAC, 'hidden lg:table-cell')} title={row.mac_address ?? ''}>
                    {row.mac_address ?? '—'}
                  </td>
                  <td className={cn(tdClass, 'whitespace-nowrap')}>{formatDate(row.period_start)}</td>
                  <td className={cn(tdClass, MASH_TD_AMOUNT)}>{formatMoney(row.price)}</td>
                  <td className={cn(tdClass, 'hidden lg:table-cell')}>{row.billing_label}</td>
                  <td className={cn(tdClass, 'tabular-nums text-center hidden xl:table-cell')}>
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
                  <td className={cn(tdClass, MASH_TD_AMOUNT)}>{formatMoney(row.amount_due)}</td>
                  <td className={cn(tdClass, MASH_TD_AMOUNT, 'hidden lg:table-cell text-muted-foreground')}>
                    {isZeroAmount(row.cash_amount) ? '—' : formatMoney(row.cash_amount)}
                  </td>
                  <td className={cn(tdClass, MASH_TD_AMOUNT, 'hidden xl:table-cell text-muted-foreground')}>
                    {isZeroAmount(row.app_amount) ? '—' : formatMoney(row.app_amount)}
                  </td>
                  <td className={cn(tdClass, MASH_TD_AMOUNT, 'hidden xl:table-cell text-muted-foreground')}>
                    {isZeroAmount(row.discount_amount) ? '—' : formatMoney(row.discount_amount)}
                  </td>
                  <td
                    className={cn(
                      tdClass,
                      MASH_TD_AMOUNT,
                      'font-semibold',
                      Number(row.balance_remaining) > 0 ? 'text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {isZeroAmount(row.balance_remaining) ? '—' : formatMoney(row.balance_remaining)}
                  </td>
                  <td className={cn(tdClass, MASH_TD, 'hidden xl:table-cell truncate max-w-[10rem] text-muted-foreground')} title={row.notes ?? ''}>
                    {row.notes ?? '—'}
                  </td>
                  <td className={cn(tdClass, MASH_TD_ACTIONS)}>
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

      {customer && (
        <CredentialCorrectionDialog
          open={correctionOpen}
          onOpenChange={setCorrectionOpen}
          customerId={customerId}
          customerName={customer.name}
          onSuccess={invalidate}
        />
      )}
    </div>
  )
}
