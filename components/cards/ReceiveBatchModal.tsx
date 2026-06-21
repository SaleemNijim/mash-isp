'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
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
}

interface ReceiveBatchModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function ReceiveBatchModal({ open, onClose, onSuccess }: ReceiveBatchModalProps) {
  const supabase = createClient()
  const [batchNumber, setBatchNumber] = useState('')
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [notes, setNotes] = useState('')
  const [receiving, setReceiving] = useState(false)

  useEffect(() => {
    if (!open) return
    setBatchNumber('')
    setProductId('')
    setQuantity('')
    setNotes('')
  }, [open])

  const { data: products = [], isLoading: loadingProducts } = useQuery<ProductOption[]>({
    queryKey: ['card-products-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('card_products')
        .select('id, name')
        .eq('is_deleted', false)
        .order('name')
      if (error) throw error
      return data ?? []
    },
    enabled: open,
  })

  async function handleReceive() {
    if (!batchNumber.trim()) {
      toast.error('رقم الدفعة مطلوب')
      return
    }

    if (!productId) {
      toast.error('اختر فئة البطاقة')
      return
    }

    const qty = Number(quantity)
    if (!Number.isInteger(qty) || qty <= 0) {
      toast.error('عدد البطاقات يجب أن يكون عدداً صحيحاً موجباً')
      return
    }

    setReceiving(true)
    try {
      const { error } = await supabase.rpc('receive_card_batch', {
        p_batch_number: batchNumber.trim(),
        p_supplier: null,
        p_notes: notes.trim() || null,
        p_items: [{ product_id: productId, quantity: qty }],
      })
      if (error) throw error

      toast.success(`تم استلام ${qty.toLocaleString('ar-EG')} بطاقة — المخزون يُحدَّث تلقائياً`)
      onSuccess()
      onClose()
    } catch {
      toast.error('فشل استلام الدفعة. تحقق من رقم الدفعة والفئة.')
    } finally {
      setReceiving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !receiving && !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>استلام دفعة بطاقات</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            استلام دفعة يزيد مخزون الفئة المختارة — مثلاً 5000 بطاقة يومية.
          </p>

          {products.length === 0 && !loadingProducts && (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-md px-3 py-2">
              لا توجد فئات — أضف فئة من تبويب «الفئات» أولاً.
            </p>
          )}

          <div className="space-y-1.5">
            <Label>رقم الدفعة *</Label>
            <Input
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              placeholder="مثل: B-2024-15"
              disabled={receiving}
              dir="ltr"
              className="text-right"
            />
          </div>

          <div className="space-y-1.5">
            <Label>فئة البطاقة *</Label>
            <Select
              value={productId}
              onValueChange={setProductId}
              disabled={receiving || products.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر فئة مسجّلة" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>عدد البطاقات *</Label>
            <Input
              type="number"
              min={1}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="مثل: 5000"
              disabled={receiving}
              dir="ltr"
              className="text-right tabular-nums"
            />
          </div>

          <div className="space-y-1.5">
            <Label>ملاحظات</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={receiving}
              rows={3}
              dir="rtl"
              placeholder="اختياري — مثل: موزع أحمد، تاريخ التوريد…"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={receiving}>
            إلغاء
          </Button>
          <Button
            onClick={() => void handleReceive()}
            disabled={receiving || products.length === 0}
          >
            {receiving ? 'جارٍ الاستلام…' : 'تأكيد الاستلام'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
