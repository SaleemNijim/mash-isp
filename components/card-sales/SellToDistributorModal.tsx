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

interface SellToDistributorModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  preselectedDistributorId?: string | null
}

function newSaleLine(): SaleItemLine {
  return {
    key: crypto.randomUUID(),
    product_id: '',
    line_amount: '',
    unit_price: '',
  }
}

export function SellToDistributorModal({
  open,
  onClose,
  onSuccess,
  preselectedDistributorId,
}: SellToDistributorModalProps) {
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

  useEffect(() => {
    if (!open) return
    setDistributorId(preselectedDistributorId ?? '')
    setCommissionPercent('0')
    setPaymentMethod('cash')
    setSourceAccountLabel('')
    setAttachProof(false)
    setProofFile(null)
    setItemLines([newSaleLine()])
  }, [open, preselectedDistributorId])

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

  const selectedDistributor = useMemo(
    () => distributors.find((d) => d.id === distributorId),
    [distributors, distributorId],
  )

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

  async function handleSubmit() {
    if (!tenant) return

    if (!distributorId) {
      toast.error('اختر الموزع من السجل — لا يُضاف موزع جديد من هنا')
      return
    }

    const commission = commissionPercent.trim() ? Number(commissionPercent) : 0
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) {
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

    const parsed = parsePaymentMethodValue(paymentMethod)
    const validItems: {
      product_id: string
      line_amount: number
      unit_price: number
    }[] = []

    for (let i = 0; i < itemLines.length; i++) {
      const line = itemLines[i]
      if (!line.product_id || !line.line_amount.trim()) continue

      const lineAmount = Number(line.line_amount)
      const unitPrice = Number(line.unit_price)
      const breakdown = lineBreakdowns[i]

      if (!Number.isFinite(lineAmount) || lineAmount <= 0) {
        toast.error('المبلغ غير صالح')
        return
      }
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        toast.error('سعر البطاقة غير صالح')
        return
      }
      if (!breakdown) {
        toast.error('المبلغ لا يكفي لبطاقة واحدة على الأقل')
        return
      }

      const stock = productMap.get(line.product_id)?.quantity_in_stock ?? 0
      if (breakdown.stockQuantity > stock) {
        const productName = productMap.get(line.product_id)?.name ?? 'المنتج'
        toast.error(
          `المخزون غير كافٍ لـ ${productName} — مطلوب ${breakdown.stockQuantity} (${breakdown.paidQuantity} مدفوع + ${breakdown.bonusQuantity} عمولة)`,
        )
        return
      }

      validItems.push({
        product_id: line.product_id,
        line_amount: lineAmount,
        unit_price: unitPrice,
      })
    }

    if (validItems.length === 0) {
      toast.error('أضف صنفاً واحداً على الأقل')
      return
    }

    setLoading(true)
    try {
      let proofUrl: string | null = null
      if (attachProof && proofFile) {
        proofUrl = await uploadPaymentProof(
          supabase,
          tenant.id,
          `distributor-sale/${distributorId}`,
          proofFile,
        )
      }

      const { error } = await supabase.rpc('sell_cards', {
        p_distributor_id: distributorId,
        p_commission_percent: commission,
        p_payment_method: toDbPaymentMethod(paymentMethod),
        p_bank_account_id: parsed.bankAccountId,
        p_proof_url: proofUrl,
        p_items: validItems,
        p_nonce: crypto.randomUUID(),
        p_source_account_label: sourceAccountLabel.trim() || null,
      })
      if (error) throw error

      toast.success('تم تسجيل البيع للموزع')
      onSuccess()
      onClose()
    } catch {
      toast.error('فشلت عملية البيع')
    } finally {
      setLoading(false)
    }
  }

  if (distributors.length === 0 && open) {
    return (
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>بيع لموزع</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            لا يوجد موزعون في السجل. يضيفهم مدير الشركة من صفحة «الموزعون».
          </p>
          <Button onClick={onClose}>حسناً</Button>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && !v && onClose()}>
      <DialogContent
        dir="rtl"
        className="max-w-[calc(100%-2rem)] sm:max-w-2xl max-h-[90vh] overflow-x-hidden overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>بيع بطاقات لموزع</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
            أدخل <strong className="text-foreground">المبلغ المدفوع</strong> وسعر البطاقة — النظام
            يحسب البطاقات المدفوعة ثم يضيف بطاقات العمولة ويخصم المجموع من المخزون.
            مثال: 100 ج.م بسعر 2 وبعمولة 10% = 50 مدفوع + 5 عمولة = 55 من المخزون.
          </div>

          <div className="space-y-1.5">
            <Label>الموزع *</Label>
            <Select
              value={distributorId}
              onValueChange={setDistributorId}
              disabled={loading || !!preselectedDistributorId}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر من السجل" />
              </SelectTrigger>
              <SelectContent>
                {distributors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                    {d.balance_due > 0
                      ? ` — مستحق: ${Number(d.balance_due).toLocaleString('ar-EG')} ج.م`
                      : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedDistributor && selectedDistributor.balance_due > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                رصيد مستحق على الموزع:{' '}
                {Number(selectedDistributor.balance_due).toLocaleString('ar-EG')} ج.م
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
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
                const stock = line.product_id
                  ? (productMap.get(line.product_id)?.quantity_in_stock ?? 0)
                  : 0
                const stockLow =
                  breakdown != null && breakdown.stockQuantity > stock

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
                        {products.map((p) => {
                          const distPrice = distributorUnitPrice(p)
                          return (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} (مخزون {p.quantity_in_stock}
                              {distPrice != null
                                ? ` · موزع ${distPrice.toLocaleString('ar-EG')}`
                                : ''}
                              {p.sale_price != null
                                ? ` · تجزئة ${p.sale_price.toLocaleString('ar-EG')}`
                                : ''}
                              )
                            </SelectItem>
                          )
                        })}
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
                      <div className="sm:col-span-4 text-xs">
                        <p className="text-muted-foreground tabular-nums">
                          مدفوع:{' '}
                          <span className="font-medium text-foreground">
                            {breakdown.paidQuantity}
                          </span>
                          {' · '}
                          عمولة ({commission}%):{' '}
                          <span className="font-medium text-foreground">
                            {breakdown.bonusQuantity}
                          </span>
                          {' · '}
                          يُخصم من المخزون:{' '}
                          <span
                            className={`font-semibold ${stockLow ? 'text-destructive' : 'text-foreground'}`}
                          >
                            {breakdown.stockQuantity}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm space-y-1 tabular-nums">
            <p>
              إجمالي المبلغ المدفوع:{' '}
              <span className="font-semibold">{formatMoney(totalAmount)}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              إجمالي البطاقات المخصومة من المخزون:{' '}
              {totalStockDeduction.toLocaleString('ar-EG')}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={loading}>
            {loading ? 'جارٍ التنفيذ…' : 'تأكيد البيع'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
