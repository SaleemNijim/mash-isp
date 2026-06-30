'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { PaymentMethodPicker } from '@/components/payments/PaymentMethodPicker'
import { PaymentDetailsSection } from '@/components/payments/PaymentDetailsSection'
import { uploadPaymentProof } from '@/lib/payment-proof'
import {
  isBankPayment,
  parsePaymentMethodValue,
  toDbPaymentMethod,
  validatePaymentForm,
  type PaymentMethodValue,
} from '@/lib/payments/payment-selection'
import { formatAmount } from '@/lib/format-money'
import {
  DebtPartySection,
  defaultDebtPartyValue,
  validateDebtParty,
  type DebtPartyValue,
} from '@/components/sales/DebtPartySection'
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
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'

export interface RetailSaleEditTarget {
  id: string
  label: string
  quantity: number
  unitPrice: number
  method: string
  notes: string | null
  customerId: string | null
  contactLabel: string | null
  contactPhone: string | null
  dueAt: string | null
}

interface EditRetailSaleModalProps {
  open: boolean
  sale: RetailSaleEditTarget | null
  onClose: () => void
  onSuccess: () => void
}

function toPaymentMethodValue(method: string, bankAccountId?: string | null): PaymentMethodValue {
  if (method === 'cash') return 'cash'
  if (method === 'debt') return 'debt'
  if (bankAccountId) return `bank:${bankAccountId}`
  return 'cash'
}

