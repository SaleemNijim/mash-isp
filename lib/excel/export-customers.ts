import ExcelJS from 'exceljs'
import { subscriptionStatusLabel } from '@/lib/subscriptions/customer-hub'
import { promptSaveExcelFile, type ExcelExportResult } from '@/lib/excel/save-excel-download'

export interface CustomerExportRow {
  name: string
  phone: string | null
  address: string | null
  notes: string | null
  speed: string | null
  price: number | null
  endDate: string | null
  debtTotal: number
}

const HEADERS = [
  'اسم المشترك',
  'رقم الهاتف',
  'العنوان',
  'ملاحظات',
  'السرعة',
  'السعر',
  'ينتهي في',
  'الحالة',
  'الدين',
] as const

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || 'export'
}

function formatDate(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
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

/**
 * يصدّر قائمة المشتركين إلى Excel مع بيانات الاشتراك والدين.
 */
export async function exportCustomersToExcel(options: {
  fileBaseName?: string
  customers: CustomerExportRow[]
}): Promise<ExcelExportResult> {
  const { customers, fileBaseName = 'المشتركون' } = options

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'MASH ISP'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('المشتركون', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  })

  const headerRow = sheet.addRow([...HEADERS])
  styleHeader(headerRow)

  const sorted = [...customers].sort((a, b) => a.name.localeCompare(b.name, 'ar'))

  sorted.forEach((customer) => {
    const status = subscriptionStatusLabel(customer.endDate).label
    const row = sheet.addRow([
      customer.name,
      customer.phone ?? '',
      customer.address ?? '',
      customer.notes ?? '',
      customer.speed ?? '',
      customer.price ?? '',
      formatDate(customer.endDate),
      status,
      customer.debtTotal > 0 ? customer.debtTotal : '',
    ])

    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Tajawal' }
      cell.alignment = {
        horizontal: colNumber === 6 || colNumber === 9 ? 'center' : 'right',
        vertical: 'middle',
        wrapText: true,
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFEAF5F2' } },
        right: { style: 'thin', color: { argb: 'FFEAF5F2' } },
        bottom: { style: 'thin', color: { argb: 'FFEAF5F2' } },
        left: { style: 'thin', color: { argb: 'FFEAF5F2' } },
      }
    })

    if (customer.price != null) {
      row.getCell(6).numFmt = '#,##0.00'
    }
    if (customer.debtTotal > 0) {
      row.getCell(9).numFmt = '#,##0.00'
    }
  })

  sheet.columns = [
    { width: 24 },
    { width: 16 },
    { width: 28 },
    { width: 24 },
    { width: 14 },
    { width: 12 },
    { width: 16 },
    { width: 14 },
    { width: 12 },
  ]

  const outBuffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([outBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  const fileName = `${sanitizeFileName(fileBaseName)}.xlsx`
  const outcome = await promptSaveExcelFile(blob, fileName)

  return {
    count: sorted.length,
    saved: outcome === 'saved',
  }
}
