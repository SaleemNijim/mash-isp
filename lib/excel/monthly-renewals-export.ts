import ExcelJS from 'exceljs'

export interface MonthlyRenewalExportRow {
  customer_name: string | null
  customer_phone: string | null
  username: string | null
  password: string | null
  speed: string | null
  mac_address: string | null
  billing_label: string | null
  amount_due: number | null
  cash_amount: number | null
  app_amount: number | null
  discount_amount: number | null
  balance_remaining: number | null
  period_start: string
  paid_at: string | null
  notes: string | null
}

const HEADERS = [
  'م',
  'اسم المشترك',
  'رقم الجوال',
  'اسم المستخدم',
  'كلمة المرور',
  'السرعة',
  'MAC',
  'نوع الاشتراك',
  'المبلغ المطلوب',
  'نقد',
  'تطبيق/بنك',
  'خصم',
  'دين مرحّل',
  'بداية الفترة',
  'تاريخ التسجيل',
  'ملاحظات',
] as const

function formatDate(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString().slice(0, 10)
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

export function getMonthlyRenewalsFileName(month: string): string {
  const [year, mon] = month.split('-')
  if (year && mon) return `سجل_التجديد_${mon}-${year}.xlsx`
  return `سجل_التجديد_${month}.xlsx`
}

export async function buildMonthlyRenewalsWorkbookBuffer(options: {
  companyName: string
  month: string
  rows: MonthlyRenewalExportRow[]
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'MASH ISP'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet(`سجل التجديد ${options.month}`, {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 3 }],
  })

  sheet.mergeCells(1, 1, 1, HEADERS.length)
  const title = sheet.getCell(1, 1)
  title.value = `${options.companyName} — سجل التجديد ${options.month}`
  title.font = { bold: true, size: 16, color: { argb: 'FF0F6E56' }, name: 'Tajawal' }
  title.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(1).height = 28

  sheet.addRow([])
  const headerRow = sheet.addRow([...HEADERS])
  styleHeader(headerRow)

  options.rows.forEach((item, index) => {
    const row = sheet.addRow([
      index + 1,
      item.customer_name ?? '',
      item.customer_phone ?? '',
      item.username ?? '',
      item.password ?? '',
      item.speed ?? '',
      item.mac_address ?? '',
      item.billing_label ?? 'شهري',
      null,
      null,
      null,
      null,
      null,
      formatDate(item.period_start),
      formatDate(item.paid_at),
      item.notes ?? '',
    ])

    setCurrency(row.getCell(9), item.amount_due)
    setCurrency(row.getCell(10), item.cash_amount)
    setCurrency(row.getCell(11), item.app_amount)
    setCurrency(row.getCell(12), item.discount_amount)
    setCurrency(row.getCell(13), item.balance_remaining)

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

    if ((item.balance_remaining ?? 0) > 0) {
      row.getCell(13).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFF3CD' },
      }
    }
  })

  sheet.columns = [
    { width: 6 },
    { width: 24 },
    { width: 16 },
    { width: 20 },
    { width: 18 },
    { width: 14 },
    { width: 20 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 28 },
  ]

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}