function dueAtLocalValue(iso: string | null): string {
  if (!iso) return defaultDebtPartyValue().dueAt
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export function EditRetailSaleModal({
  open,
  sale,
  onClose,
  onSuccess,
}: EditRetailSaleModalProps) {
  const { data: tenant } = useTenant()
  const supabase = createClient()

  const [quantity, setQuantity] = useState('1')
  const [unitPrice, setUnitPrice] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodValue>('cash')
  const [sourceAccountLabel, setSourceAccountLabel] = useState('')
  const [attachProof, setAttachProof] = useState(false)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [notes, setNotes] = useState('')
  const [debtParty, setDebtParty] = useState<DebtPartyValue>(defaultDebtPartyValue())
  const [loading, setLoading] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)

  const { data: saleDetail } = useQuery({
    queryKey: ['retail-sale-edit', sale?.id],
    queryFn: async () => {
      if (!sale?.id || !tenant?.id) return null
      const { data, error } = await supabase
        .from('card_retail_sales')
        .select(
          'id, quantity, unit_price, method, notes, bank_account_id, customer_id, contact_label, contact_phone, pending_tasks(due_at)',
        )
        .eq('id', sale.id)
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: open && !!sale?.id && !!tenant?.id,
  })

  useEffect(() => {
    if (!open || !saleDetail) return

    const taskRaw = saleDetail.pending_tasks as { due_at?: string } | { due_at?: string }[] | null
    const task = Array.isArray(taskRaw) ? taskRaw[0] : taskRaw

    setQuantity(String(saleDetail.quantity))
    setUnitPrice(String(saleDetail.unit_price))
    setPaymentMethod(
      toPaymentMethodValue(saleDetail.method, saleDetail.bank_account_id as string | null),
    )
    setSourceAccountLabel('')
    setAttachProof(false)
    setProofFile(null)
    setNotes(saleDetail.notes ?? '')

    if (saleDetail.method === 'debt') {
      const contactLabel = (saleDetail.contact_label as string) ?? ''
      const contactPhone = (saleDetail.contact_phone as string) ?? ''
      const customerId = (saleDetail.customer_id as string) ?? ''
      const useContact = contactLabel.trim().length > 0

      setDebtParty({
        mode: useContact ? 'contact' : 'customer',
        customerId: useContact ? '' : customerId,
        contactLabel,
        contactPhone,
        dueAt: dueAtLocalValue(task?.due_at ?? null),
      })
    } else {
      setDebtParty(defaultDebtPartyValue())
    }
  }, [open, saleDetail])

  async function handleSave() {
    if (!tenant || !sale) return

    const qty = Number(quantity)
    const price = Number(unitPrice)
    if (!Number.isInteger(qty) || qty <= 0) {
      toast.error('الكمية غير صالحة')
      return
    }
    if (!Number.isFinite(price) || price < 0) {
      toast.error('السعر غير صالح')
      return
    }

    const validationError = validatePaymentForm({
      method: paymentMethod,
      sourceAccountLabel,
      attachProof,
      proofFile,
    })
    if (validationError) {
      toast.error(validationError)
      return
    }

    const dbMethod = toDbPaymentMethod(paymentMethod)
    const debtError = validateDebtParty(dbMethod, debtParty)
    if (debtError) {
      toast.error(debtError)
      return
    }

    const parsed = parsePaymentMethodValue(paymentMethod)

    setLoading(true)
    try {
      let proofUrl: string | null = null
      if (attachProof && proofFile) {
        proofUrl = await uploadPaymentProof(
          supabase,
          tenant.id,
          `retail/edit/${sale.id}`,
          proofFile,
        )
      }

      const dueAtIso =
        dbMethod === 'debt' && debtParty.dueAt
          ? new Date(debtParty.dueAt).toISOString()
          : null

      const { error } = await supabase.rpc('correct_retail_sale', {
        p_sale_id: sale.id,
        p_quantity: qty,
        p_unit_price: price,
        p_method: dbMethod,
        p_bank_account_id: parsed.bankAccountId,
        p_notes: notes.trim() || null,
        p_proof_url: proofUrl,
        p_source_account_label: sourceAccountLabel.trim() || null,
        p_customer_id:
          dbMethod === 'debt' && debtParty.mode === 'customer' ? debtParty.customerId : null,
        p_contact_label:
          dbMethod === 'debt' && debtParty.mode === 'contact'
            ? debtParty.contactLabel.trim()
            : null,
        p_contact_phone:
          dbMethod === 'debt' && debtParty.mode === 'contact'
            ? debtParty.contactPhone.trim() || null
            : null,
        p_due_at: dueAtIso,
        p_nonce: crypto.randomUUID(),
      })
      if (error) throw error

      toast.success('تم تعديل البيع بنجاح')
      onSuccess()
      onClose()
    } catch {
      toast.error('فشل تعديل البيع — قد يكون الدين مسدّداً جزئياً')
    } finally {
      setLoading(false)
    }
  }

  async function handleVoid() {
    if (!sale) return
    const { error } = await supabase.rpc('void_retail_sale', {
      p_sale_id: sale.id,
      p_nonce: crypto.randomUUID(),
    })
    if (error) throw error
    toast.success('تم إلغاء البيع')
    onSuccess()
    onClose()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !loading && !v && onClose()}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تعديل بيع — {sale?.label ?? ''}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>الكمية</Label>
                <Input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  disabled={loading}
                  dir="ltr"
                  className="text-right tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label>سعر التجزئة</Label>
                <Input
                  type="number"
                  min={0}
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  disabled={loading}
                  dir="ltr"
                  className="text-right tabular-nums"
                />
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              الإجمالي:{' '}
              <span className="font-medium text-foreground tabular-nums">
                {formatAmount(Number(quantity) * Number(unitPrice) || 0)}
              </span>
            </p>

            <PaymentMethodPicker
              value={paymentMethod}
              onChange={(v) => {
                setPaymentMethod(v)
                if (!isBankPayment(v)) {
                  setSourceAccountLabel('')
                  setAttachProof(false)
                  setProofFile(null)
                }
              }}
              disabled={loading}
            />

            <PaymentDetailsSection
              method={paymentMethod}
              sourceAccountLabel={sourceAccountLabel}
              onSourceAccountLabelChange={setSourceAccountLabel}
              attachProof={attachProof}
              onAttachProofChange={setAttachProof}
              proofFile={proofFile}
              onProofFileChange={setProofFile}
              disabled={loading}
            />

            {paymentMethod === 'debt' && (
              <DebtPartySection value={debtParty} onChange={setDebtParty} disabled={loading} />
            )}

            <div className="space-y-1.5">
              <Label>ملاحظات</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="اختياري"
                disabled={loading}
              />
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

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              إغلاق
            </Button>
            <Button onClick={() => void handleSave()} disabled={loading}>
              {loading ? 'جارٍ الحفظ…' : 'حفظ التعديل'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmModal
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        onConfirm={handleVoid}
        recordName={sale?.label ?? 'عملية البيع'}
        title="تأكيد حذف البيع"
        confirmKeyword="حذف"
        confirmLabel="تأكيد الحذف"
        consequences="سيُسترجَع المخزون ويُلغى الدين المرتبط إن وُجد. لا يمكن التراجع."
      />
    </>
  )
}
