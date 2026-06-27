import type ExcelJS from 'exceljs'
import {
  NETWORK_PORT_NUMBERS,
  networkPortLabel,
  type NetworkPortNumber,
} from '@/lib/network/ports'

/** أعمدة قالب بورت واحد (network-single-port-template) */
export const ROUTER_SHEET_HEADERS = [
  'م',
  'عنوان IP',
  'الكود',
  'عنوان MAC',
  'الموقع',
  'SSID',
  'نوع الجهاز',
  'رقم الجوال',
  'ملاحظات',
] as const

/** اختيارية — إن وُجدت في القالب */
export const ROUTER_SHEET_OPTIONAL_HEADERS = ['اسم الموسّع', 'MAC الموسّع'] as const

export const ROUTER_SHEET_ALL_HEADERS = [
  ...ROUTER_SHEET_HEADERS,
  ...ROUTER_SHEET_OPTIONAL_HEADERS,
] as const

export const NETWORK_SINGLE_PORT_TEMPLATE = {
  headers: ROUTER_SHEET_HEADERS,
  downloadPath: '/templates/network-single-port-template.xlsx',
  downloadFileName: 'قالب_راوترات_بورت_واحد.xlsx',
  headerRow: 1,
  dataStartRow: 2,
} as const

export const NETWORK_ROUTERS_TEMPLATE = {
  portSheetPrefix: 'Port',
  headers: ROUTER_SHEET_HEADERS,
  downloadPath: '/templates/network-routers-template.xlsx',
  downloadFileName: 'راوترات_الشبكة_قالب_فارغ.xlsx',
  /** ترويسة في الصف 1 (نموذج مبسّط) */
  simpleHeaderRow: 1,
  simpleDataStartRow: 2,
  /** قالب العميل: صف 1 عنوان + صف 2 شركة + صف 3 ترويسة */
  legacyHeaderRow: 3,
  legacyDataStartRow: 4,
  maxHeaderScanRow: 10,
} as const

export const NETWORK_BYPASSED_TEMPLATE = {
  sheetName: 'Bypassed',
  headers: [
    'م',
    'عنوان IP',
    'الكود',
    'عنوان MAC',
    'الموقع / العنوان',
    'اسم الشبكة  SSID',
    'نوع الجهاز',
    'رقم الجوال',
    'ملاحظات',
  ] as const,
  downloadPath: '/templates/network-bypassed-template.xlsx',
  downloadFileName: 'نموذج_Bypassed.xlsx',
  headerRow: 1,
  dataStartRow: 2,
} as const

const INSTRUCTION_SHEET_PATTERNS = [
  /تعليمات/i,
  /instructions/i,
  /دليل/i,
  /فهرس/i,
]

const SKIP_SHEET_PATTERNS = [
  ...INSTRUCTION_SHEET_PATTERNS,
  /^bypassed$/i,
]

