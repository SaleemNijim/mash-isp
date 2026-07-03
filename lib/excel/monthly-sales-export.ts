import ExcelJS from 'exceljs'

export interface MonthlySalesExportRow {
  created_at: string
  kind: 'retail' | 'distributor'
  description: string
  quantity: number | null
  unit_price: number | null
  discount_percent: number | null
  total_amount: number
  payment_method: string | null
  debtor_name: string | null
  notes: string | null
}

const HEADERS = [
  'م',
  'التاريخ',
  'الوقت',
  'النوع',
  'الوصف',
  'الكمية',
  'سعر الوحدة',
  'خصم %',
  'المبلغ',
  'طريقة الدفع',
  'المدين',
  'ملاحظات',
] as const

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
}

function setCurrency(cell: ExcelJS.Cell, value: number | null): void {
  cell.value = value ?? 0
  cell.numFmt = '#,##0.00'
}

function styleHeader(row: ExcelJS.Row): void {
  row.height = 24
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Tajawal' }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F6E56' },
    }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD1E8E2' } },
      right: { style: 'thin', color: { argb: 'FFD1E8E2' } },
      bottom: { style: 'thin', color: { argb: 'FFD1E8E2' } },
      left: { style: 'thin', color: { argb: 'FFD1E8E2' } },
    }
  })
}

function kindLabel(kind: MonthlySalesExportRow['kind']): string {
  return kind === 'retail' ? 'تجزئة' : 'موزع'
}

export function getMonthlySalesFileName(month: string): string {
  const [year, mon] = month.split('-')
  if (year && mon) return `سجل_المبيعات_${mon}-${year}.xlsx`
  return `سجل_المبيعات_${month}.xlsx`
}

export function summarizeMonthlySales(rows: MonthlySalesExportRow[]): {
  retailTotal: number
  retailCount: number
  distributorTotal: number
  distributorCount: number
  grandTotal: number
} {
  let retailTotal = 0
  let retailCount = 0
  let distributorTotal = 0
  let distributorCount = 0

  for (const row of rows) {
    if (row.kind === 'retail') {
      retailTotal += row.total_amount
      retailCount += 1
    } else {
      distributorTotal += row.total_amount
      distributorCount += 1
    }
  }

  return {
    retailTotal,
    retailCount,
    distributorTotal,
    distributorCount,
    grandTotal: retailTotal + distributorTotal,
  }
}

export async function buildMonthlySalesWorkbookBuffer(options: {
  companyName: string
  month: string
  rows: MonthlySalesExportRow[]
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'MASH ISP'
  workbook.created = new Date()

  const summary = summarizeMonthlySales(options.rows)
  const sheet = workbook.addWorksheet(`سجل المبيعات ${options.month}`, {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 5 }],
  })

  sheet.mergeCells(1, 1, 1, HEADERS.length)
  const title = sheet.getCell(1, 1)
  title.value = `${options.companyName} — سجل المبيعات ${options.month}`
  title.font = { bold: true, size: 16, color: { argb: 'FF0F6E56' }, name: 'Tajawal' }
  title.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(1).height = 28

  const summaryRow = sheet.addRow([
    `تجزئة: ${summary.retailCount} عملية — ${summary.retailTotal.toFixed(2)} ₪ | موزعون: ${summary.distributorCount} عملية — ${summary.distributorTotal.toFixed(2)} ₪ | الإجمالي: ${summary.grandTotal.toFixed(2)} ₪`,
  ])
  sheet.mergeCells(2, 1, 2, HEADERS.length)
  summaryRow.getCell(1).font = { name: 'Tajawal', size: 11, color: { argb: 'FF334155' } }
  summaryRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(2).height = 22

  sheet.addRow([])
  const headerRow = sheet.addRow([...HEADERS])
  styleHeader(headerRow)

  options.rows.forEach((item, index) => {
    const row = sheet.addRow([
      index + 1,
      formatDate(item.created_at),
      formatTime(item.created_at),
      kindLabel(item.kind),
      item.description,
      item.quantity ?? '',
      item.unit_price ?? '',
      item.discount_percent ?? '',
      null,
      item.payment_method ?? '',
      item.debtor_name ?? '',
      item.notes ?? '',
    ])

    setCurrency(row.getCell(9), item.total_amount)
    if (item.unit_price != null) setCurrency(row.getCell(7), item.unit_price)

    row.eachCell((cell) => {
      cell.font = { name: 'Tajawal' }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFEAF5F2' } },
        right: { style: 'thin', color: { argb: 'FFEAF5F2' } },
        bottom: { style: 'thin', color: { argb: 'FFEAF5F2' } },
        left: { style: 'thin', color: { argb: 'FFEAF5F2' } },
      }
    })
  })

  sheet.columns = [
    { width: 6 },
    { width: 12 },
    { width: 10 },
    { width: 10 },
    { width: 28 },
    { width: 8 },
    { width: 12 },
    { width: 8 },
    { width: 12 },
    { width: 14 },
    { width: 18 },
    { width: 24 },
  ]

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}
