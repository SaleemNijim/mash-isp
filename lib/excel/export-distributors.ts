import ExcelJS from 'exceljs'
import {
  DISTRIBUTORS_TEMPLATE,
  getDistributorSheet,
} from '@/lib/excel/distributors-template'
import { promptSaveExcelFile, type ExcelExportResult } from '@/lib/excel/save-excel-download'

export interface DistributorExportRow {
  name: string
  phone: string | null
  address: string | null
  notes: string | null
}

const DATA_START_ROW = 2

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || 'export'
}

function setDistributorRow(row: ExcelJS.Row, distributor: DistributorExportRow): void {
  row.getCell(1).value = distributor.name
  row.getCell(2).value = distributor.phone ?? ''
  row.getCell(3).value = distributor.address ?? ''
  row.getCell(4).value = distributor.notes ?? ''
}

function clearDistributorRow(row: ExcelJS.Row): void {
  for (let col = 1; col <= DISTRIBUTORS_TEMPLATE.headers.length; col++) {
    row.getCell(col).value = null
  }
}

/**
 * يصدّر الموزعين إلى Excel بنفس تنسيق النموذج الرسمي للاستيراد.
 */
export async function exportDistributorsToExcel(options: {
  fileBaseName?: string
  distributors: DistributorExportRow[]
}): Promise<ExcelExportResult> {
  const { distributors, fileBaseName = 'الموزعون' } = options

  const res = await fetch(DISTRIBUTORS_TEMPLATE.downloadPath)
  if (!res.ok) throw new Error('template_load_failed')

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await res.arrayBuffer())

  const sheet = getDistributorSheet(workbook)
  if (!sheet) throw new Error('template_sheet_missing')

  const sorted = [...distributors].sort((a, b) => a.name.localeCompare(b.name, 'ar'))

  sorted.forEach((distributor, index) => {
    setDistributorRow(sheet.getRow(DATA_START_ROW + index), distributor)
  })

  const firstEmptyRow = DATA_START_ROW + sorted.length
  for (let rowNum = firstEmptyRow; rowNum <= sheet.rowCount; rowNum++) {
    clearDistributorRow(sheet.getRow(rowNum))
  }

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