function normalizeHeader(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function readRowHeaders(sheet: ExcelJS.Worksheet, rowNum: number, maxCols = 11): string[] {
  const headers: string[] = []
  sheet.getRow(rowNum).eachCell({ includeEmpty: true }, (cell, colNum) => {
    if (colNum <= maxCols) {
      headers[colNum - 1] = String(cell.value ?? '').trim()
    }
  })
  return headers
}

function matchesIpHeader(header: string): boolean {
  const n = normalizeHeader(header)
  return n === 'عنوان ip' || n.includes('عنوان ip')
}

function matchesSsidHeader(header: string): boolean {
  const n = normalizeHeader(header)
  return n === 'ssid' || n.includes('ssid')
}

function matchesLocationHeader(header: string): boolean {
  const n = normalizeHeader(header)
  return n === 'الموقع' || n.includes('موقع')
}

function matchesRequiredRouterHeader(colIndex: number, actual: string): boolean {
  const n = normalizeHeader(actual)
  switch (colIndex) {
    case 0:
      return n === 'م' || n === '#'
    case 1:
      return matchesIpHeader(actual)
    case 2:
      return n === 'الكود' || n.includes('كود')
    case 3:
      return n.includes('mac')
    case 4:
      return matchesLocationHeader(actual)
    case 5:
      return matchesSsidHeader(actual)
    case 6:
      return n.includes('نوع') && n.includes('جهاز')
    case 7:
      return n.includes('جوال') || n.includes('هاتف')
    case 8:
      return n.includes('ملاحظ')
    default:
      return true
  }
}

function matchesOptionalRouterHeader(colIndex: number, actual: string): boolean {
  const n = normalizeHeader(actual)
  if (colIndex === 9) return n.includes('موس') || n.includes('extender') || n.includes('اسم')
  if (colIndex === 10) return n.includes('mac')
  return false
}

/** يكتشف صف الترويسة — يدعم الصف 1 أو 3 (قالب العميل) */
export function findRouterHeaderRow(sheet: ExcelJS.Worksheet): number | null {
  const maxRow = NETWORK_ROUTERS_TEMPLATE.maxHeaderScanRow
  for (let rowNum = 1; rowNum <= maxRow; rowNum++) {
    const headers = readRowHeaders(sheet, rowNum)
    if (matchesIpHeader(headers[1] ?? '') && matchesSsidHeader(headers[5] ?? '')) {
      return rowNum
    }
  }
  return null
}

export function validateRouterSheetHeaders(sheet: ExcelJS.Worksheet): string | null {
  const headerRow = findRouterHeaderRow(sheet)
  if (headerRow === null) {
    return `ورقة «${sheet.name}»: لم تُعثر على ترويسة — تأكد من وجود «عنوان IP» و«SSID» في صف الترويسة`
  }

  const actual = readRowHeaders(sheet, headerRow)

  for (let i = 0; i < 9; i++) {
    const value = actual[i] ?? ''
    if (!value) {
      return `ورقة «${sheet.name}» — العمود ${i + 1} فارغ — متوقع: «${ROUTER_SHEET_HEADERS[i]}»`
    }
    if (!matchesRequiredRouterHeader(i, value)) {
      return `ورقة «${sheet.name}» — العمود ${i + 1} غير متطابق — الموجود: «${value}» — متوقع: «${ROUTER_SHEET_HEADERS[i]}»`
    }
  }

  for (let i = 9; i < 11; i++) {
    const value = actual[i] ?? ''
    if (value && !matchesOptionalRouterHeader(i, value)) {
      return `ورقة «${sheet.name}» — العمود ${i + 1} غير متطابق — الموجود: «${value}»`
    }
  }

  return null
}

export function getRouterDataStartRow(sheet: ExcelJS.Worksheet): number {
  const headerRow = findRouterHeaderRow(sheet)
  if (headerRow === null) return NETWORK_ROUTERS_TEMPLATE.simpleDataStartRow
  return headerRow + 1
}

export function parsePortFromSheetName(sheetName: string): NetworkPortNumber | null {
  const match = sheetName.match(/Port\s*(\d+)/i)
  if (!match) return null
  const n = Number(match[1])
  return NETWORK_PORT_NUMBERS.includes(n as NetworkPortNumber)
    ? (n as NetworkPortNumber)
    : null
}

export function inferPortFromIp(ip: string): NetworkPortNumber | null {
  const match = ip.match(/^192\.168\.(\d+)\./)
  if (!match) return null
  const map: Record<number, NetworkPortNumber> = {
    10: 1,
    20: 2,
    30: 3,
    40: 4,
    50: 5,
    80: 8,
    90: 9,
  }
  return map[Number(match[1])] ?? null
}

export function shouldSkipImportSheet(sheetName: string): boolean {
  const trimmed = sheetName.trim()
  return SKIP_SHEET_PATTERNS.some((re) => re.test(trimmed))
}

function shouldSkipSinglePortImportSheet(sheetName: string): boolean {
  const trimmed = sheetName.trim()
  return INSTRUCTION_SHEET_PATTERNS.some((re) => re.test(trimmed))
}

export interface RouterImportSheetInfo {
  sheet: ExcelJS.Worksheet
  portNumber: NetworkPortNumber
  portLabel: string
}

/** أول ورقة بيانات صالحة — للاستيراد لبورت واحد */
export function getFirstRouterImportSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet | null {
  for (const sheet of workbook.worksheets) {
    if (shouldSkipSinglePortImportSheet(sheet.name)) continue
    if (findRouterHeaderRow(sheet) !== null) return sheet
  }
  return null
}

/** @deprecated — استيراد متعدد التبويبات (ترحيل قديم) */
export function listRouterImportSheets(workbook: ExcelJS.Workbook): RouterImportSheetInfo[] {
  const result: RouterImportSheetInfo[] = []

  for (const sheet of workbook.worksheets) {
    if (shouldSkipImportSheet(sheet.name)) continue
    if (findRouterHeaderRow(sheet) === null) continue

    let portNumber = parsePortFromSheetName(sheet.name)

    if (portNumber === null) {
      sheet.eachRow((row, rowNum) => {
        if (portNumber !== null || rowNum > 20) return
        const ip = String(row.getCell(2).value ?? '').trim()
        if (ip) portNumber = inferPortFromIp(ip)
      })
    }

    if (portNumber === null) continue

    result.push({
      sheet,
      portNumber,
      portLabel: networkPortLabel(portNumber),
    })
  }

  return result.sort((a, b) => a.portNumber - b.portNumber)
}

export function getBypassedImportSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet | null {
  return (
    workbook.getWorksheet(NETWORK_BYPASSED_TEMPLATE.sheetName) ??
    workbook.worksheets.find((s) => /^bypassed$/i.test(s.name.trim())) ??
    null
  )
}

export function validateNetworkBypassedTemplate(sheet: ExcelJS.Worksheet): string | null {
  const { sheetName, headerRow } = NETWORK_BYPASSED_TEMPLATE
  if (sheet.name.trim().toLowerCase() !== sheetName.toLowerCase()) {
    return `اسم ورقة Bypassed يجب أن يكون «${sheetName}» — الموجود: «${sheet.name}»`
  }

  const headerRowNum = findRouterHeaderRow(sheet) ?? headerRow
  const actual = readRowHeaders(sheet, headerRowNum, 9)

  for (let i = 0; i < 9; i++) {
    const value = actual[i] ?? ''
    if (!value || !matchesRequiredRouterHeader(i, value)) {
      return `العمود ${i + 1} غير متطابق — الموجود: «${value || 'فارغ'}» — متوقع: «${NETWORK_BYPASSED_TEMPLATE.headers[i]}»`
    }
  }
  return null
}

export function downloadNetworkRoutersTemplate(): void {
  const a = document.createElement('a')
  a.href = NETWORK_ROUTERS_TEMPLATE.downloadPath
  a.download = NETWORK_ROUTERS_TEMPLATE.downloadFileName
  a.click()
}

export function downloadNetworkSinglePortTemplate(): void {
  const a = document.createElement('a')
  a.href = NETWORK_SINGLE_PORT_TEMPLATE.downloadPath
  a.download = NETWORK_SINGLE_PORT_TEMPLATE.downloadFileName
  a.click()
}

export function downloadNetworkBypassedTemplate(): void {
  const a = document.createElement('a')
  a.href = NETWORK_BYPASSED_TEMPLATE.downloadPath
  a.download = NETWORK_BYPASSED_TEMPLATE.downloadFileName
  a.click()
}
