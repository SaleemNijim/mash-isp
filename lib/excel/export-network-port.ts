import ExcelJS from 'exceljs'
import { compareIpAddress } from '@/lib/network/router-list-utils'
import {
  getFirstRouterImportSheet,
  getRouterDataStartRow,
  NETWORK_SINGLE_PORT_TEMPLATE,
} from '@/lib/excel/network-routers-template'
import { promptSaveExcelFile, type ExcelExportResult } from '@/lib/excel/save-excel-download'

export interface NetworkPortExportRow {
  ip_address: string | null
  model: string | null
  mac_address: string | null
  location: string | null
  name: string
  device_type: string | null
  phone: string | null
  notes: string | null
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || 'export'
}

function setRouterRow(row: ExcelJS.Row, seq: number, router: NetworkPortExportRow): void {
  row.getCell(1).value = seq
  row.getCell(2).value = router.ip_address ?? ''
  row.getCell(3).value = router.model ?? ''
  row.getCell(4).value = router.mac_address ?? ''
  row.getCell(5).value = router.location ?? ''
  row.getCell(6).value = router.name ?? ''
  row.getCell(7).value = router.device_type ?? ''
  row.getCell(8).value = router.phone ?? ''
  row.getCell(9).value = router.notes ?? ''
}

function clearRouterRow(row: ExcelJS.Row): void {
  for (let col = 1; col <= 9; col++) {
    row.getCell(col).value = null
  }
}

/**
 * يصدّر راوترات بورت واحد إلى Excel بنفس تنسيق القالب الرسمي.
 * يُحمّل القالب من public/templates ويملأ الصفوف مع الإبقاء على التنسيق.
 */
export async function exportNetworkPortToExcel(options: {
  networkName: string
  portName: string
  routers: NetworkPortExportRow[]
}): Promise<ExcelExportResult> {
  const { networkName, portName, routers } = options

  const res = await fetch(NETWORK_SINGLE_PORT_TEMPLATE.downloadPath)
  if (!res.ok) throw new Error('template_load_failed')

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await res.arrayBuffer())

  const sheet = getFirstRouterImportSheet(workbook) ?? workbook.worksheets[0]
  if (!sheet) throw new Error('template_sheet_missing')

  const dataStartRow = getRouterDataStartRow(sheet)
  const sorted = [...routers].sort((a, b) =>
    compareIpAddress(a.ip_address, b.ip_address),
  )

  sorted.forEach((router, index) => {
    setRouterRow(sheet.getRow(dataStartRow + index), index + 1, router)
  })

  const firstEmptyRow = dataStartRow + sorted.length
  for (let rowNum = firstEmptyRow; rowNum <= sheet.rowCount; rowNum++) {
    clearRouterRow(sheet.getRow(rowNum))
  }

  const outBuffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([outBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  const fileName = `${sanitizeFileName(networkName)}_${sanitizeFileName(portName)}.xlsx`
  const outcome = await promptSaveExcelFile(blob, fileName)

  return {
    count: sorted.length,
    saved: outcome === 'saved',
  }
}
