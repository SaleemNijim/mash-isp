import ExcelJS from 'exceljs'
import { isPppPlaceholderRow } from '@/lib/ppp/plans'

function cellStr(row: ExcelJS.Row, col: number): string {
  if (col < 1) return ''
  const v = row.getCell(col).value
  if (v == null) return ''
  if (typeof v === 'object' && v !== null && 'text' in v) return String((v as { text: string }).text).trim()
  return String(v).trim()
}

function findCol(headers: string[], aliases: string[]): number {
  const lower = headers.map((h) => h.toLowerCase())
  for (const a of aliases) {
    const i = lower.indexOf(a.toLowerCase())
    if (i >= 0) return i + 1
  }
  return -1
}

function isRedBackground(row: ExcelJS.Row): boolean {
  const fill = row.getCell(1).fill
  if (!fill || fill.type !== 'pattern') return false
  const fg = fill.fgColor
  if (!fg) return false
  const argb = fg.argb ?? ''
  return argb.toUpperCase().includes('FF0000') || argb.toUpperCase().endsWith('0000')
}

export interface PppCredentialImportRow {
  username: string
  password: string
  is_used: boolean
}

export interface ParsePppExcelResult {
  rows: PppCredentialImportRow[]
  errors: { row: number; reason: string }[]
  skipped: number
}

export async function parsePppCredentialExcel(file: ArrayBuffer): Promise<ParsePppExcelResult> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(file)
  const sheet = wb.worksheets[0]
  if (!sheet) {
    return { rows: [], errors: [{ row: 0, reason: 'ملف Excel فارغ' }], skipped: 0 }
  }

  const headers: string[] = []
  sheet.getRow(1).eachCell((cell, col) => {
    headers[col - 1] = String(cell.value ?? '').trim()
  })

  const usernameCol = findCol(headers, ['username', 'يوزر', 'اسم المستخدم', 'user'])
  const passwordCol = findCol(headers, ['password', 'كلمة المرور', 'باسورد', 'pass'])

  if (usernameCol < 0) {
    return { rows: [], errors: [{ row: 1, reason: 'عمود username غير موجود' }], skipped: 0 }
  }

  const rows: PppCredentialImportRow[] = []
  const errors: { row: number; reason: string }[] = []
  const seen = new Set<string>()
  let skipped = 0

  sheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return
    const username = cellStr(row, usernameCol)
    const password = passwordCol >= 0 ? cellStr(row, passwordCol) : ''

    if (!username) {
      skipped++
      return
    }
    if (isPppPlaceholderRow(username, password)) {
      skipped++
      return
    }
    if (seen.has(username)) {
      errors.push({ row: rowNum, reason: `username مكرر: ${username}` })
      skipped++
      return
    }
    seen.add(username)
    rows.push({
      username,
      password,
      is_used: isRedBackground(row),
    })
  })

  return { rows, errors, skipped }
}
