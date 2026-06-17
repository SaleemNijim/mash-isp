'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { AccountSelector } from '@/components/subscriptions/AccountSelector'
import { PaymentProofUpload } from '@/components/shared/PaymentProofUpload'
import {
  uploadPaymentProof,
  requiresPaymentProof,
} from '@/lib/payment-proof'
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
  quantity: string
  unit_price: string
}

type PayMethod = 'cash' | 'debt' | 'reflect' | 'jawwal_pay' | 'bank'

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
    quantity: '',
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
  const [paymentMethod, setPaymentMethod] = useState<PayMethod>('cash')
  const [bankAccountId, setBankAccountId] = useState<string | null>(null)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [itemLines, setItemLines] = useState<SaleItemLine[]>([newSaleLine()])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setDistributorId(preselectedDistributorId ?? '')
    setCommissionPercent('0')
    setPaymentMethod('cash')
    setBankAccountId(null)
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
        .select('id, name, sale_price, quantity_in_stock')
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

  const lineSubtotals = useMemo(() => {
    return itemLines.map((line) => {
      const qty = Number(line.quantity)
      const price = Number(line.unit_price)
      if (!Number.isFinite(qty) || !Number.isFinite(price)) return 0
      return qty * price
    })
  }, [itemLines])

  const totalAmount = useMemo(
    () => lineSubtotals.reduce((sum, n) => sum + n, 0),
    [lineSubtotals],
  )

  const needsBank = requiresPaymentProof(paymentMethod)
  const needsProof = requiresPaymentProof(paymentMethod)

  const handleProductChange = (key: string, productId: string) => {
    const product = productMap.get(productId)
    setItemLines((lines) =>
      lines.map((l) =>
        l.key === key
          ? {
              ...l,
              product_id: productId,
              unit_price:
                product?.sale_price != null ? String(product.sale_price) : l.unit_price,
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

    if (needsBank && !bankAccountId) {
      toast.error('الدفع عبر التطبيق يتطلب اختيار حساب بنكي')
      return
    }

    if (needsProof && !proofFile) {
      toast.error('يجب إرفاق إشعار الدفع')
      return
    }

    const validItems = itemLines
      .filter((l) => l.product_id && l.quantity.trim())
      .map((l) => ({
        product_id: l.product_id,
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
      }))

    if (validItems.length === 0) {
      toast.error('أضف صنفاً واحداً على الأقل')
      return
    }

    for (const item of validItems) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        toast.error('الكمية غير صالحة')
        return
      }
      const stock = productMap.get(item.product_id)?.quantity_in_stock ?? 0
      if (item.quantity > stock) {
        toast.error('الكمية تتجاوز المخزون')
        return
      }
    }

    setLoading(true)
    try {
      let proofUrl: string | null = null
      if (needsProof && proofFile) {
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
        p_payment_method: paymentMethod,
        p_bank_account_id: needsBank ? bankAccountId : null,
        p_proof_url: proofUrl,
        p_items: validItems,
        p_nonce: crypto.randomUUID(),
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
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>بيع بطاقات لموزع</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
            <div className="space-y-1.5">
              <Label>طريقة الدفع</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as PayMethod)}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">نقدي</SelectItem>
                  <SelectItem value="debt">على الحساب (دين)</SelectItem>
                  <SelectItem value="reflect">Reflect</SelectItem>
                  <SelectItem value="jawwal_pay">Jawwal Pay</SelectItem>
                  <SelectItem value="bank">تحويل بنكي</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {needsBank && (
            <AccountSelector
              value={bankAccountId}
              onChange={setBankAccountId}
              disabled={loading}
            />
          )}

          {needsProof && (
            <PaymentProofUpload
              file={proofFile}
              onChange={setProofFile}
              disabled={loading}
              required
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
              {itemLines.map((line, idx) => (
                <div
                  key={line.key}
                  className="grid gap-2 sm:grid-cols-[1fr_80px_90px_auto] items-end"
                >
                  <Select
                    value={line.product_id}
                    onValueChange={(v) => handleProductChange(line.key, v)}
                    disabled={loading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="منتج" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.quantity_in_stock})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    placeholder="كمية"
                    value={line.quantity}
                    onChange={(e) =>
                      setItemLines((lines) =>
                        lines.map((l) =>
                          l.key === line.key ? { ...l, quantity: e.target.value } : l,
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
                    placeholder="سعر"
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
                  {idx === 0 && (
                    <p className="sm:col-span-4 text-xs text-muted-foreground">
                      الإجمالي: {totalAmount.toLocaleString('ar-EG')} ج.م
                    </p>
                  )}
                </div>
              ))}
            </div>
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
