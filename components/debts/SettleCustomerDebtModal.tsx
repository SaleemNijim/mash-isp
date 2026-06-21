'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
import { toast } from 'sonner'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { PaymentMethodPicker } from '@/components/payments/PaymentMethodPicker'
import { PaymentDetailsSection } from '@/components/payments/PaymentDetailsSection'
import {
  uploadPaymentProof,
  attachProofToPayment,
} from '@/lib/payment-proof'
import { formatMoney } from '@/lib/format-money'
import { invalidateDebtQueries } from '@/lib/debts/invalidate-debt-queries'
import { isSettleDebtRpcMissing, SETTLE_DEBT_RPC_HINT } from '@/lib/debts/settle-debt-rpc'
import {
  isBankPayment,
  parsePaymentMethodValue,
  toDbPaymentMethod,
  validatePaymentForm,
  type PaymentMethodValue,
} from '@/lib/payments/payment-selection'
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

export interface CustomerDebtTarget {
  id: string
  customer_id: string
  remaining_amount: number
  reason: string | null
  subscription_period_id: string | null
  customer_name: string
}

interface SettleCustomerDebtModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  debt: CustomerDebtTarget | null
}

export function SettleCustomerDebtModal({
  open,
  onClose,
  onSuccess,
  debt,
}: SettleCustomerDebtModalProps) {
  const { data: tenant } = useTenant()
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethodValue>('cash')
  const [sourceAccountLabel, setSourceAccountLabel] = useState('')
  const [attachProof, setAttachProof] = useState(false)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const remaining = debt?.remaining_amount ?? 0

  useEffect(() => {
    if (!open || !debt) return
    setAmount(String(remaining))
    setMethod('cash')
    setSourceAccountLabel('')
    setAttachProof(false)
    setProofFile(null)
    setNotes('')
  }, [open, debt, remaining])

  const parsedAmount = useMemo(() => Number(amount), [amount])
  const isPartial = parsedAmount > 0 && parsedAmount < remaining - 0.001

  async function handleSubmit() {
    if (!tenant?.id || !debt) return

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error('أدخل مبلغاً صحيحاً')
      return
    }

    if (parsedAmount > remaining + 0.001) {
      toast.error('المبلغ أكبر من المتبقي')
      return
    }

    const validationError = validatePaymentForm({
      method,
      sourceAccountLabel,
      attachProof,
      proofFile,
    })
    if (validationError) {
      toast.error(validationError)
      return
    }

    const parsed = parsePaymentMethodValue(method)
    const cashAmount = parsed.kind === 'cash' ? parsedAmount : 0
    const appAmount = parsed.kind === 'bank' ? parsedAmount : 0
    const dbMethod = toDbPaymentMethod(method)
    const nonce = crypto.randomUUID()

    setLoading(true)
    try {
      const { data: paymentId, error } = await supabase.rpc('settle_customer_debt', {
        p_debt_id: debt.id,
        p_cash_amount: cashAmount,
        p_app_amount: appAmount,
        p_app_method: parsed.kind === 'bank' ? dbMethod : null,
        p_bank_account_id: parsed.bankAccountId,
        p_source_account_label: sourceAccountLabel.trim() || null,
        p_notes: notes.trim() || null,
        p_nonce: nonce,
      })

      if (error) throw error

      if (attachProof && proofFile && paymentId) {
        const proofUrl = await uploadPaymentProof(
          supabase,
          tenant.id,
          'debt-settlement',
          proofFile,
        )
        const { data: userData } = await supabase.auth.getUser()
        if (userData.user) {
          await attachProofToPayment(
            supabase,
            tenant.id,
            paymentId as string,
            proofUrl,
            userData.user.id,
          )
        }
      }

      toast.success(
        isPartial
          ? `تم تسجيل دفعة جزئية — متبقٍ ${formatMoney(remaining - parsedAmount)}`
          : 'تم تسديد الدين بالكامل',
      )
      await invalidateDebtQueries(queryClient)
      onSuccess()
      onClose()
    } catch (err) {
      const pgErr = err as PostgrestError
      const msg = pgErr.message ?? (err instanceof Error ? err.message : '')
      if (isSettleDebtRpcMissing(msg)) {
        toast.error(SETTLE_DEBT_RPC_HINT)
      } else {
        toast.error(msg || 'فشل التسديد')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تسديد دين مشترك</DialogTitle>
        </DialogHeader>

        {!debt ? (
          <p className="text-sm text-muted-foreground py-4">—</p>
        ) : (
          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-1">
              <p className="font-semibold">{debt.customer_name}</p>
              {debt.reason && (
                <p className="text-xs text-muted-foreground">{debt.reason}</p>
              )}
              <p className="text-sm pt-1">
                المتبقي{' '}
                <span className="font-bold tabular-nums text-destructive">
                  {formatMoney(remaining)}
                </span>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settle-amount">المبلغ المُسدَّد</Label>
              <Input
                id="settle-amount"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                dir="ltr"
                className="tabular-nums"
              />
              {remaining > 0 && (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs"
                  onClick={() => setAmount(String(remaining))}
                >
                  تسديد المبلغ كاملاً ({formatMoney(remaining)})
                </Button>
              )}
            </div>

            <PaymentMethodPicker
              value={method}
              onChange={(v) => {
                setMethod(v)
                if (!isBankPayment(v)) {
                  setSourceAccountLabel('')
                  setAttachProof(false)
                  setProofFile(null)
                }
              }}
              allowDebt={false}
              disabled={loading}
            />

            <PaymentDetailsSection
              method={method}
              sourceAccountLabel={sourceAccountLabel}
              onSourceAccountLabelChange={setSourceAccountLabel}
              attachProof={attachProof}
              onAttachProofChange={setAttachProof}
              proofFile={proofFile}
              onProofFileChange={setProofFile}
              disabled={loading}
            />

            <div className="space-y-1.5">
              <Label htmlFor="settle-notes">ملاحظات (اختياري)</Label>
              <Input
                id="settle-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="مثال: دفعة جزئية — الباقي لاحقاً"
              />
            </div>

            {debt.subscription_period_id && (
              <Link
                href={`/subscriptions/customer/${debt.customer_id}`}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink size={12} />
                فتح سجل اشتراك المشترك
              </Link>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={loading || !debt}>
            {loading ? 'جارٍ التسديد…' : isPartial ? 'تسجيل دفعة جزئية' : 'تسديد'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
