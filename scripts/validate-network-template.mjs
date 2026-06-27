/** اختبار سريع: node scripts/validate-network-template.mjs [path] */
import ExcelJS from 'exceljs'
import fs from 'fs'

const file =
  process.argv[2] ?? 'e:/files2/راوترات_الشبكة_قالب_فارغ.xlsx'

function normalizeHeader(value) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function matchesIpHeader(header) {
  const n = normalizeHeader(header)
  return n === 'عنوان ip' || n.includes('عنوان ip')
}

function matchesSsidHeader(header) {
  const n = normalizeHeader(header)
  return n === 'ssid' || n.includes('ssid')
}

function findRouterHeaderRow(sheet) {
  for (let rowNum = 1; rowNum <= 10; rowNum++) {
    const row = sheet.getRow(rowNum)
    const ip = String(row.getCell(2).value ?? '').trim()
    const ssid = String(row.getCell(6).value ?? '').trim()
    if (matchesIpHeader(ip) && matchesSsidHeader(ssid)) return rowNum
  }
  return null
}

function parsePort(name) {
  const m = name.match(/Port\s*(\d+)/i)
  return m ? Number(m[1]) : null
}

function shouldSkip(name) {
  return /تعليمات|instructions|دليل|فهرس|^bypassed$/i.test(name.trim())
}

if (!fs.existsSync(file)) {
  console.error('File not found:', file)
  process.exit(1)
}

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(file)

let count = 0
for (const sheet of wb.worksheets) {
  if (shouldSkip(sheet.name)) {
    console.log('SKIP', sheet.name)
    continue
  }
  const hr = findRouterHeaderRow(sheet)
  const port = parsePort(sheet.name)
  if (hr && port) {
    count++
    console.log('OK', sheet.name, '-> Port', port, 'headerRow', hr, 'dataFrom', hr + 1)
  } else {
    console.log('FAIL', sheet.name, 'headerRow', hr, 'port', port)
  }
}

console.log('importable sheets:', count)
process.exit(count === 9 ? 0 : 1)
