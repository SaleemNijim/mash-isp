'use client'

import { useEffect, useState } from 'react'
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

export type WarehouseMovementType = 'receive' | 'issue' | 'damaged' | 'installed'

export interface WarehouseItemTarget {
  id: string
  name: string
  quantity: number
}

export const MOVEMENT_TYPE_LABELS: Record<WarehouseMovementType, string> = {
  receive: 'استلام',
  issue: 'إخراج',
  damaged: 'تالف',
  installed: 'مُركَّب',
}

interface MovementModalProps {
  open: boolean
  item: WarehouseItemTarget | null
  movementType: WarehouseMovementType | null
  onClose: () => void
  onSuccess: () => void
}

export function MovementModal({
  open,
  item,
  movementType,
  onClose,
  onSuccess,
}: MovementModalProps) {
  const supabase = createClient()
  const [quantity, setQuantity] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setQuantity('')
    setNotes('')
  }, [open, item?.id, movementType])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!item || !movementType) return

    const qty = Number(quantity)
    if (!Number.isInteger(qty) || qty <= 0) {
      toast.error('الكمية يجب أن تكون عدداً صحيحاً موجباً')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.rpc('record_warehouse_movement', {
        p_item_id: item.id,
        p_movement_type: movementType,
        p_quantity: qty,
        p_notes: notes.trim() || null,
      })

      if (error) throw error

      toast.success(
        `تم تسجيل ${MOVEMENT_TYPE_LABELS[movementType]} — ${qty.toLocaleString('ar-EG')} وحدة`,
      )
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'فشل تسجيل الحركة. يرجى المحاولة مرة أخرى.'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const typeLabel = movementType ? MOVEMENT_TYPE_LABELS[movementType] : ''

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {typeLabel} — {item?.name ?? ''}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {item && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <span className="text-muted-foreground">الرصيد الحالي: </span>
                <strong className="tabular-nums">
                  {item.quantity.toLocaleString('ar-EG')} وحدة
                </strong>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="movement-qty">الكمية</Label>
              <Input
                id="movement-qty"
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="أدخل الكمية"
                disabled={loading}
                dir="ltr"
                className="text-left tabular-nums"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="movement-notes">ملاحظات (اختياري)</Label>
              <Input
                id="movement-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات إضافية…"
                disabled={loading}
                dir="rtl"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              إلغاء
            </Button>
            <Button type="submit" disabled={loading || !item || !movementType}>
              {loading ? 'جارٍ الحفظ…' : `تأكيد ${typeLabel}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
