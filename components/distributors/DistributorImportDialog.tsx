'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import ExcelJS from 'exceljs'
import { toast } from 'sonner'
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import {
  DISTRIBUTORS_TEMPLATE,
  downloadDistributorTemplate,
  getDistributorSheet,
  validateDistributorTemplate,
} from '@/lib/excel/distributors-template'
import {
  processImport,
  type ImportError,
  type ImportResult,
} from '@/components/excel/ExcelImportEngine'
import { DistributorImportGuideDialog } from '@/components/distributors/DistributorImportGuideDialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface DistributorImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

type Phase = 'idle' | 'parsing' | 'preview' | 'importing' | 'done' | 'error'

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>
    if ('result' in obj) return cellToString(obj.result)
    if ('richText' in obj) {
      return (obj.richText as Array<{ text: string }>).map((rt) => rt.text).join('').trim()
    }
    if ('text' in obj) return String(obj.text ?? '').trim()
  }
  return ''
}

export function DistributorImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: DistributorImportDialogProps) {
  const { data: tenant } = useTenant()
  const supabase = createClient()

  const [phase, setPhase] = useState<Phase>('idle')
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [workbook, setWorkbook] = useState<ExcelJS.Workbook | null>(null)
  const [previewRows, setPreviewRows] = useState<string[][]>([])
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setPhase('idle')
    setDragOver(false)
    setFileName(null)
    setWorkbook(null)
    setPreviewRows([])
    setImportResult(null)
    setImportError(null)
  }, [])

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  const parseFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.xlsx$/i)) {
      toast.error('يُقبل ملفات .xlsx فقط — احفظ الملف من Excel بالصيغة الصحيحة')
      return
    }

    setPhase('parsing')
    setFileName(file.name)
    setImportResult(null)
    setImportError(null)

    try {
      const buffer = await file.arrayBuffer()
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)

      const sheet = getDistributorSheet(wb)
      if (!sheet) throw new Error('الملف لا يحتوي على ورقة عمل')

      const templateError = validateDistributorTemplate(sheet)
      if (templateError) throw new Error(templateError)

      const dataRows: string[][] = []
      const PREVIEW_LIMIT = 500
      sheet.eachRow((row, rowNum) => {
        if (rowNum === 1 || dataRows.length >= PREVIEW_LIMIT) return
        const name = cellToString(row.getCell(1).value)
        const phone = cellToString(row.getCell(2).value)
        const address = cellToString(row.getCell(3).value)
        const notes = cellToString(row.getCell(4).value)
        if (!name && !phone && !address && !notes) return
        dataRows.push([name, phone, address, notes])
      })

      if (dataRows.length === 0) {
        throw new Error('الملف لا يحتوي على بيانات موزعين — أضف صفوفاً من الصف الثاني')
      }

      setWorkbook(wb)
      setPreviewRows(dataRows)
      setPhase('preview')
      toast.success(`تمت قراءة ${dataRows.length} صف — راجع المعاينة ثم أكّد الاستيراد`)
    } catch (err) {
      setPhase('error')
      setImportError(err instanceof Error ? err.message : 'خطأ غير معروف أثناء قراءة الملف')
      toast.error('فشل قراءة الملف')
    }
  }, [])

  const handleImport = useCallback(async () => {
    if (!workbook || !tenant?.id) return

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      toast.error('يجب تسجيل الدخول أولاً')
      return
    }

    setPhase('importing')
    try {
      const result = await processImport({
        workbook,
        tenantId: tenant.id,
        performedBy: user.id,
        fileName: fileName ?? 'distributors.xlsx',
        supabase,
        importType: 'distributors',
      })

      setImportResult(result)
      setPhase('done')
      onSuccess()
      toast.success(`تم الاستيراد: ${result.inserted} موزع جديد`)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'خطأ غير متوقع أثناء الاستيراد')
      setPhase('error')
      toast.error('فشل الاستيراد')
    }
  }, [workbook, tenant?.id, fileName, supabase, onSuccess])

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) void parseFile(file)
    },
    [parseFile],
  )

  const rowCount = previewRows.length

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <FileSpreadsheet size={18} className="text-primary" />
                  استيراد الموزعين من Excel
                </DialogTitle>
                <DialogDescription className="mt-1">
                  استخدم النموذج الرسمي فقط — الأعمدة ثابتة ولا تقبل تعديلاً.
                </DialogDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 gap-1 text-muted-foreground"
                onClick={() => setGuideOpen(true)}
              >
                <HelpCircle size={14} />
                التعليمات
              </Button>
            </div>
          </DialogHeader>

          {(phase === 'idle' || phase === 'parsing' || phase === 'error') && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={downloadDistributorTemplate}
                >
                  <Download size={14} />
                  تحميل النموذج الفارغ
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground"
                  onClick={() => setGuideOpen(true)}
                >
                  <HelpCircle size={14} />
                  كيف أستخدم النموذج؟
                </Button>
              </div>

              <div
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={[
                  'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors cursor-pointer',
                  dragOver
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-muted/30',
                  phase === 'parsing' ? 'pointer-events-none opacity-60' : '',
                ].join(' ')}
              >
                {phase === 'parsing' ? (
                  <>
                    <Loader2 size={32} className="animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">جارٍ قراءة الملف...</p>
                  </>
                ) : (
                  <>
                    <Upload size={32} className="text-muted-foreground" />
                    <div className="text-center space-y-1">
                      <p className="text-sm font-medium">اسحب ملف Excel هنا أو انقر للاختيار</p>
                      <p className="text-xs text-muted-foreground">صيغة .xlsx — ورقة «{DISTRIBUTORS_TEMPLATE.sheetName}»</p>
                    </div>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void parseFile(file)
                    e.target.value = ''
                  }}
                />
              </div>

              {phase === 'error' && importError && (
                <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive">
                  <XCircle size={18} className="shrink-0 mt-0.5" />
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">تعذّر قبول الملف</p>
                    <p className="text-xs opacity-90">{importError}</p>
                    <Button type="button" variant="outline" size="sm" className="mt-2" onClick={reset}>
                      المحاولة مجدداً
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {phase === 'preview' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{fileName}</Badge>
                <Badge>{rowCount} صف للمراجعة</Badge>
                <Button type="button" variant="ghost" size="sm" onClick={reset}>
                  تغيير الملف
                </Button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="mash-data-table">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      {DISTRIBUTORS_TEMPLATE.headers.map((h) => (
                        <th key={h} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(0, 50).map((row, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                        {row.map((cell, j) => (
                          <td key={j} className="px-3 py-2 text-right max-w-[180px] truncate">
                            {cell || <span className="text-muted-foreground">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewRows.length > 50 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground border-t">
                    يُعرض أول 50 صف — سيُستورد الكل ({previewRows.length} صف)
                  </p>
                )}
              </div>

              <DialogFooter className="sm:justify-between gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  إلغاء
                </Button>
                <Button type="button" onClick={() => void handleImport()}>
                  تأكيد الاستيراد ({rowCount})
                </Button>
              </DialogFooter>
            </div>
          )}

          {phase === 'importing' && (
            <div className="flex flex-col items-center gap-3 py-10">
              <Loader2 size={36} className="animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">جارٍ إضافة الموزعين...</p>
            </div>
          )}

          {phase === 'done' && importResult && (
            <ImportResultView result={importResult} onClose={() => onOpenChange(false)} onReset={reset} />
          )}
        </DialogContent>
      </Dialog>

      <DistributorImportGuideDialog
        open={guideOpen}
        onOpenChange={setGuideOpen}
        onStartImport={() => {
          setGuideOpen(false)
        }}
      />
    </>
  )
}

function ImportResultView({
  result,
  onClose,
  onReset,
}: {
  result: ImportResult
  onClose: () => void
  onReset: () => void
}) {
  const hasErrors = result.errors.length > 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
        <CheckCircle2 size={28} className="text-emerald-600 shrink-0" />
        <div>
          <p className="font-medium text-emerald-900 dark:text-emerald-100">اكتمل الاستيراد</p>
          <p className="text-sm text-emerald-800/80 dark:text-emerald-200/80 mt-0.5">
            {result.inserted} موزع جديد · {result.skipped} صف متجاوَز · {result.total} إجمالي الصفوف
          </p>
        </div>
      </div>

      {hasErrors && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <AlertTriangle size={16} />
            <p className="text-sm font-medium">صفوف لم تُضاف ({result.errors.length})</p>
          </div>
          <ul className="max-h-40 overflow-y-auto rounded-lg border border-border text-xs divide-y">
            {result.errors.slice(0, 30).map((err: ImportError, i) => (
              <li key={i} className="px-3 py-2 flex gap-2">
                <span className="text-muted-foreground shrink-0">صف {err.row}</span>
                <span>{err.reason}</span>
              </li>
            ))}
            {result.errors.length > 30 && (
              <li className="px-3 py-2 text-muted-foreground">... و{result.errors.length - 30} أخطاء أخرى</li>
            )}
          </ul>
        </div>
      )}

      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onReset}>
          استيراد ملف آخر
        </Button>
        <Button type="button" onClick={onClose}>
          إغلاق
        </Button>
      </DialogFooter>
    </div>
  )
}
