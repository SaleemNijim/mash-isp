'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { MacAddressField } from '@/components/subscriptions/MacAddressField'
import {
  isRpcMissingError,
  RPC_MIGRATION_HINT,
} from '@/lib/subscriptions/resolve-bb-credential'
import {
  emptyPeriodForm,
  parsePeriodForm,
  periodFormFromRow,
  type SubscriptionPeriodRow,
} from '@/lib/subscriptions/types'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface SubscriptionSaleEditTarget {
  id: string
  label: string
  customerId: string
}

interface EditSubscriptionSaleModalProps {
  open: boolean
  sale: SubscriptionSaleEditTarget | null
  onClose: () => void
  onSuccess: () => void
}

export function EditSubscriptionSaleModal({
  open,
  sale,
  onClose,
  onSuccess,
}: EditSubscriptionSaleModalProps) {
  const { data: tenant } = useTenant()
  const supabase = createClient()
  const [form, setForm] = useState(emptyPeriodForm())
  const [loading, setLoading] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)

  const { data: period, isLoading } = useQuery<SubscriptionPeriodRow | null>({
    queryKey: ['subscription-period-edit', sale?.id],
    queryFn: async () => {
      if (!sale?.id || !tenant?.id) return null
      const { data, error } = await supabase
        .from('subscription_periods')
        .select(
          `id, tenant_id, customer_id, subscription_id, credential_id, username,
          period_month, period_start, speed, mac_address, price, billing_label,
          amount_due, cash_amount, app_amount, discount_amount, balance_remaining,
          paid_at, payment_id, pending_task_id, notes, created_at`,
        )
        .eq('id', sale.id)
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
        .maybeSingle()
      if (error) throw error
      return data as SubscriptionPeriodRow | null
    },
    enabled: open && !!sale?.id && !!tenant?.id,
  })

  useEffect(() => {
    if (period) setForm(periodFormFromRow(period))
  }, [period])

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  async function handleSave() {
    if (!sale || !period) return
    const parsed = parsePeriodForm(form)
    if (!parsed.period_start) {
      toast.error('تاريخ بداية الاشتراك مطلوب')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.rpc('update_subscription_period_with_debt', {
        p_period_id: period.id,
        p_username: parsed.username,
        p_period_month: parsed.period_month,
        p_period_start: parsed.period_start,
        p_speed: parsed.speed,
        p_mac_address: parsed.mac_address,
        p_price: parsed.price,
        p_billing_label: parsed.billing_label,
        p_amount_due: parsed.amount_due,
        p_cash_amount: parsed.cash_amount,
        p_app_amount: parsed.app_amount,
        p_discount_amount: parsed.discount_amount,
        p_balance_remaining: parsed.balance_remaining,
        p_paid_at: parsed.paid_at,
        p_notes: parsed.notes,
      })
      if (error) throw error

      toast.success('تم تعديل عملية الاشتراك')
      onSuccess()
      onClose()
    } catch (err) {
      const pgErr = err as PostgrestError
      const msg = pgErr.message ?? ''
      if (isRpcMissingError(msg)) {
        toast.error(RPC_MIGRATION_HINT)
      } else {
        toast.error(msg || 'فشل الحفظ')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleVoid() {
    if (!sale) return
    const { error } = await supabase.rpc('void_subscription_period', {
      p_period_id: sale.id,
      p_nonce: crypto.randomUUID(),
    })
    if (error) throw error
    toast.success('تم حذف عملية الاشتراك')
    onSuccess()
    onClose()
  }

  const customerId = sale?.customerId ?? period?.customer_id ?? ''

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !loading && !v && onClose()}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تعديل بيع — {sale?.label ?? ''}</DialogTitle>
          </DialogHeader>

          {isLoading || !period ? (
            <p className="text-sm text-muted-foreground py-8 text-center">جارٍ التحميل…</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="username" value={form.username} onChange={(v) => set('username', v)} ltr />
                <Field label="الشهر" value={form.period_month} onChange={(v) => set('period_month', v)} ltr type="number" />
                <Field label="تاريخ بداية الاشتراك" value={form.period_start} onChange={(v) => set('period_start', v)} ltr type="date" />
                <Field label="تاريخ الدفع" value={form.paid_at} onChange={(v) => set('paid_at', v)} ltr type="datetime-local" />
                <Field label="السرعة" value={form.speed} onChange={(v) => set('speed', v)} />
                <Field label="سعر الاشتراك" value={form.price} onChange={(v) => set('price', v)} ltr type="number" />
                <Field label="حالة الاشتراك" value={form.billing_label} onChange={(v) => set('billing_label', v)} />
                <Field label="المستحق" value={form.amount_due} onChange={(v) => set('amount_due', v)} ltr type="number" />
                <Field label="نقداً" value={form.cash_amount} onChange={(v) => set('cash_amount', v)} ltr type="number" />
                <Field label="تطبيق" value={form.app_amount} onChange={(v) => set('app_amount', v)} ltr type="number" />
                <Field label="خصم" value={form.discount_amount} onChange={(v) => set('discount_amount', v)} ltr type="number" />
                <Field label="الباقي" value={form.balance_remaining} onChange={(v) => set('balance_remaining', v)} ltr type="number" />
              </div>

              <MacAddressField
                value={form.mac_address}
                onChange={(v) => set('mac_address', v)}
                customerId={customerId}
                disabled={loading}
              />

              <div className="space-y-1.5">
                <Label>ملاحظات</Label>
                <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} disabled={loading} />
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={() => setVoidOpen(true)}
                disabled={loading}
              >
                حذف هذه العملية بالكامل
              </Button>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              إغلاق
            </Button>
            <Button onClick={() => void handleSave()} disabled={loading || !period}>
              {loading ? 'جارٍ الحفظ…' : 'حفظ التعديل'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmModal
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        onConfirm={handleVoid}
        recordName={sale?.label ?? 'عملية الاشتراك'}
        title="تأكيد حذف عملية الاشتراك"
        confirmKeyword="حذف"
        confirmLabel="تأكيد الحذف"
        consequences="سيُلغى الدين المرتبط ويُعكَس الحساب البنكي إن وُجد. لا يمكن التراجع."
      />
    </>
  )
}

function Field({
  label,
  value,
  onChange,
  ltr,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  ltr?: boolean
  type?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        dir={ltr ? 'ltr' : 'rtl'}
        className={ltr ? 'text-right tabular-nums' : undefined}
      />
    </div>
  )
}
