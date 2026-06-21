'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
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
import { DataPanel } from '@/components/shared/DataPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface SubscriptionPeriodEditFormProps {
  period: SubscriptionPeriodRow
  customerId: string
  onCancel: () => void
  onSuccess: () => void
}

export function SubscriptionPeriodEditForm({
  period,
  customerId,
  onCancel,
  onSuccess,
}: SubscriptionPeriodEditFormProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [form, setForm] = useState(emptyPeriodForm())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm(periodFormFromRow(period))
  }, [period])

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  async function handleSave() {
    const parsed = parsePeriodForm(form)
    if (!parsed.period_start) {
      toast.error('تاريخ بداية الاشتراك مطلوب')
      return
    }

    setSaving(true)
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

      toast.success(
        Number(parsed.balance_remaining) > 0
          ? 'تم التحديث — الباقي يُسجَّل في سجل الديون'
          : 'تم تحديث السجل',
      )
      void queryClient.invalidateQueries({ queryKey: ['hub-debts'] })
      void queryClient.invalidateQueries({ queryKey: ['debts'] })
      onSuccess()
    } catch (err) {
      const pgErr = err as PostgrestError
      const msg = pgErr.message ?? ''
      if (isRpcMissingError(msg)) {
        toast.error(RPC_MIGRATION_HINT)
      } else {
        toast.error(msg || 'فشل الحفظ')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <DataPanel>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">تعديل سجل اشتراك</h2>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            إغلاق
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          disabled={saving}
        />

        <div className="space-y-1.5">
          <Label>ملاحظات</Label>
          <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} disabled={saving} />
        </div>

        <div className="flex gap-2">
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            إلغاء
          </Button>
        </div>
      </div>
    </DataPanel>
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
