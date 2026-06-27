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
  getFirstRouterImportSheet,
  getRouterDataStartRow,
  validateRouterSheetHeaders,
  downloadNetworkSinglePortTemplate,
  ROUTER_SHEET_HEADERS,
} from '@/lib/excel/network-routers-template'
import {
  importNetworkRoutersToPort,
  type NetworkImportResult,
} from '@/lib/network/import-network'
import { NetworkImportGuideDialog } from '@/components/network/NetworkImportGuideDialog'
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

interface NetworkImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  targetPort?: { id: string; name: string } | null
}

type Phase = 'idle' | 'parsing' | 'preview' | 'importing' | 'done' | 'error'

interface PreviewRow {
  sheetName: string
  rowNum: number
  cells: string[]
}

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return String(v)
}

export function NetworkImportDialog({
  open,
  onOpenChange,
  onSuccess,
  targetPort,
}: NetworkImportDialogProps) {
  const { data: tenant } = useTenant()
  const supabase = createClient()

  const [phase, setPhase] = useState<Phase>('idle')
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [workbook, setWorkbook] = useState<ExcelJS.Workbook | null>(null)
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [previewCount, setPreviewCount] = useState(0)
  const [importResult, setImportResult] = useState<NetworkImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const colCount = ROUTER_SHEET_HEADERS.length

  const reset = useCallback(() => {
    setPhase('idle')
    setDragOver(false)
    setFileName(null)
    setWorkbook(null)
    setPreviewRows([])
    setPreviewCount(0)
    setImportResult(null)
    setImportError(null)
  }, [])

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  const parseFile = useCallback(
    async (file: File) => {
      if (!file.name.match(/\.xlsx$/i)) {
        toast.error('يُقبل ملفات .xlsx فقط')
        return
      }

      setPhase('parsing')
      setFileName(file.name)
      setImportResult(null)
      setImportError(null)

      try {
        if (!targetPort?.id) {
          throw new Error('اختر بورتاً أولاً من التبويبات ثم ابدأ الاستيراد')
        }

        const buffer = await file.arrayBuffer()
        const wb = new ExcelJS.Workbook()
        await wb.xlsx.load(buffer)

        const sheet = getFirstRouterImportSheet(wb)
        if (!sheet) {
          throw new Error(
            'لم تُعثر على ورقة بيانات — تأكد من وجود «عنوان IP» و«SSID» في صف الترويسة',
          )
        }

        const templateError = validateRouterSheetHeaders(sheet)
        if (templateError) throw new Error(templateError)

        const dataStartRow = getRouterDataStartRow(sheet)
        const dataRows: PreviewRow[] = []
        let totalCount = 0

        sheet.eachRow((row, rowNum) => {
          if (rowNum < dataStartRow) return
          const cells: string[] = []
          for (let c = 1; c <= colCount; c++) {
            cells.push(cellToString(row.getCell(c).value))
          }
          if (!cells.slice(1).some((x) => x)) return
          totalCount++
          if (dataRows.length < 500) {
            dataRows.push({ sheetName: sheet.name, rowNum, cells })
          }
        })

        if (totalCount === 0) throw new Error('لا توجد بيانات للاستيراد')

        setWorkbook(wb)
        setPreviewRows(dataRows)
        setPreviewCount(totalCount)
        setPhase('preview')
        toast.success(`تمت قراءة ${totalCount} صف لـ ${targetPort.name}`)
      } catch (err) {
        setPhase('error')
        setImportError(err instanceof Error ? err.message : 'خطأ في قراءة الملف')
        toast.error('فشل قراءة الملف')
      }
    },
    [colCount, targetPort?.id, targetPort?.name],
  )

  const handleImport = useCallback(async () => {
    if (!workbook || !tenant?.id || !targetPort?.id) return

    setPhase('importing')
    try {
      const sheet = getFirstRouterImportSheet(workbook)
      if (!sheet) throw new Error('لم تُعثر على ورقة بيانات')

      const result = await importNetworkRoutersToPort({
        sheet,
        tenantId: tenant.id,
        portId: targetPort.id,
        portLabel: targetPort.name,
        supabase,
      })

      setImportResult(result)
      setPhase('done')
      onSuccess()
      toast.success(`تم الاستيراد: ${result.inserted} سجل جديد`)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'فشل الاستيراد')
      setPhase('error')
      toast.error('فشل الاستيراد')
    }
  }, [workbook, tenant?.id, targetPort, supabase, onSuccess])

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="flex max-h-[min(90vh,820px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
          dir="rtl"
        >
          <DialogHeader className="shrink-0 border-b px-4 py-4">
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-primary" />
              استيراد راوترات الشبكة
            </DialogTitle>
            <DialogDescription>
              {targetPort
                ? `ملف Excel لراوترات «${targetPort.name}» — ورقة واحدة، الترويسة في الصف 1 أو 3.`
                : 'اختر بورتاً من التبويبات ثم ابدأ الاستيراد.'}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {(phase === 'idle' || phase === 'parsing' || phase === 'error') && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={downloadNetworkSinglePortTemplate}
                  >
                    <Download size={14} />
                    تحميل النموذج
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setGuideOpen(true)}
                  >
                    <HelpCircle size={14} />
                    التعليمات
                  </Button>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOver(true)
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOver(false)
                    const file = e.dataTransfer.files[0]
                    if (file) void parseFile(file)
                  }}
                  className={[
                    'flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 cursor-pointer transition-colors',
                    dragOver
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40',
                  ].join(' ')}
                >
                  {phase === 'parsing' ? (
                    <Loader2 size={32} className="animate-spin text-primary" />
                  ) : (
                    <Upload size={32} className="text-muted-foreground" />
                  )}
                  <p className="text-sm font-medium">اسحب ملف Excel أو انقر للاختيار</p>
                  <p className="text-xs text-muted-foreground text-center max-w-sm">
                    {targetPort
                      ? `الراوترات ستُضاف إلى ${targetPort.name}`
                      : 'اختر بورتاً من الصفحة أولاً'}
                  </p>
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
                  <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    <XCircle size={18} className="shrink-0" />
                    <div>
                      <p className="font-medium">تعذّر قبول الملف</p>
                      <p className="text-xs mt-1">{importError}</p>
                      <Button variant="outline" size="sm" className="mt-2" onClick={reset}>
                        المحاولة مجدداً
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {phase === 'preview' && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2 items-center">
                  <Badge variant="secondary">{fileName}</Badge>
                  <Badge>{previewCount} صف</Badge>
                  {targetPort && <Badge variant="outline">{targetPort.name}</Badge>}
                  <Button variant="ghost" size="sm" onClick={reset}>
                    تغيير الملف
                  </Button>
                </div>
                <div className="max-h-[min(50vh,420px)] overflow-auto rounded-lg border">
                  <table className="mash-data-table text-xs">
                    <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
                      <tr className="border-b">
                        {ROUTER_SHEET_HEADERS.map((h) => (
                          <th
                            key={h}
                            className="px-2 py-2 text-right whitespace-nowrap font-medium"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.slice(0, 40).map((row, i) => (
                        <tr key={i} className="border-b last:border-0">
                          {row.cells.map((cell, j) => (
                            <td key={j} className="px-2 py-1.5 max-w-[140px] truncate">
                              {cell || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {previewCount > 40 && (
                  <p className="text-xs text-muted-foreground">
                    يُعرض أول 40 صفاً من {previewCount} — الاستيراد يشمل الكل
                  </p>
                )}
              </div>
            )}

            {phase === 'importing' && (
              <div className="flex flex-col items-center py-10 gap-3">
                <Loader2 size={36} className="animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">جارٍ الاستيراد…</p>
              </div>
            )}

            {phase === 'done' && importResult && (
              <div className="space-y-4">
                <div className="flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/30">
                  <CheckCircle2 className="text-emerald-600 shrink-0" size={24} />
                  <div className="text-sm">
                    <p className="font-medium">اكتمل الاستيراد</p>
                    <p className="text-muted-foreground mt-1">
                      {importResult.inserted} جديد · {importResult.skipped} متجاوَز ·{' '}
                      {importResult.total} إجمالي
                    </p>
                  </div>
                </div>
                {importResult.errors.length > 0 && (
                  <ul className="max-h-32 overflow-y-auto text-xs border rounded-lg divide-y">
                    {importResult.errors.slice(0, 20).map((e, i) => (
                      <li key={i} className="px-3 py-2">
                        {e.sheet ? `${e.sheet} — ` : ''}صف {e.row}: {e.reason}
                      </li>
                    ))}
                  </ul>
                )}
                {importResult.errors.length > 0 && (
                  <div className="flex items-center gap-2 text-amber-700 text-xs">
                    <AlertTriangle size={14} />
                    بعض الصفوف لم تُضاف — راجع القائمة أعلاه
                  </div>
                )}
              </div>
            )}
          </div>

          {phase === 'preview' && (
            <DialogFooter className="shrink-0 border-t bg-background px-4 py-3">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                إلغاء
              </Button>
              <Button onClick={() => void handleImport()}>
                تأكيد الاستيراد ({previewCount})
              </Button>
            </DialogFooter>
          )}

          {phase === 'done' && importResult && (
            <DialogFooter className="shrink-0 border-t bg-background px-4 py-3">
              <Button variant="outline" onClick={reset}>
                استيراد آخر
              </Button>
              <Button onClick={() => onOpenChange(false)}>إغلاق</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <NetworkImportGuideDialog
        open={guideOpen}
        onOpenChange={setGuideOpen}
        portName={targetPort?.name}
        onStartImport={() => setGuideOpen(false)}
      />
    </>
  )
}
