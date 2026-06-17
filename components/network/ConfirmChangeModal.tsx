'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
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

export interface MacChangeTarget {
  id: string
  name: string
  mac_address: string | null
}

interface ConfirmChangeModalProps {
  open: boolean
  target: MacChangeTarget | null
  onClose: () => void
  /** Must throw on failure — modal stays open and shows toast.error */
  onConfirm: (newMac: string) => Promise<void>
}

const CONFIRM_KEYWORD = 'تأكيد'

export function ConfirmChangeModal({
  open,
  target,
  onClose,
  onConfirm,
}: ConfirmChangeModalProps) {
  const [newMac, setNewMac] = useState('')
  const [confirmInput, setConfirmInput] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setNewMac('')
    setConfirmInput('')
  }, [open, target?.id])

  const trimmedMac = newMac.trim()
  const unchanged =
    trimmedMac === (target?.mac_address ?? '').trim() ||
    trimmedMac.length === 0
  const confirmed = confirmInput === CONFIRM_KEYWORD
  const canSubmit = !unchanged && confirmed && !saving

  const handleConfirm = async () => {
    if (!canSubmit) return

    setSaving(true)
    try {
      await onConfirm(trimmedMac)
      setNewMac('')
      setConfirmInput('')
      onClose()
    } catch {
      toast.error('فشل تغيير عنوان MAC. يرجى المحاولة مرة أخرى.')
    } finally {
      setSaving(false)
    }
  }

  const handleOpenChange = (next: boolean) => {
    if (saving) return
    if (!next) {
      setNewMac('')
      setConfirmInput('')
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent dir="rtl" className="max-w-md" showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>تغيير عنوان MAC</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            الجهاز:{' '}
            <strong className="text-foreground">{target?.name ?? '—'}</strong>
          </p>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-blue-800">MAC الحالي</span>
              <code dir="ltr" className="font-mono text-xs bg-white px-2 py-1 rounded border">
                {target?.mac_address || '—'}
              </code>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-blue-800">MAC الجديد</span>
              <code dir="ltr" className="font-mono text-xs bg-white px-2 py-1 rounded border">
                {trimmedMac || '—'}
              </code>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-mac">عنوان MAC الجديد</Label>
            <Input
              id="new-mac"
              value={newMac}
              onChange={(e) => setNewMac(e.target.value)}
              placeholder="AA:BB:CC:DD:EE:FF"
              dir="ltr"
              className="font-mono text-left"
              disabled={saving}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-sm text-muted-foreground">
              للتأكيد، اكتب{' '}
              <strong className="text-foreground">{CONFIRM_KEYWORD}</strong>{' '}
              في الحقل أدناه:
            </p>
            <Input
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={`اكتب "${CONFIRM_KEYWORD}" للتأكيد`}
              disabled={saving}
              dir="rtl"
              className="text-right"
              autoComplete="off"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            يُسجَّل التغيير تلقائياً في سجل MAC — لا حاجة لإدخال يدوي.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={saving}
          >
            إلغاء
          </Button>
          <Button onClick={handleConfirm} disabled={!canSubmit}>
            {saving ? 'جارٍ الحفظ…' : 'تأكيد التغيير'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
