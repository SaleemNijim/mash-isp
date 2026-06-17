'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface DeleteConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  recordName: string
  consequences?: string
}

const CONFIRM_KEYWORD = 'حذف'

export function DeleteConfirmModal({
  open,
  onClose,
  onConfirm,
  recordName,
  consequences,
}: DeleteConfirmModalProps) {
  const [input, setInput] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  const confirmed = input === CONFIRM_KEYWORD

  const handleConfirm = async () => {
    if (!confirmed || isDeleting) return

    setIsDeleting(true)
    try {
      await onConfirm()
      setInput('')
      onClose()
    } catch {
      toast.error('فشلت عملية الحذف. يرجى المحاولة مرة أخرى.')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleOpenChange = (next: boolean) => {
    if (isDeleting) return
    if (!next) {
      setInput('')
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent dir="rtl" className="max-w-md bg-mash-surface" showCloseButton={!isDeleting}>
        <DialogHeader>
          <div className="flex flex-col items-center gap-3 pt-2">
            <div className="w-12 h-12 rounded-full bg-mash-danger-bg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-destructive" aria-hidden />
            </div>
            <DialogTitle className="text-mash-text font-medium">تأكيد الحذف</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-mash-border bg-mash-page p-3 text-sm">
            <p className="text-mash-text">
              أنت على وشك حذف:{' '}
              <strong className="font-medium">{recordName}</strong>
            </p>
            {consequences && (
              <p className="mt-1 text-xs text-mash-text-muted">{consequences}</p>
            )}
            <p className="mt-1 text-xs text-mash-text-muted">
              العملية قابلة للمراجعة عبر سجل التدقيق — لن يُحذف السجل نهائياً.
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-sm text-mash-text-secondary">
              للتأكيد، اكتب{' '}
              <strong className="text-destructive">{CONFIRM_KEYWORD}</strong>{' '}
              في الحقل أدناه:
            </p>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`اكتب "${CONFIRM_KEYWORD}" للتأكيد`}
              disabled={isDeleting}
              dir="rtl"
              className="text-right"
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isDeleting}
          >
            إلغاء
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!confirmed || isDeleting}
            className={!confirmed ? 'opacity-50' : ''}
          >
            {isDeleting ? 'جارٍ الحذف…' : 'تأكيد الحذف'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
