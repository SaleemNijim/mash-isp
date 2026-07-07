import ExcelJS from 'exceljs'

export interface MonthlyExpenseExportRow {
  paid_at: string
  category_name: string
  amount: number
  method_label: string
  bank_account_label: string | null
  source_account_label: string | null
  description: string | null
  beneficiary: string | null
  notes: string | null
}

const HEADERS = [
  'م',
  'التاريخ',
  'الوقت',
  'الفئة',
  'المبلغ',
  'طريقة الصرف',
  'الحساب البنكي',
  'الحساب الصادر',
  'الوصف',
  'المستفيد',
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

function setCurrency(cell: ExcelJS.Cell, value: number): void {
  cell.value = value
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

export function getMonthlyExpensesFileName(month: string): string {
  const [year, mon] = month.split('-')
  if (year && mon) return `سجل_المصروفات_${mon}-${year}.xlsx`
  return `سجل_المصروفات_${month}.xlsx`
}

export function summarizeMonthlyExpenses(rows: MonthlyExpenseExportRow[]): {
  cashTotal: number
  cashCount: number
  bankTotal: number
  bankCount: number
  grandTotal: number
} {
  let cashTotal = 0
  let cashCount = 0
  let bankTotal = 0
  let bankCount = 0

  for (const row of rows) {
    const amount = Number(row.amount) || 0
    if (row.method_label === 'نقدي') {
      cashTotal += amount
      cashCount += 1
    } else {
      bankTotal += amount
      bankCount += 1
    }
  }

  return {
    cashTotal,
    cashCount,
    bankTotal,
    bankCount,
    grandTotal: cashTotal + bankTotal,
  }
}

export async function buildMonthlyExpensesWorkbookBuffer(options: {
  companyName: string
  month: string
  rows: MonthlyExpenseExportRow[]
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'MASH ISP'
  workbook.created = new Date()

  const summary = summarizeMonthlyExpenses(options.rows)
  const sheet = workbook.addWorksheet(`سجل المصروفات ${options.month}`, {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 5 }],
  })

  sheet.mergeCells(1, 1, 1, HEADERS.length)
  const title = sheet.getCell(1, 1)
  title.value = `${options.companyName} — سجل المصروفات ${options.month}`
  title.font = { bold: true, size: 16, color: { argb: 'FF0F6E56' }, name: 'Tajawal' }
  title.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(1).height = 28

  const summaryRow = sheet.addRow([
    `نقدي: ${summary.cashCount} — ${summary.cashTotal.toFixed(2)} ₪ | إلكتروني: ${summary.bankCount} — ${summary.bankTotal.toFixed(2)} ₪ | الإجمالي: ${summary.grandTotal.toFixed(2)} ₪`,
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
      formatDate(item.paid_at),
      formatTime(item.paid_at),
      item.category_name,
      null,
      item.method_label,
      item.bank_account_label ?? '',
      item.source_account_label ?? '',
      item.description ?? '',
      item.beneficiary ?? '',
      item.notes ?? '',
    ])

    setCurrency(row.getCell(5), item.amount)

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
    { width: 18 },
    { width: 12 },
    { width: 14 },
    { width: 22 },
    { width: 18 },
    { width: 24 },
    { width: 16 },
    { width: 24 },
  ]

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}
