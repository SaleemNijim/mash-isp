'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
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
import { calcDistributorLineBreakdown } from '@/lib/card-sales/distributor-commission'
import { distributorUnitPrice } from '@/lib/cards/types'
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
import { formatMoney } from '@/lib/format-money'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ProductOption {
  id: string
  name: string
  sale_price: number | null
  distributor_price: number | null
  quantity_in_stock: number
}

interface DistributorOption {
  id: string
  name: string
  balance_due: number
}

interface SaleItemLine {
  key: string
  product_id: string
  line_amount: string
  unit_price: string
}

export interface DistributorSaleEditTarget {
  id: string
  label: string
}

interface EditDistributorSaleModalProps {
  open: boolean
  sale: DistributorSaleEditTarget | null
  onClose: () => void
  onSuccess: () => void
}

function newSaleLine(): SaleItemLine {
  return {
    key: crypto.randomUUID(),
    product_id: '',
    line_amount: '',
    unit_price: '',
  }
}

function toPaymentMethodValue(method: string, bankAccountId?: string | null): PaymentMethodValue {
  if (method === 'cash') return 'cash'
  if (method === 'debt') return 'debt'
  if (bankAccountId) return `bank:${bankAccountId}`
  return 'cash'
}

export function EditDistributorSaleModal({
  open,
  sale,
  onClose,
  onSuccess,
}: EditDistributorSaleModalProps) {
  const { data: tenant } = useTenant()
  const supabase = createClient()

  const [distributorId, setDistributorId] = useState('')
  const [commissionPercent, setCommissionPercent] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodValue>('cash')
  const [sourceAccountLabel, setSourceAccountLabel] = useState('')
  const [attachProof, setAttachProof] = useState(false)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [itemLines, setItemLines] = useState<SaleItemLine[]>([newSaleLine()])
  const [loading, setLoading] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  const { data: saleDetail, isLoading: saleLoading } = useQuery({
    queryKey: ['distributor-sale-edit', sale?.id],
    queryFn: async () => {
      if (!sale?.id || !tenant?.id) return null
      const { data, error } = await supabase
        .from('card_distributor_sales')
        .select(
          `id, distributor_id, commission_percent, payment_method, bank_account_id, source_account_label,
          card_sale_items(product_id, paid_quantity, quantity, unit_price)`,
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
    if (!open) {
      setHydrated(false)
      return
    }
    if (!saleDetail) return

    const itemsRaw = saleDetail.card_sale_items as
      | { product_id: string; paid_quantity: number; unit_price: number }[]
      | { product_id: string; paid_quantity: number; unit_price: number }
      | null
    const items = Array.isArray(itemsRaw) ? itemsRaw : itemsRaw ? [itemsRaw] : []

    setDistributorId((saleDetail.distributor_id as string) ?? '')
    setCommissionPercent(String(saleDetail.commission_percent ?? 0))
    setPaymentMethod(
      toPaymentMethodValue(
        (saleDetail.payment_method as string) ?? 'cash',
        saleDetail.bank_account_id as string | null,
      ),
    )
    setSourceAccountLabel((saleDetail.source_account_label as string) ?? '')
    setAttachProof(false)
    setProofFile(null)
    setItemLines(
      items.length > 0
        ? items.map((item) => ({
            key: crypto.randomUUID(),
            product_id: item.product_id,
            line_amount: String(Number(item.paid_quantity) * Number(item.unit_price)),
            unit_price: String(item.unit_price),
          }))
        : [newSaleLine()],
    )
    setHydrated(true)
  }, [open, saleDetail])

  const { data: distributors = [] } = useQuery<DistributorOption[]>({
    queryKey: ['distributors-select', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return []
      const { data, error } = await supabase
        .from('distributors')
        .select('id, name, balance_due')
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
        .order('name')
      if (error) throw error
      return data ?? []
    },
    enabled: open && !!tenant?.id,
  })

  const { data: products = [] } = useQuery<ProductOption[]>({
    queryKey: ['card-products-for-sale', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return []
      const { data, error } = await supabase
        .from('card_products')
        .select('id, name, sale_price, distributor_price, quantity_in_stock')
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
        .order('name')
      if (error) throw error
      return data ?? []
    },
    enabled: open && !!tenant?.id,
  })

  const originalStockByProduct = useMemo(() => {
    const m = new Map<string, number>()
    if (!saleDetail) return m
    const itemsRaw = saleDetail.card_sale_items as
      | { product_id: string; quantity: number }[]
      | { product_id: string; quantity: number }
      | null
    const items = Array.isArray(itemsRaw) ? itemsRaw : itemsRaw ? [itemsRaw] : []
    for (const item of items) {
      const qty = Number(item.quantity)
      if (!Number.isFinite(qty)) continue
      m.set(item.product_id, (m.get(item.product_id) ?? 0) + qty)
    }
    return m
  }, [saleDetail])

  const productMap = useMemo(() => {
    const m = new Map<string, ProductOption>()
    for (const p of products) m.set(p.id, p)
    return m
  }, [products])

  const commission = useMemo(() => {
    const n = commissionPercent.trim() ? Number(commissionPercent) : 0
    return Number.isFinite(n) ? n : 0
  }, [commissionPercent])

  const lineBreakdowns = useMemo(() => {
    return itemLines.map((line) => {
      const amount = Number(line.line_amount)
      const unitPrice = Number(line.unit_price)
      if (!line.product_id || !Number.isFinite(amount) || !Number.isFinite(unitPrice)) {
        return null
      }
      return calcDistributorLineBreakdown(amount, unitPrice, commission)
    })
  }, [itemLines, commission])

  const totalAmount = useMemo(
    () =>
      itemLines.reduce((sum, line) => {
        const amount = Number(line.line_amount)
        return sum + (Number.isFinite(amount) ? amount : 0)
      }, 0),
    [itemLines],
  )

  const totalStockDeduction = useMemo(
    () => lineBreakdowns.reduce((sum, b) => sum + (b?.stockQuantity ?? 0), 0),
    [lineBreakdowns],
  )

  const needsBank = isBankPayment(paymentMethod)

  const handleProductChange = (key: string, productId: string) => {
    const product = productMap.get(productId)
    setItemLines((lines) =>
      lines.map((l) =>
        l.key === key
          ? {
              ...l,
              product_id: productId,
              unit_price: (() => {
                const price = distributorUnitPrice(product ?? {})
                return price != null ? String(price) : l.unit_price
              })(),
            }
          : l,
      ),
    )
  }

  function buildValidItems() {
    const validItems: { product_id: string; line_amount: number; unit_price: number }[] = []

    for (let i = 0; i < itemLines.length; i++) {
      const line = itemLines[i]
      if (!line.product_id || !line.line_amount.trim()) continue

      const lineAmount = Number(line.line_amount)
      const unitPrice = Number(line.unit_price)
      const breakdown = lineBreakdowns[i]

      if (!Number.isFinite(lineAmount) || lineAmount <= 0) {
        throw new Error('المبلغ غير صالح')
      }
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        throw new Error('سعر البطاقة غير صالح')
      }
      if (!breakdown) {
        throw new Error('المبلغ لا يكفي لبطاقة واحدة على الأقل')
      }

      const stock =
        (productMap.get(line.product_id)?.quantity_in_stock ?? 0) +
        (originalStockByProduct.get(line.product_id) ?? 0)
      if (breakdown.stockQuantity > stock) {
        const productName = productMap.get(line.product_id)?.name ?? 'المنتج'
        throw new Error(
          `المخزون غير كافٍ لـ ${productName} — مطلوب ${breakdown.stockQuantity}`,
        )
      }

      validItems.push({
        product_id: line.product_id,
        line_amount: lineAmount,
        unit_price: unitPrice,
      })
    }

    if (validItems.length === 0) {
      throw new Error('أضف صنفاً واحداً على الأقل')
    }

    return validItems
  }

  async function handleSave() {
    if (!tenant || !sale) return

    if (!distributorId) {
      toast.error('اختر الموزع')
      return
    }

    const commissionVal = commissionPercent.trim() ? Number(commissionPercent) : 0
    if (!Number.isFinite(commissionVal) || commissionVal < 0 || commissionVal > 100) {
      toast.error('نسبة العمولة يجب أن تكون بين 0 و 100')
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

    let validItems: { product_id: string; line_amount: number; unit_price: number }[]
    try {
      validItems = buildValidItems()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'بيانات غير صالحة')
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
          `distributor-sale/edit/${sale.id}`,
          proofFile,
        )
      }

      const { error } = await supabase.rpc('correct_distributor_sale', {
        p_sale_id: sale.id,
        p_distributor_id: distributorId,
        p_commission_percent: commissionVal,
        p_payment_method: toDbPaymentMethod(paymentMethod),
        p_bank_account_id: parsed.bankAccountId,
        p_proof_url: proofUrl,
        p_items: validItems,
        p_nonce: crypto.randomUUID(),
        p_source_account_label: sourceAccountLabel.trim() || null,
      })
      if (error) throw error

      toast.success('تم تعديل بيع الموزع')
      onSuccess()
      onClose()
    } catch {
      toast.error('فشل تعديل البيع — تحقق من المخزون والرصيد')
    } finally {
      setLoading(false)
    }
  }

  async function handleVoid() {
    if (!sale) return
    const { error } = await supabase.rpc('void_distributor_sale', {
      p_sale_id: sale.id,
      p_nonce: crypto.randomUUID(),
    })
    if (error) throw error
    toast.success('تم حذف بيع الموزع واسترجاع المخزون')
    onSuccess()
    onClose()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !loading && !v && onClose()}>
        <DialogContent
          dir="rtl"
          className="max-w-[calc(100%-2rem)] sm:max-w-2xl max-h-[90vh] overflow-x-hidden overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>تعديل بيع — {sale?.label ?? ''}</DialogTitle>
          </DialogHeader>

          {saleLoading || !hydrated ? (
            <p className="text-sm text-muted-foreground py-8 text-center">جارٍ التحميل…</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>الموزع *</Label>
                <Select value={distributorId} onValueChange={setDistributorId} disabled={loading}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر من السجل" />
                  </SelectTrigger>
                  <SelectContent>
                    {distributors.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>نسبة العمولة (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={commissionPercent}
                  onChange={(e) => setCommissionPercent(e.target.value)}
                  disabled={loading}
                  dir="ltr"
                  className="text-right"
                />
              </div>

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

              {needsBank && (
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
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>الأصناف</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1 h-7 text-xs"
                    disabled={loading}
                    onClick={() => setItemLines((lines) => [...lines, newSaleLine()])}
                  >
                    <Plus size={12} />
                    صنف
                  </Button>
                </div>
                <div className="space-y-2 rounded-lg border border-border p-3">
                  {itemLines.map((line, index) => {
                    const breakdown = lineBreakdowns[index]
                    return (
                      <div
                        key={line.key}
                        className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_90px_90px_auto] items-end border-b border-border/60 pb-3 last:border-0 last:pb-0"
                      >
                        <Select
                          value={line.product_id}
                          onValueChange={(v) => handleProductChange(line.key, v)}
                          disabled={loading}
                        >
                          <SelectTrigger className="w-full min-w-0">
                            <SelectValue placeholder="منتج" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} (مخزون {p.quantity_in_stock})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="المبلغ"
                          value={line.line_amount}
                          onChange={(e) =>
                            setItemLines((lines) =>
                              lines.map((l) =>
                                l.key === line.key ? { ...l, line_amount: e.target.value } : l,
                              ),
                            )
                          }
                          disabled={loading}
                          dir="ltr"
                          className="text-right"
                        />
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="سعر الموزع"
                          value={line.unit_price}
                          onChange={(e) =>
                            setItemLines((lines) =>
                              lines.map((l) =>
                                l.key === line.key ? { ...l, unit_price: e.target.value } : l,
                              ),
                            )
                          }
                          disabled={loading}
                          dir="ltr"
                          className="text-right"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={loading || itemLines.length <= 1}
                          onClick={() =>
                            setItemLines((lines) => lines.filter((l) => l.key !== line.key))
                          }
                        >
                          <Trash2 size={14} />
                        </Button>
                        {breakdown && (
                          <div className="sm:col-span-4 text-xs text-muted-foreground tabular-nums">
                            يُخصم من المخزون:{' '}
                            <span className="font-semibold text-foreground">
                              {breakdown.stockQuantity}
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-md bg-muted/50 px-3 py-2 text-sm tabular-nums">
                <p>
                  إجمالي المبلغ: <span className="font-semibold">{formatMoney(totalAmount)}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  إجمالي البطاقات من المخزون: {totalStockDeduction.toLocaleString('ar-EG')}
                </p>
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
            <Button onClick={() => void handleSave()} disabled={loading || !hydrated}>
              {loading ? 'جارٍ الحفظ…' : 'حفظ التعديل'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmModal
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        onConfirm={handleVoid}
        recordName={sale?.label ?? 'بيع الموزع'}
        title="تأكيد حذف بيع الموزع"
        confirmKeyword="حذف"
        confirmLabel="تأكيد الحذف"
        consequences="سيُسترجَع المخزون ويُعكَس رصيد الموزع أو الحساب البنكي. لا يمكن التراجع."
      />
    </>
  )
}
