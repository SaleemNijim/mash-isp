'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import ExcelJS from 'exceljs'
import { toast } from 'sonner'
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Clock,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { ExcelTable } from '@/components/excel/ExcelTable'
import {
  detectImportType,
  processImport,
  type ImportType,
  type ImportResult,
  type ImportError,
} from '@/components/excel/ExcelImportEngine'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_IMPORT_TYPES: ImportType[] = [
  'subscribers_payments',
  'broadband_credentials',
  'we_subscribers',
  'bb_subscribers',
  'network_routers',
  'card_inventory',
  'card_distributor_sales',
]

const TYPE_LABELS: Record<ImportType, string> = {
  subscribers_payments:    'مدفوعات المشتركين',
  broadband_credentials:   'بيانات الإنترنت (يوزر / باسورد)',
  we_subscribers:          'مشتركو WE',
  bb_subscribers:          'مشتركو BB',
  network_routers:         'أجهزة الشبكة',
  card_inventory:          'مخزون البطاقات',
  card_distributor_sales:  'مبيعات الموزعين',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImportLog {
  id: string
  file_name: string
  import_type: string
  total: number
  inserted: number
  updated: number
  skipped: number
  errors: ImportError[] | null
  performed_by: string
  created_at: string
}

type Phase = 'idle' | 'parsing' | 'preview' | 'importing' | 'done' | 'error'

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── Page Entry ───────────────────────────────────────────────────────────────

export default function ExcelViewerPage() {
  return (
    <PermissionGuard
      permission="import_excel"
      fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-3">
            <XCircle size={44} className="mx-auto text-red-400" />
            <p className="text-gray-700 font-semibold">لا تملك صلاحية استيراد Excel</p>
            <p className="text-sm text-gray-400">تواصل مع مدير النظام للحصول على الصلاحية</p>
          </div>
        </div>
      }
    >
      <ExcelViewerContent />
    </PermissionGuard>
  )
}

// ─── Main Content ─────────────────────────────────────────────────────────────

