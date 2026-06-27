'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Archive, OctagonAlert } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type RecordDeleteMode = 'keep_data' | 'with_data'

interface RecordDeleteOptionsModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (mode: RecordDeleteMode) => Promise<void>
  recordName: string
  entityLabel: string
  keepDataDescription: string
  withDataDescription: string
}

const DEFAULT_CONFIRM_KEYWORD = 'حذف'

export function RecordDeleteOptionsModal({
  open,
  onClose,
  onConfirm,
  recordName,
  entityLabel,
  keepDataDescription,
  withDataDescription,
}: RecordDeleteOptionsModalProps) {
  const [mode, setMode] = useState<RecordDeleteMode>('keep_data')
  const [input, setInput] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isPermanent = mode === 'with_data'
  const confirmed = input === DEFAULT_CONFIRM_KEYWORD

  useEffect(() => {
    if (open) {
      setMode('keep_data')
      setInput('')
      setError(null)
    }
  }, [open])

  const handleConfirm = async () => {
    if (!confirmed || isDeleting) return

    setIsDeleting(true)
    setError(null)
    try {
      await onConfirm(mode)
      setInput('')
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setError(
        msg && msg !== 'delete_failed'
          ? msg
          : 'فشلت عملية الحذف. يرجى المحاولة مرة أخرى.',
      )
      setInput('')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleOpenChange = (next: boolean) => {
    if (isDeleting) return
    if (!next) {
      setInput('')
      setError(null)
      onClose()
    }
  }

  const Icon = isPermanent ? AlertTriangle : Archive

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        dir="rtl"
        className="max-w-md gap-0 overflow-hidden p-0 bg-white border-[#D1E8E2]"
        showCloseButton={!isDeleting}
      >
        <div
          className={cn(
            'px-6 pt-6 pb-4 border-b',
            isPermanent ? 'border-destructive/15 bg-[#FCEBEB]/60' : 'border-[#FAEEDA] bg-[#FAEEDA]/50',
          )}
        >
          <DialogHeader className="space-y-3 text-right">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
                  isPermanent ? 'bg-destructive/15 text-destructive' : 'bg-amber-100 text-amber-700',
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1 space-y-1 pt-0.5">
                <DialogTitle className="text-base font-semibold text-foreground text-right">
                  حذف {entityLabel}
                </DialogTitle>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  اختر نوع الحذف ثم أكّد بكتابة «{DEFAULT_CONFIRM_KEYWORD}».
                </p>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="rounded-xl border border-[#D1E8E2] bg-[#F8FFFE] px-4 py-3 text-sm">
            <p className="text-foreground">
              <span className="text-muted-foreground">السجل: </span>
              <strong className="font-semibold">{recordName}</strong>
            </p>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setMode('keep_data')}
              className={cn(
                'w-full rounded-xl border px-4 py-3 text-right transition-colors',
                mode === 'keep_data'
                  ? 'border-amber-400 bg-amber-50/80 ring-1 ring-amber-300/60'
                  : 'border-[#D1E8E2] bg-white hover:bg-muted/30',
              )}
            >
              <p className="text-sm font-semibold text-foreground">إخفاء مع الإبقاء على البيانات</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {keepDataDescription}
              </p>
            </button>

            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setMode('with_data')}
              className={cn(
                'w-full rounded-xl border px-4 py-3 text-right transition-colors',
                mode === 'with_data'
                  ? 'border-destructive/40 bg-destructive/5 ring-1 ring-destructive/20'
                  : 'border-[#D1E8E2] bg-white hover:bg-muted/30',
              )}
            >
              <p className="text-sm font-semibold text-destructive">حذف نهائي مع كل البيانات</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {withDataDescription}
              </p>
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3"
            >
              <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
              <p className="text-sm font-medium leading-relaxed text-destructive">{error}</p>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="record-delete-confirm-input" className="text-sm text-foreground">
              للتأكيد، اكتب{' '}
              <strong className="font-semibold text-destructive">{DEFAULT_CONFIRM_KEYWORD}</strong>
            </label>
            <Input
              id="record-delete-confirm-input"
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                if (error) setError(null)
              }}
              placeholder={DEFAULT_CONFIRM_KEYWORD}
              disabled={isDeleting}
              dir="rtl"
              autoComplete="off"
              aria-invalid={input.length > 0 && !confirmed}
              className={cn(
                'h-10 text-right bg-background',
                isPermanent
                  ? 'focus-visible:border-destructive/50 focus-visible:ring-destructive/15'
                  : 'focus-visible:border-amber-500/50 focus-visible:ring-amber-500/15',
                input.length > 0 && !confirmed && 'border-destructive/40',
              )}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 border-t border-[#D1E8E2] bg-[#F8FFFE] px-6 py-4 sm:justify-start">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isDeleting}
            className="min-w-[88px]"
          >
            إلغاء
          </Button>
          <Button
            variant={isPermanent ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={!confirmed || isDeleting}
            className={cn(
              'min-w-[120px] font-medium',
              isPermanent &&
                confirmed &&
                'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm',
              !isPermanent &&
                confirmed &&
                'bg-amber-600 text-white hover:bg-amber-700 border-amber-600',
              !confirmed && 'opacity-50',
            )}
          >
            {isDeleting
              ? 'جارٍ التنفيذ…'
              : isPermanent
                ? 'تأكيد الحذف النهائي'
                : 'تأكيد الإخفاء'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
