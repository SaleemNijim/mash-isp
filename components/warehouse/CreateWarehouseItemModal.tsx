'use client'

import { useEffect, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import {
  isRpcMissingWarehouse,
  WAREHOUSE_RPC_HINT,
  type WarehouseUnit,
} from '@/lib/warehouse/units'
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

interface CreateWarehouseItemModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function CreateWarehouseItemModal({
  open,
  onClose,
  onSuccess,
}: CreateWarehouseItemModalProps) {
  const supabase = createClient()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [unit, setUnit] = useState<WarehouseUnit>('piece')
  const [minQuantity, setMinQuantity] = useState('0')
  const [initialQuantity, setInitialQuantity] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setName('')
    setCategory('')
    setUnit('piece')
    setMinQuantity('0')
    setInitialQuantity('')
    setNotes('')
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('اسم الصنف مطلوب')
      return
    }

    const minQty = minQuantity.trim() ? Number(minQuantity) : 0
    const initialQty = initialQuantity.trim() ? Number(initialQuantity) : 0

    if (!Number.isFinite(minQty) || minQty < 0) {
      toast.error('الحد الأدنى غير صالح')
      return
    }

    if (!Number.isFinite(initialQty) || initialQty < 0) {
      toast.error('الكمية الافتتاحية غير صالحة')
      return
    }

    if (unit === 'piece') {
      if (!Number.isInteger(minQty) || !Number.isInteger(initialQty)) {
        toast.error('وحدة «قطعة» تتطلب أعداداً صحيحة')
        return
      }
    }

    setLoading(true)
    try {
      const { error } = await supabase.rpc('create_warehouse_item', {
        p_name: name.trim(),
        p_category: category.trim() || null,
        p_unit: unit,
        p_min_quantity: minQty,
        p_notes: notes.trim() || null,
        p_initial_quantity: initialQty,
      })

      if (error) throw error

      toast.success('تمت إضافة الصنف')
      onSuccess()
      onClose()
    } catch (err) {
      const pgErr = err as PostgrestError
      const msg = pgErr.message ?? ''
      if (isRpcMissingWarehouse(msg)) {
        toast.error(WAREHOUSE_RPC_HINT)
      } else {
        toast.error(msg || 'فشلت الإضافة')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle>إضافة صنف للمستودع</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="wh-name">اسم الصنف *</Label>
              <Input
                id="wh-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: RG-45 · سلك CAT6 · وصلات"
                disabled={loading}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wh-category">التصنيف</Label>
                <Input
                  id="wh-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="كابلات · وصلات · أدوات"
                  disabled={loading}
                />
              </div>
              <div className="space-y-1.5">
                <Label>وحدة القياس *</Label>
                <Select
                  value={unit}
                  onValueChange={(v) => setUnit(v as WarehouseUnit)}
                  disabled={loading}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="piece">قطعة (عدد)</SelectItem>
                    <SelectItem value="meter">متر (طول)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wh-min">الحد الأدنى للتنبيه</Label>
                <Input
                  id="wh-min"
                  type="number"
                  min={0}
                  step={unit === 'meter' ? '0.001' : '1'}
                  value={minQuantity}
                  onChange={(e) => setMinQuantity(e.target.value)}
                  dir="ltr"
                  className="text-right tabular-nums"
                  disabled={loading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wh-initial">كمية افتتاحية (استلام)</Label>
                <Input
                  id="wh-initial"
                  type="number"
                  min={0}
                  step={unit === 'meter' ? '0.001' : '1'}
                  value={initialQuantity}
                  onChange={(e) => setInitialQuantity(e.target.value)}
                  placeholder="0"
                  dir="ltr"
                  className="text-right tabular-nums"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wh-notes">ملاحظات الصنف</Label>
              <textarea
                id="wh-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="مثال: RG للكابل UTP · مقاس 5e · لون أزرق"
                disabled={loading}
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              إلغاء
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'جارٍ الحفظ…' : 'إضافة الصنف'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