function ExcelViewerContent() {
  const { data: tenant } = useTenant()
  const supabase = createClient()

  // ── State ──────────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('idle')
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [workbook, setWorkbook] = useState<ExcelJS.Workbook | null>(null)
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<string[][]>([])
  const [selectedType, setSelectedType] = useState<ImportType | ''>('')
  const [progress, setProgress] = useState(0)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Import history ─────────────────────────────────────────────────────────
  const {
    data: history,
    refetch: refetchHistory,
  } = useQuery<ImportLog[]>({
    queryKey: ['import-history', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return []
      const { data } = await supabase
        .from('imports')
        .select(
          'id,file_name,import_type,total,inserted,updated,skipped,errors,performed_by,created_at',
        )
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(50)
      return (data as ImportLog[]) ?? []
    },
    enabled: !!tenant?.id,
  })

  // ── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current)
    }
  }, [])

  // ── Parse file ─────────────────────────────────────────────────────────────
  const parseFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.xlsx?$/i)) {
      toast.error('يُقبل ملفات Excel فقط (.xlsx أو .xls)')
      return
    }

    setPhase('parsing')
    setFileName(file.name)
    setImportResult(null)
    setImportError(null)
    setProgress(0)

    try {
      const buffer = await file.arrayBuffer()
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)

      const sheet = wb.worksheets[0]
      if (!sheet) throw new Error('الملف لا يحتوي على أي ورقة عمل')

      // Headers from row 1
      const headers: string[] = []
      sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNum) => {
        headers[colNum - 1] = cellToString(cell.value)
      })

      // Data rows 2..N — cap preview at 2 000 rows for responsiveness
      const PREVIEW_LIMIT = 2000
      const dataRows: string[][] = []
      sheet.eachRow((row, rowNum) => {
        if (rowNum === 1 || dataRows.length >= PREVIEW_LIMIT) return
        const r: string[] = []
        for (let c = 1; c <= headers.length; c++) {
          r[c - 1] = cellToString(row.getCell(c).value)
        }
        dataRows.push(r)
      })

      const detected = detectImportType(sheet)

      setWorkbook(wb)
      setPreviewHeaders(headers)
      setPreviewRows(dataRows)
      setSelectedType(detected ?? '')
      setPhase('preview')

      if (detected) {
        toast.success(`تم التعرف على النوع: ${TYPE_LABELS[detected]}`)
      } else {
        toast.warning('لم يُتعرَّف على نوع الملف تلقائياً — اختر النوع يدوياً')
      }
    } catch (err) {
      setPhase('error')
      setImportError(err instanceof Error ? err.message : 'خطأ غير معروف أثناء قراءة الملف')
      toast.error('فشل قراءة الملف')
    }
  }, [])

  // ── Drag & drop ────────────────────────────────────────────────────────────
  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) parseFile(file)
    },
    [parseFile],
  )

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) parseFile(file)
      e.target.value = ''
    },
    [parseFile],
  )

  // ── Inline cell edit → sync to workbook in-memory ─────────────────────────
  const handleCellChange = useCallback(
    (rowIdx: number, colIdx: number, value: string) => {
      setPreviewRows((prev) =>
        prev.map((r, ri) =>
          ri === rowIdx ? r.map((v, ci) => (ci === colIdx ? value : v)) : r,
        ),
      )
      if (workbook) {
        const sheet = workbook.worksheets[0]
        const sheetRow = sheet.getRow(rowIdx + 2) // +2: rows are 1-based, row 1 = headers
        sheetRow.getCell(colIdx + 1).value = value
        sheetRow.commit()
      }
    },
    [workbook],
  )

  // ── CSV export of current preview ─────────────────────────────────────────
  const handleExport = useCallback(() => {
    const lines = [
      previewHeaders.join(','),
      ...previewRows.map((row) =>
        row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','),
      ),
    ]
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(fileName?.replace(/\.xlsx?$/i, '') ?? 'export')}_معاينة.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [previewHeaders, previewRows, fileName])

  // ── Import ─────────────────────────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    if (!workbook || !selectedType || !tenant?.id) return

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      toast.error('يجب تسجيل الدخول أولاً')
      return
    }

    setPhase('importing')
    setProgress(5)

    // Fake progress: ramp slowly to ~88 % while the async call runs
    progressInterval.current = setInterval(() => {
      setProgress((p) => (p < 88 ? p + Math.random() * 4 : p))
    }, 350)

    try {
      const result = await processImport({
        workbook,
        tenantId: tenant.id,
        performedBy: user.id,
        fileName: fileName ?? 'unknown.xlsx',
        supabase,
        importType: selectedType as ImportType,
      })

      clearInterval(progressInterval.current!)
      progressInterval.current = null
      setProgress(100)
      setImportResult(result)
      setPhase('done')
      void refetchHistory()
      toast.success(
        `اكتمل الاستيراد: ${result.inserted} مُضاف · ${result.updated} محدَّث · ${result.skipped} متجاوَز`,
      )
    } catch (err) {
      clearInterval(progressInterval.current!)
      progressInterval.current = null
      setProgress(0)
      setImportError(err instanceof Error ? err.message : 'خطأ غير متوقع أثناء الاستيراد')
      setPhase('error')
      toast.error('فشل الاستيراد')
    }
  }, [workbook, selectedType, tenant, fileName, supabase, refetchHistory])

  // ── Reset ──────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current)
      progressInterval.current = null
    }
    setPhase('idle')
    setFileName(null)
    setWorkbook(null)
    setPreviewHeaders([])
    setPreviewRows([])
    setSelectedType('')
    setProgress(0)
    setImportResult(null)
    setImportError(null)
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────
  const showPreview = phase === 'preview' || phase === 'importing'

  return (
    <div className="space-y-6 max-w-5xl mx-auto" dir="rtl">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">استيراد Excel</h1>
        <p className="text-sm text-gray-500 mt-1">
          ارفع ملف Excel لاستيراد البيانات تلقائياً إلى النظام
        </p>
      </div>

      {/* ── Drop zone ── */}
      <FileDropZone
        dragOver={dragOver}
        setDragOver={setDragOver}
        onDrop={onDrop}
        onFileInput={onFileInput}
        phase={phase}
        fileName={fileName}
        onReset={reset}
      />

      {/* ── Type selector + Import button + Progress bar ── */}
      {showPreview && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Type selector */}
            <div className="flex items-center gap-2 flex-1 min-w-[220px]">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                نوع الاستيراد:
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as ImportType | '')}
                disabled={phase === 'importing'}
                className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="">— اختر نوع الاستيراد —</option>
                {ALL_IMPORT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            {/* Import button */}
            <Button
              onClick={handleImport}
              disabled={!selectedType || phase === 'importing' || !tenant?.id}
              className="gap-2 min-w-[130px]"
            >
              {phase === 'importing' ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  جارٍ الاستيراد…
                </>
              ) : (
                <>
                  <Upload size={14} />
                  بدء الاستيراد
                </>
              )}
            </Button>
          </div>

          {/* Progress bar */}
          {phase === 'importing' && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>يتم معالجة البيانات…</span>
                <span className="tabular-nums">{Math.round(progress)}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Preview table ── */}
      {showPreview && previewHeaders.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">معاينة البيانات</h2>
          <ExcelTable
            headers={previewHeaders}
            rows={previewRows}
            onCellChange={phase === 'preview' ? handleCellChange : undefined}
            onExport={handleExport}
          />
        </div>
      )}

      {/* ── Error banner ── */}
      {phase === 'error' && importError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
          <XCircle size={20} className="text-red-500 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="text-sm font-semibold text-red-700">فشلت العملية</p>
            <p className="text-sm text-red-600">{importError}</p>
            <Button variant="outline" size="sm" onClick={reset}>
              حاول مجدداً
            </Button>
          </div>
        </div>
      )}

      {/* ── Import result summary ── */}
      {phase === 'done' && importResult && (
        <ImportSummary result={importResult} onNewImport={reset} />
      )}

      {/* ── Import history ── */}
      {history && history.length > 0 && (
        <ImportHistory history={history} />
      )}
    </div>
  )
}

