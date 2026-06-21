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
import { CardPriceBreakdown } from '@/components/cards/CardPriceBreakdown'

interface ProductOption {
  id: string
  name: string
  sale_price: number | null
  quantity_in_stock: number
  card_type: string | null
}

function retailSaleType(cardType: string | null | undefined): 'daily' | 'monthly' {
  return cardType === 'monthly' ? 'monthly' : 'daily'
}

interface RetailCardSaleModalProps {
  open: boolean
  productId: string
  productName: string
  cardType: string | null
  onClose: () => void
  onSuccess: () => void
}

export function RetailCardSaleModal({
  open,
  productId: fixedProductId,
  productName,
  cardType,
  onClose,
  onSuccess,
}: RetailCardSaleModalProps) {
  const { data: tenant } = useTenant()
  const supabase = createClient()
  const saleType = retailSaleType(cardType)

  const [quantity, setQuantity] = useState('1')
  const [unitPrice, setUnitPrice] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodValue>('cash')
  const [sourceAccountLabel, setSourceAccountLabel] = useState('')
  const [attachProof, setAttachProof] = useState(false)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setQuantity('1')
    setUnitPrice('')
    setPaymentMethod('cash')
    setSourceAccountLabel('')
    setAttachProof(false)
    setProofFile(null)
    setNotes('')
  }, [open, fixedProductId])

  const { data: product } = useQuery<ProductOption | null>({
    queryKey: ['card-product-retail', tenant?.id, fixedProductId],
    queryFn: async () => {
      if (!tenant?.id || !fixedProductId) return null
      const { data, error } = await supabase
        .from('card_products')
        .select('id, name, sale_price, quantity_in_stock, card_type')
        .eq('tenant_id', tenant.id)
        .eq('id', fixedProductId)
        .eq('is_deleted', false)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: open && !!tenant?.id && !!fixedProductId,
  })

  useEffect(() => {
    if (product?.sale_price != null) {
      setUnitPrice(String(product.sale_price))
    }
  }, [product])

  async function handleSubmit() {
    if (!tenant || !fixedProductId) return

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

    const stock = product?.quantity_in_stock ?? 0
    if (qty > stock) {
      toast.error('الكمية تتجاوز المخزون')
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

    setLoading(true)
    try {
      let proofUrl: string | null = null
      if (attachProof && proofFile) {
        proofUrl = await uploadPaymentProof(
          supabase,
          tenant.id,
          `retail/${saleType}`,
          proofFile,
        )
      }

      const { error } = await supabase.rpc('sell_retail_cards', {
        p_product_id: fixedProductId,
        p_quantity: qty,
        p_unit_price: price,
        p_sale_type: saleType,
        p_method: toDbPaymentMethod(paymentMethod),
        p_bank_account_id: parsed.bankAccountId,
        p_notes: notes.trim() || null,
        p_proof_url: proofUrl,
        p_batch_id: null,
        p_nonce: crypto.randomUUID(),
        p_source_account_label: sourceAccountLabel.trim() || null,
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
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>بيع — {productName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">الفئة: </span>
            <span className="font-medium">{productName}</span>
            <span className="text-muted-foreground mx-2">·</span>
            <span className="text-muted-foreground">المخزون: </span>
            <span className="font-medium tabular-nums">
              {(product?.quantity_in_stock ?? 0).toLocaleString('ar-EG')}
            </span>
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
                className="text-right tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label>سعر البيع</Label>
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

          <CardPriceBreakdown
            listPrice={product?.sale_price}
            unitPrice={unitPrice}
            quantity={quantity}
          />

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
            {loading ? 'جارٍ التسجيل…' : 'تسجيل البيع'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
