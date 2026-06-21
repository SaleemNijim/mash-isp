'use client'

import { useEffect, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { type CardBatchRow } from '@/lib/cards/types'
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

interface EditBatchModalProps {
  open: boolean
  batch: CardBatchRow | null
  categoryLabel?: string
  quantityLabel?: string
  onClose: () => void
  onSuccess: () => void
}

export function EditBatchModal({
  open,
  batch,
  categoryLabel,
  quantityLabel,
  onClose,
  onSuccess,
}: EditBatchModalProps) {
  const supabase = createClient()
  const [batchNumber, setBatchNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !batch) return
    setBatchNumber(batch.batch_number?.trim() ?? '')
    setNotes(batch.notes?.trim() ?? '')
  }, [open, batch])

  async function handleSave() {
    if (!batch) return

    const trimmedNumber = batchNumber.trim()
    if (!trimmedNumber) {
      toast.error('رقم الدفعة مطلوب')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase
        .from('card_batches')
        .update({
          batch_number: trimmedNumber,
          notes: notes.trim() || null,
        })
        .eq('id', batch.id)

      if (error) throw error

      toast.success('تم تحديث الدفعة')
      onSuccess()
      onClose()
    } catch (err) {
      const pgErr = err as PostgrestError
      if (pgErr.code === '23505') {
        toast.error(`رقم الدفعة «${trimmedNumber}» مستخدم مسبقاً`)
      } else {
        toast.error('فشل التحديث. يرجى المحاولة مرة أخرى.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>تعديل دفعة</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {(categoryLabel || quantityLabel) && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground space-y-1">
              {categoryLabel && <p>الفئة: {categoryLabel}</p>}
              {quantityLabel && <p>الكمية: {quantityLabel}</p>}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>رقم الدفعة *</Label>
            <Input
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              disabled={saving}
              dir="ltr"
              className="text-right tabular-nums"
            />
          </div>

          <div className="space-y-1.5">
            <Label>ملاحظات</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={saving}
              rows={3}
              dir="rtl"
              placeholder="اختياري — مثل: موزع أحمد، تاريخ التوريد…"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'جارٍ الحفظ…' : 'حفظ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
