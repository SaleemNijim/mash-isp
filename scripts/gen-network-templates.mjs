import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

const HEADERS = [
  'م',
  'عنوان IP',
  'الكود',
  'عنوان MAC',
  'الموقع',
  'SSID',
  'نوع الجهاز',
  'رقم الجوال',
  'ملاحظات',
  'اسم الموسّع',
  'MAC الموسّع',
]
const PORTS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

function styleHeaderRow(row) {
  row.font = { bold: true }
  row.alignment = { horizontal: 'center', vertical: 'middle' }
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } }
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    }
  })
}

async function writeEmptyTemplate() {
  const userTemplate = 'e:/files2/راوترات_الشبكة_قالب_فارغ.xlsx'
  const out = path.join(root, 'public/templates/network-routers-template.xlsx')
  if (fs.existsSync(userTemplate)) {
    fs.copyFileSync(userTemplate, out)
    console.log('Empty template copied from user file:', out)
    return
  }
  const wb = new ExcelJS.Workbook()
  for (const n of PORTS) {
    const ws = wb.addWorksheet(`Port ${n}`)
    const header = ws.getRow(1)
    HEADERS.forEach((h, i) => {
      header.getCell(i + 1).value = h
    })
    styleHeaderRow(header)
    ws.columns = HEADERS.map(() => ({ width: 14 }))
    ws.getColumn(6).width = 18
  }
  const out = path.join(root, 'public/templates/network-routers-template.xlsx')
  await wb.xlsx.writeFile(out)
  console.log('Empty template:', out, 'sheets:', wb.worksheets.length)
}

async function writeBypassedTemplate() {
  const B_HEADERS = [
    'م',
    'عنوان IP',
    'الكود',
    'عنوان MAC',
    'الموقع',
    'SSID',
    'نوع الجهاز',
    'رقم الجوال',
    'ملاحظات',
  ]
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Bypassed')
  const header = ws.getRow(1)
  B_HEADERS.forEach((h, i) => {
    header.getCell(i + 1).value = h
  })
  styleHeaderRow(header)
  const out = path.join(root, 'public/templates/network-bypassed-template.xlsx')
  await wb.xlsx.writeFile(out)
  console.log('Bypassed template:', out)
}

async function writeFilledFromSource() {
  const candidates = [
    'e:/files/راوترات_الشبكة_مُعبّأ.xlsx',
    path.join(root, 'public/templates/network-routers-sample-filled.xlsx'),
  ]
  const src = candidates.find((p) => fs.existsSync(p))
  if (!src || src.endsWith('network-routers-sample-filled.xlsx')) {
    console.log('Filled source not found at e:/files — skipping sample regeneration')
    return
  }

  const srcWb = new ExcelJS.Workbook()
  await srcWb.xlsx.readFile(src)
  const outWb = new ExcelJS.Workbook()

  for (const n of PORTS) {
    const srcSheet = srcWb.worksheets.find((s) => new RegExp(`Port\\s*${n}`, 'i').test(s.name))
    const ws = outWb.addWorksheet(`Port ${n}`)
    const header = ws.getRow(1)
    HEADERS.forEach((h, i) => {
      header.getCell(i + 1).value = h
    })
    styleHeaderRow(header)

    if (!srcSheet) {
      console.log('Port', n, 'rows: 0 (no source sheet)')
      continue
    }

    let headerRow = 1
    for (const rn of [1, 3]) {
      const ip = String(srcSheet.getRow(rn).getCell(2).value ?? '').trim()
      const ssid = String(srcSheet.getRow(rn).getCell(6).value ?? '').trim()
      if (ip === 'عنوان IP' && ssid === 'SSID') {
        headerRow = rn
        break
      }
    }
    const dataStart = headerRow + 1
    let outRow = 2
    srcSheet.eachRow((row, rn) => {
      if (rn < dataStart) return
      const ip = String(row.getCell(2).value ?? '').trim()
      const ssid = String(row.getCell(6).value ?? '').trim()
      const mac = String(row.getCell(4).value ?? '').trim()
      if (!ip && !ssid && !mac) return
      for (let c = 1; c <= 11; c++) {
        ws.getRow(outRow).getCell(c).value = row.getCell(c).value
      }
      outRow++
    })
    console.log('Port', n, 'rows:', outRow - 2)
  }

  const out = path.join(root, 'public/templates/network-routers-sample-filled.xlsx')
  await outWb.xlsx.writeFile(out)
  console.log('Filled sample:', out)
}

await writeEmptyTemplate()
await writeBypassedTemplate()
await writeFilledFromSource()
