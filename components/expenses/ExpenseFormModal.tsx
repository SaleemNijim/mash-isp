'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { AccountSelector } from '@/components/subscriptions/AccountSelector'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ExpenseCategory, ExpenseMethod } from '@/lib/expenses/types'
import { LEDGER_METHOD_LABELS } from '@/lib/payments/ledger-labels'
import { formatAmount } from '@/lib/format-money'

const ELECTRONIC_METHODS: ExpenseMethod[] = ['reflect', 'jawwal_pay', 'bank']

function expenseRpcErrorMessage(err: unknown): string {
  const msg =
    (err as PostgrestError)?.message ??
    (err instanceof Error ? err.message : '') ??
    ''

  if (!msg) return 'فشل تسجيل المصروف'
  if (msg.includes('insufficient bank balance')) {
    return 'رصيد الحساب البنكي غير كافٍ لهذا المبلغ'
  }
  if (msg.includes('insufficient permission')) {
    return 'ليس لديك صلاحية تسجيل المصروفات'
  }
  if (msg.includes('bank_account_id required')) {
    return 'اختر الحساب البنكي الذي خُصم منه المبلغ'
  }
  if (msg.includes('bank account not found')) {
    return 'الحساب البنكي غير موجود أو محذوف'
  }
  if (msg.includes('expense category not found')) {
    return 'فئة المصروف غير موجودة — حدّث الصفحة وأعد المحاولة'
  }
  if (msg.includes('record_expense') && msg.includes('does not exist')) {
    return 'دالة تسجيل المصروف غير مفعّلة — طبّق migration 069 على قاعدة البيانات'
  }
  return msg
}

interface ExpenseFormModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function ExpenseFormModal({ open, onClose, onSuccess }: ExpenseFormModalProps) {
  const supabase = createClient()
  const { data: tenant } = useTenant()

  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<ExpenseMethod>('cash')
  const [bankAccountId, setBankAccountId] = useState<string | null>(null)
  const [sourceLabel, setSourceLabel] = useState('')
  const [description, setDescription] = useState('')
  const [beneficiary, setBeneficiary] = useState('')
  const [notes, setNotes] = useState('')
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 16))
  const [submitting, setSubmitting] = useState(false)

  const { data: categories = [] } = useQuery<ExpenseCategory[]>({
    queryKey: ['expense-categories', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return []
      const { data, error } = await supabase
        .from('expense_categories')
        .select('id, tenant_id, name, sort_order, is_system, is_deleted')
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
        .order('sort_order')
      if (error) throw error
      return data ?? []
    },
    enabled: open && !!tenant?.id,
  })

  useEffect(() => {
    if (!open) return
    setCategoryId('')
    setAmount('')
    setMethod('cash')
    setBankAccountId(null)
    setSourceLabel('')
    setDescription('')
    setBeneficiary('')
    setNotes('')
    setPaidAt(new Date().toISOString().slice(0, 16))
  }, [open])

  const needsBank = method !== 'cash'

  const { data: bankBalance } = useQuery({
    queryKey: ['bank-account-balance', tenant?.id, bankAccountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_bank_accounts')
        .select('current_total')
        .eq('id', bankAccountId!)
        .eq('is_deleted', false)
        .single()
      if (error) throw error
      return Number(data.current_total) || 0
    },
    enabled: open && needsBank && !!bankAccountId,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!tenant?.id) return

    const parsedAmount = Number(amount)
    if (!categoryId) {
      toast.error('اختر فئة المصروف')
      return
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error('أدخل مبلغاً صحيحاً أكبر من صفر')
      return
    }
    if (needsBank && !bankAccountId) {
      toast.error('اختر الحساب البنكي الذي خُصم منه المبلغ')
      return
    }
    if (
      needsBank &&
      bankBalance !== undefined &&
      parsedAmount > bankBalance
    ) {
      toast.error(
        `رصيد الحساب (${formatAmount(bankBalance)}) أقل من المبلغ المطلوب (${formatAmount(parsedAmount)})`,
      )
      return
    }

    setSubmitting(true)
    try {
      const paidAtIso = paidAt ? new Date(paidAt).toISOString() : new Date().toISOString()
      const { error } = await supabase.rpc('record_expense', {
        p_category_id: categoryId,
        p_amount: parsedAmount,
        p_method: method,
        p_bank_account_id: needsBank ? bankAccountId : null,
        p_source_account_label: needsBank ? sourceLabel.trim() || null : null,
        p_description: description.trim() || null,
        p_beneficiary: beneficiary.trim() || null,
        p_notes: notes.trim() || null,
        p_paid_at: paidAtIso,
      })
      if (error) throw error

      toast.success('تم تسجيل المصروف')
      onSuccess()
      onClose()
    } catch (err) {
      toast.error(expenseRpcErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>إضافة مصروف</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>الفئة</Label>
            <Select value={categoryId} onValueChange={setCategoryId} disabled={submitting}>
              <SelectTrigger>
                <SelectValue placeholder="اختر الفئة" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="expense-amount">المبلغ</Label>
              <Input
                id="expense-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={submitting}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expense-paid-at">تاريخ الصرف</Label>
              <Input
                id="expense-paid-at"
                type="datetime-local"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>طريقة الصرف</Label>
            <Select
              value={method}
              onValueChange={(v) => {
                setMethod(v as ExpenseMethod)
                if (v === 'cash') setBankAccountId(null)
              }}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="cash">{LEDGER_METHOD_LABELS.cash}</SelectItem>
                {ELECTRONIC_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {LEDGER_METHOD_LABELS[m] ?? m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsBank && (
            <>
              <AccountSelector
                value={bankAccountId}
                onChange={setBankAccountId}
                disabled={submitting}
              />
              {bankAccountId && bankBalance !== undefined && (
                <p className="text-xs text-muted-foreground">
                  الرصيد المسجّل في الحساب:{' '}
                  <span className="font-medium tabular-nums text-foreground">
                    {formatAmount(bankBalance)}
                  </span>
                </p>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="expense-source">الحساب الصادر (اختياري)</Label>
                <Input
                  id="expense-source"
                  value={sourceLabel}
                  onChange={(e) => setSourceLabel(e.target.value)}
                  disabled={submitting}
                  placeholder="مثال: حساب الشركة الرئيسي"
                />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="expense-description">الوصف</Label>
            <Input
              id="expense-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
              placeholder="مثال: راتب شهر مارس"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expense-beneficiary">المستفيد (اختياري)</Label>
            <Input
              id="expense-beneficiary"
              value={beneficiary}
              onChange={(e) => setBeneficiary(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expense-notes">ملاحظات</Label>
            <textarea
              id="expense-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting}
              rows={2}
              className="w-full rounded-lg border border-mash-border bg-mash-surface px-3 py-2.5 text-sm resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'جارٍ الحفظ…' : 'تسجيل المصروف'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
