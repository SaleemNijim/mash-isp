'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface UnsavedChangesDialogProps {
  open: boolean
  onDiscard: () => void
  onCancel: () => void
  onSave: () => void
  saving?: boolean
}

export function UnsavedChangesDialog({
  open,
  onDiscard,
  onCancel,
  onSave,
  saving = false,
}: UnsavedChangesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>تغييرات غير محفوظة</DialogTitle>
          <DialogDescription>
            لديك تعديل لم يُحفظ بعد. هل تريد حفظه قبل المتابعة؟
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            متابعة التعديل
          </Button>
          <Button type="button" variant="destructive" onClick={onDiscard} disabled={saving}>
            تجاهل
          </Button>
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? 'جارٍ الحفظ…' : 'حفظ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
