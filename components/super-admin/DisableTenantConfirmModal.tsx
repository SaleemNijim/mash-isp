'use client'

import { useState } from 'react'
import { Ban } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface DisableTenantConfirmModalProps {
  open: boolean
  tenantName: string | null
  onClose: () => void
  onConfirm: () => Promise<boolean>
}

export function DisableTenantConfirmModal({
  open,
  tenantName,
  onClose,
  onConfirm,
}: DisableTenantConfirmModalProps) {
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
              <Ban className="h-6 w-6 text-destructive" aria-hidden />
            </div>
            <DialogTitle className="font-medium text-mash-text">تأكيد تعطيل الشركة</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-3 text-sm text-mash-text-secondary leading-relaxed">
          <p>
            هل أنت متأكد من تعطيل شركة{' '}
            <strong className="font-medium text-mash-text">{tenantName}</strong>؟
          </p>
          <p className="rounded-lg border border-mash-border bg-mash-page p-3 text-xs text-mash-text-muted">
            لن يتمكن مستخدموها من الدخول إلى النظام حتى يتم إعادة تفعيل الشركة.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          <Button variant="destructive" onClick={() => void handleConfirm()} disabled={loading}>
            {loading ? 'جارٍ التعطيل...' : 'تأكيد التعطيل'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
