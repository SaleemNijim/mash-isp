'use client'

import { useState } from 'react'
import { UserX } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface SuspendUserConfirmModalProps {
  open: boolean
  employeeName: string | null
  onClose: () => void
  onConfirm: () => Promise<boolean>
}

export function SuspendUserConfirmModal({
  open,
  employeeName,
  onClose,
  onConfirm,
}: SuspendUserConfirmModalProps) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    if (loading) return
    setLoading(true)
    try {
      const ok = await onConfirm()
      if (ok) onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!loading && !next) onClose()
      }}
    >
      <DialogContent dir="rtl" className="max-w-md bg-mash-surface" showCloseButton={!loading}>
        <DialogHeader>
          <div className="flex flex-col items-center gap-3 pt-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-mash-danger-bg">
              <UserX className="h-6 w-6 text-destructive" aria-hidden />
            </div>
            <DialogTitle className="font-medium text-mash-text">تأكيد تعليق الحساب</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-3 text-sm text-mash-text-secondary leading-relaxed">
          <p>
            هل أنت متأكد من تعليق حساب{' '}
            <strong className="font-medium text-mash-text">{employeeName}</strong>؟
          </p>
          <p className="rounded-lg border border-mash-border bg-mash-page p-3 text-xs text-mash-text-muted">
            سيتم تسجيل خروجه فوراً، ولن يتمكن من الدخول حتى يتم إلغاء التعليق.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          <Button variant="destructive" onClick={() => void handleConfirm()} disabled={loading}>
            {loading ? 'جارٍ التعليق...' : 'تأكيد التعليق'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
