'use client'

import { useCallback, useRef, useState } from 'react'
import ExcelJS from 'exceljs'
import { toast } from 'sonner'
import { Upload, FileSpreadsheet, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { processImport, type ImportResult } from '@/components/excel/ExcelImportEngine'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface PppImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function PppImportDialog({ open, onOpenChange, onSuccess }: PppImportDialogProps) {
  const { data: tenant } = useTenant()
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const reset = useCallback(() => {
    setFileName(null)
    setResult(null)
    setImporting(false)
  }, [])

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const runImport = async (file: File) => {
    if (!tenant?.id) return
    setImporting(true)
    setResult(null)
    try {
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await file.arrayBuffer())
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Unauthorized')

      const importResult = await processImport({
        workbook: wb,
        tenantId: tenant.id,
        performedBy: user.id,
        fileName: file.name,
        supabase,
        importType: 'broadband_credentials',
      })
      setResult(importResult)
      if (importResult.inserted > 0) {
        toast.success(`تم استيراد ${importResult.inserted} username`)
        onSuccess()
      } else {
        toast.warning('لم يُستورد أي سجل')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل الاستيراد')
    } finally {
      setImporting(false)
    }
  }

  const onFile = (file: File | null) => {
    if (!file) return
    setFileName(file.name)
    void runImport(file)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>استيراد usernames PPP من Excel</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm text-muted-foreground">
          <p>الأعمدة المتوقعة: <strong className="text-foreground">username</strong>،{' '}
            <strong className="text-foreground">password</strong>،{' '}
            <strong className="text-foreground">package</strong> (السرعة/الباقة)</p>
          <p>صفوف القالب (<code dir="ltr">username</code> / <code dir="ltr">password</code>) تُتجاهل تلقائياً.</p>
          <p>كل package في Excel = باقة مستقلة (بالاسم الكامل) — لا يُدمج باقات بنفس السرعة.</p>
        </div>

        <button
          type="button"
          disabled={importing}
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-8 hover:bg-muted/30 transition-colors"
        >
          {importing ? (
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          ) : (
            <Upload className="h-8 w-8 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">
            {importing ? 'جارٍ الاستيراد…' : 'اختر ملف Excel (.xlsx)'}
          </span>
          {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />

        {result && (
          <div className="rounded-md border border-border bg-muted/20 p-3 text-sm space-y-1">
            <p className="flex items-center gap-2">
              <FileSpreadsheet size={16} />
              إجمالي الصفوف: {result.total} — مُستورد: {result.inserted} — متخطى: {result.skipped}
            </p>
            {result.errors.length > 0 && (
              <ul className="text-xs text-amber-800 max-h-32 overflow-y-auto list-disc pr-4">
                {result.errors.slice(0, 8).map((e, i) => (
                  <li key={i}>صف {e.row}: {e.reason}</li>
                ))}
                {result.errors.length > 8 && (
                  <li>… و{result.errors.length - 8} أخطاء أخرى</li>
                )}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={importing}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