// ─── File Drop Zone ───────────────────────────────────────────────────────────

interface FileDropZoneProps {
  dragOver: boolean
  setDragOver: (v: boolean) => void
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void
  phase: Phase
  fileName: string | null
  onReset: () => void
}

function FileDropZone({
  dragOver,
  setDragOver,
  onDrop,
  onFileInput,
  phase,
  fileName,
  onReset,
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const isParsing = phase === 'parsing'

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="منطقة رفع ملف Excel"
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => !isParsing && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !isParsing) inputRef.current?.click()
      }}
      className={[
        'relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed',
        'transition-all py-12 cursor-pointer outline-none',
        dragOver
          ? 'border-blue-400 bg-blue-50'
          : 'border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-mash-page',
        isParsing ? 'cursor-wait' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={onFileInput}
      />

      {isParsing ? (
        <div className="flex flex-col items-center gap-2 text-blue-600">
          <RefreshCw size={34} className="animate-spin" />
          <p className="text-sm font-medium">جارٍ قراءة الملف…</p>
        </div>
      ) : fileName && phase !== 'idle' ? (
        <div className="flex flex-col items-center gap-2 text-gray-700">
          <FileSpreadsheet size={34} className="text-green-600" />
          <p className="text-sm font-medium truncate max-w-[280px] text-center">{fileName}</p>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-gray-400 hover:text-gray-600 h-6 mt-1"
            onClick={(e) => {
              e.stopPropagation()
              onReset()
            }}
          >
            استبدال الملف
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-gray-400">
          <Upload size={34} />
          <p className="text-sm font-medium text-gray-600">
            اسحب ملف Excel هنا أو انقر للاختيار
          </p>
          <p className="text-xs text-gray-400">يدعم .xlsx و .xls</p>
        </div>
      )}
    </div>
  )
}

// ─── Import Summary ───────────────────────────────────────────────────────────

