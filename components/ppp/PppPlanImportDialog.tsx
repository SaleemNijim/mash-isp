'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Upload, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { parsePppCredentialExcel } from '@/lib/ppp/excel-import'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface PppPlanImportDialogProps {
  open: boolean
  planId: string
  planName: string
  onClose: () => void
  onSuccess: () => void
}

function autoBatchNumber(planName: string): string {
  const date = new Date().toISOString().slice(0, 10)
  const suffix = String(Date.now()).slice(-4)
  const safe = planName.replace(/\s+/g, '-').slice(0, 24)
  return `${safe}-${date}-${suffix}`
}

export function PppPlanImportDialog({
  open,
  planId,
  planName,
  onClose,
  onSuccess,
}: PppPlanImportDialogProps) {
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  async function handleFile(file: File) {
    setImporting(true)
    setFileName(file.name)
    try {
      const parsed = await parsePppCredentialExcel(await file.arrayBuffer())
      if (parsed.rows.length === 0) {
        toast.error('لم يُعثر على usernames صالحة في الملف')
        return
      }

      const p_rows = parsed.rows.map((r) => ({
        username: r.username,
        password: r.password || null,
        type: 'bb',
        is_used: r.is_used,
      }))

      const { error } = await supabase.rpc('receive_ppp_batch', {
        p_plan_id: planId,
        p_batch_number: autoBatchNumber(planName),
        p_notes: `استيراد Excel: ${file.name}`,
        p_rows,
      })
      if (error) throw error

      toast.success(`تم استيراد ${parsed.rows.length} username إلى «${planName}»`)
      if (parsed.errors.length > 0 || parsed.skipped > 0) {
        toast.warning(`تُرك ${parsed.skipped + parsed.errors.length} صف`)
      }
      onSuccess()
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      toast.error('فشل الاستيراد', {
        description: message || 'خطأ غير معروف',
      })
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !importing && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>استيراد usernames — {planName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            ملف Excel بعمودي <strong className="text-foreground">username</strong> و{' '}
            <strong className="text-foreground">password</strong>.
          </p>
          <p>كل username يُضاف إلى فئة «{planName}» — المدة 30 يوم عند الربط بالمشترك.</p>
        </div>

        <button
          type="button"
          disabled={importing}
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-6 hover:bg-muted/30"
        >
          {importing ? (
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          ) : (
            <Upload className="h-7 w-7 text-muted-foreground" />
          )}
          <span className="text-sm">{importing ? 'جارٍ الاستيراد…' : 'اختر ملف Excel (.xlsx)'}</span>
          {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
            e.target.value = ''
          }}
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={importing}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
