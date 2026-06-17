'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
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
  card_type: string | null
}

type PaymentMethod = 'cash' | 'debt' | 'reflect' | 'jawwal_pay' | 'bank'

interface RetailCardSaleModalProps {
  open: boolean
  saleType: 'daily' | 'monthly'
  onClose: () => void
  onSuccess: () => void
}

export function RetailCardSaleModal({
  open,
  saleType,
  onClose,
  onSuccess,
}: RetailCardSaleModalProps) {
  const { data: tenant } = useTenant()
  const supabase = createClient()

  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitPrice, setUnitPrice] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [bankAccountId, setBankAccountId] = useState<string | null>(null)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const title = saleType === 'daily' ? 'بيع بطاقات يومية' : 'بيع بطاقات شهرية'

  useEffect(() => {
    if (!open) return
    setProductId('')
    setQuantity('1')
    setUnitPrice('')
    setPaymentMethod('cash')
    setBankAccountId(null)
    setProofFile(null)
    setNotes('')
  }, [open, saleType])

  const { data: products = [] } = useQuery<ProductOption[]>({
    queryKey: ['card-products-retail', tenant?.id, saleType],
    queryFn: async () => {
      if (!tenant?.id) return []
      const { data, error } = await supabase
        .from('card_products')
        .select('id, name, sale_price, quantity_in_stock, card_type')
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
        .order('name')
      if (error) throw error
      return (data ?? []).filter(
        (p) => p.card_type === saleType || p.card_type === 'other' || !p.card_type,
      )
    },
    enabled: open && !!tenant?.id,
  })

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId],
  )

  useEffect(() => {
    if (selectedProduct?.sale_price != null) {
      setUnitPrice(String(selectedProduct.sale_price))
    }
  }, [selectedProduct])

  const total = useMemo(() => {
    const q = Number(quantity)
    const p = Number(unitPrice)
    if (!Number.isFinite(q) || !Number.isFinite(p)) return 0
    return q * p
  }, [quantity, unitPrice])

  async function handleSubmit() {
    if (!tenant) return
    if (!productId) {
      toast.error('اختر المنتج')
      return
    }

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

    const stock = selectedProduct?.quantity_in_stock ?? 0
    if (qty > stock) {
      toast.error('الكمية تتجاوز المخزون')
      return
    }

    if (requiresPaymentProof(paymentMethod) && !bankAccountId) {
      toast.error('اختر حساباً بنكياً')
      return
    }
    if (requiresPaymentProof(paymentMethod) && !proofFile) {
      toast.error('يجب إرفاق إشعار الدفع')
      return
    }

    setLoading(true)
    try {
      let proofUrl: string | null = null
      if (requiresPaymentProof(paymentMethod) && proofFile) {
        proofUrl = await uploadPaymentProof(
          supabase,
          tenant.id,
          `retail/${saleType}`,
          proofFile,
        )
      }

      const { error } = await supabase.rpc('sell_retail_cards', {
        p_product_id: productId,
        p_quantity: qty,
        p_unit_price: price,
        p_sale_type: saleType,
        p_method: paymentMethod,
        p_bank_account_id: requiresPaymentProof(paymentMethod) ? bankAccountId : null,
        p_notes: notes.trim() || null,
        p_proof_url: proofUrl,
        p_nonce: crypto.randomUUID(),
      })
      if (error) throw error

      toast.success('تم تسجيل البيع بنجاح')
      onSuccess()
      onClose()
    } catch {
      toast.error('فشلت عملية البيع')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>المنتج</Label>
            <Select value={productId} onValueChange={setProductId} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder="اختر بطاقة" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — مخزون: {p.quantity_in_stock}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
                className="text-right"
              />
            </div>
            <div className="space-y-1.5">
              <Label>سعر الوحدة</Label>
              <Input
                type="number"
                min={0}
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                disabled={loading}
                dir="ltr"
                className="text-right"
              />
            </div>
          </div>

          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            الإجمالي:{' '}
            <span className="font-semibold tabular-nums">
              {total.toLocaleString('ar-EG')} ج.م
            </span>
          </div>

          <div className="space-y-1.5">
            <Label>طريقة الدفع</Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">نقدي</SelectItem>
                <SelectItem value="debt">دين</SelectItem>
                <SelectItem value="reflect">Reflect</SelectItem>
                <SelectItem value="jawwal_pay">Jawwal Pay</SelectItem>
                <SelectItem value="bank">تحويل بنكي</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {requiresPaymentProof(paymentMethod) && (
            <>
              <AccountSelector value={bankAccountId} onChange={setBankAccountId} />
              <PaymentProofUpload
                file={proofFile}
                onChange={setProofFile}
                disabled={loading}
                required
              />
            </>
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
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={loading}>
            {loading ? 'جارٍ التسجيل...' : 'تسجيل البيع'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
