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
import { uploadPaymentProof } from '@/lib/payment-proof'
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

export interface DistributorDebtTarget {
  id: string
  name: string
  balance_due: number
}

interface SettleDistributorDebtModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  distributor: DistributorDebtTarget | null
}

export function SettleDistributorDebtModal({
  open,
  onClose,
  onSuccess,
  distributor,
}: SettleDistributorDebtModalProps) {
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

  const balanceDue = distributor?.balance_due ?? 0

  useEffect(() => {
    if (!open || !distributor) return
    setAmount(String(balanceDue))
    setMethod('cash')
    setSourceAccountLabel('')
    setAttachProof(false)
    setProofFile(null)
    setNotes('')
  }, [open, distributor, balanceDue])

  const parsedAmount = useMemo(() => Number(amount), [amount])
  const isPartial = parsedAmount > 0 && parsedAmount < balanceDue - 0.001

  async function handleSubmit() {
    if (!tenant?.id || !distributor) return

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error('أدخل مبلغاً صحيحاً')
      return
    }

    if (parsedAmount > balanceDue + 0.001) {
      toast.error('المبلغ أكبر من المستحق')
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
    if (parsed.kind === 'debt') {
      toast.error('لا يمكن تسجيل دفعة استلام كـ «دين»')
      return
    }

    setLoading(true)
    try {
      let proofUrl: string | null = null
      if (attachProof && proofFile) {
        proofUrl = await uploadPaymentProof(
          supabase,
          tenant.id,
          'distributor-payment',
          proofFile,
        )
      }

      const { error } = await supabase.rpc('receive_distributor_payment', {
        p_distributor_id: distributor.id,
        p_amount: parsedAmount,
        p_method: toDbPaymentMethod(method),
        p_bank_account_id: parsed.bankAccountId,
        p_source_account_label: sourceAccountLabel.trim() || null,
        p_proof_url: proofUrl,
        p_notes: notes.trim() || null,
        p_nonce: crypto.randomUUID(),
      })

      if (error) throw error

      toast.success(
        isPartial
          ? `تم الاستلام — متبقٍ ${formatMoney(balanceDue - parsedAmount)}`
          : 'تم تسديد مستحقات الموزع',
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
          <DialogTitle>استلام دفعة من موزع</DialogTitle>
        </DialogHeader>

        {!distributor ? (
          <p className="text-sm text-muted-foreground py-4">—</p>
        ) : (
          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-1">
              <p className="font-semibold">{distributor.name}</p>
              <p className="text-sm pt-1">
                المستحق{' '}
                <span className="font-bold tabular-nums text-amber-700">
                  {formatMoney(balanceDue)}
                </span>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dist-amount">المبلغ المستلم</Label>
              <Input
                id="dist-amount"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                dir="ltr"
                className="tabular-nums"
              />
              {balanceDue > 0 && (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs"
                  onClick={() => setAmount(String(balanceDue))}
                >
                  استلام المبلغ كاملاً ({formatMoney(balanceDue)})
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
              <Label htmlFor="dist-notes">ملاحظات (اختياري)</Label>
              <Input
                id="dist-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <Link
              href={`/distributors/${distributor.id}`}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink size={12} />
              فتح سجل الموزع
            </Link>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={loading || !distributor}
          >
            {loading ? 'جارٍ الحفظ…' : isPartial ? 'تسجيل دفعة جزئية' : 'تسديد'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
