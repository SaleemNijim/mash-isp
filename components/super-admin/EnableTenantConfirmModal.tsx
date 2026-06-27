'use client'

import { useState } from 'react'
import { Zap } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface EnableTenantConfirmModalProps {
  open: boolean
  tenantName: string | null
  onClose: () => void
  onConfirm: () => Promise<boolean>
}

export function EnableTenantConfirmModal({
  open,
  tenantName,
  onClose,
  onConfirm,
}: EnableTenantConfirmModalProps) {
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
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-50">
              <Zap className="h-6 w-6 text-primary-800" aria-hidden />
            </div>
            <DialogTitle className="font-medium text-mash-text">إعادة تفعيل الشركة</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-3 text-sm text-mash-text-secondary leading-relaxed">
          <p>
            هل تريد إعادة تفعيل شركة{' '}
            <strong className="font-medium text-mash-text">{tenantName}</strong>؟
          </p>
          <p className="rounded-lg border border-mash-border bg-mash-page p-3 text-xs text-mash-text-muted">
            سيتمكن مستخدموها من الدخول مجدداً إذا كان الاشتراك ما زال سارياً. إن كان
            الاشتراك منتهياً، استخدم «تفعيل اشتراك» لتمديده مع إعادة التفعيل.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={loading}>
            {loading ? 'جارٍ التفعيل...' : 'تأكيد إعادة التفعيل'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