function ImportSummary({
  result,
  onNewImport,
}: {
  result: ImportResult
  onNewImport: () => void
}) {
  const stats = [
    { label: 'إجمالي الصفوف',  value: result.total,    cls: 'text-gray-700 bg-gray-100' },
    { label: 'مُضاف',          value: result.inserted,  cls: 'text-green-700 bg-green-100' },
    { label: 'محدَّث',         value: result.updated,   cls: 'text-blue-700 bg-blue-100' },
    { label: 'متجاوَز',        value: result.skipped,   cls: 'text-amber-700 bg-amber-100' },
  ]

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <CheckCircle2 size={20} className="text-green-500 shrink-0" />
        <h2 className="text-base font-semibold text-gray-900">اكتمل الاستيراد بنجاح</h2>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-xl p-4 text-center ${s.cls}`}>
            <div className="text-2xl font-bold tabular-nums">
              {s.value.toLocaleString('ar-EG')}
            </div>
            <div className="text-xs mt-1 font-medium">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Errors table */}
      {result.errors.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-gray-700">
              الأخطاء ({result.errors.length.toLocaleString('ar-EG')})
            </h3>
          </div>
          <div className="border border-amber-200 rounded-lg overflow-auto max-h-52">
            <table className="w-full text-xs">
              <thead className="bg-amber-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-right font-semibold text-amber-800 border-b border-amber-200 w-16">
                    الصف
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-amber-800 border-b border-amber-200">
                    سبب التجاوز
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.errors.map((err, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-amber-50/40'}>
                    <td className="px-3 py-1.5 text-amber-700 font-mono border-b border-amber-100">
                      {err.row}
                    </td>
                    <td className="px-3 py-1.5 text-gray-600 border-b border-amber-100">
                      {err.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Button onClick={onNewImport} variant="outline" size="sm" className="gap-1.5">
        <Upload size={13} />
        استيراد ملف جديد
      </Button>
    </div>
  )
}

// ─── Import History ───────────────────────────────────────────────────────────

function ImportHistory({ history }: { history: ImportLog[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Clock size={16} className="text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-700">سجل الاستيرادات</h2>
        <Badge variant="secondary" className="text-xs h-5">
          {history.length}
        </Badge>
      </div>

      <div className="overflow-auto rounded-lg border border-gray-100">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-right font-semibold text-gray-600 border-b border-gray-200">
                الملف
              </th>
              <th className="px-3 py-2 text-right font-semibold text-gray-600 border-b border-gray-200">
                النوع
              </th>
              <th className="px-3 py-2 text-right font-semibold text-gray-600 border-b border-gray-200 w-16">
                مُضاف
              </th>
              <th className="px-3 py-2 text-right font-semibold text-gray-600 border-b border-gray-200 w-16">
                محدَّث
              </th>
              <th className="px-3 py-2 text-right font-semibold text-gray-600 border-b border-gray-200 w-16">
                متجاوَز
              </th>
              <th className="px-3 py-2 text-right font-semibold text-gray-600 border-b border-gray-200">
                التاريخ
              </th>
            </tr>
          </thead>
          <tbody>
            {history.map((log, i) => (
              <tr key={log.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                <td
                  className="px-3 py-2 text-gray-700 border-b border-gray-100 max-w-[180px] truncate"
                  title={log.file_name}
                >
                  <span className="flex items-center gap-1.5">
                    <FileSpreadsheet size={12} className="text-green-500 shrink-0" />
                    <span className="truncate">{log.file_name}</span>
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-600 border-b border-gray-100 whitespace-nowrap">
                  {TYPE_LABELS[log.import_type as ImportType] ?? log.import_type}
                </td>
                <td className="px-3 py-2 text-green-700 border-b border-gray-100 font-mono tabular-nums text-center">
                  {log.inserted}
                </td>
                <td className="px-3 py-2 text-blue-700 border-b border-gray-100 font-mono tabular-nums text-center">
                  {log.updated}
                </td>
                <td className="px-3 py-2 text-amber-700 border-b border-gray-100 font-mono tabular-nums text-center">
                  {log.skipped}
                </td>
                <td className="px-3 py-2 text-gray-400 border-b border-gray-100 whitespace-nowrap">
                  {formatDate(log.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
