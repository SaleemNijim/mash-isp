import ExcelJS from 'exceljs'

const src = 'c:\\Users\\Saleem\\OneDrive\\Desktop\\سجل المشتركين 2026 محدث\\كشف راوترات الشبكة.xlsx'

function cellStr(row, col) {
  const v = row.getCell(col).value
  if (v == null) return ''
  if (typeof v === 'object' && v.richText) return v.richText.map((t) => t.text).join('')
  if (typeof v === 'object' && v.text) return String(v.text)
  if (typeof v === 'object' && v.result != null) return String(v.result)
  return String(v).trim()
}

const SECTION_STARTS = [2, 257, 512, 767, 1022, 1223]

async function main() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(src)
  const ws = wb.worksheets[0]

  // Row 2 headers - all columns
  console.log('=== Header row 2 (non-empty) ===')
  for (let c = 1; c <= 33; c++) {
    const v = cellStr(ws.getRow(2), c)
    if (v) {
      const letter = String.fromCharCode(64 + (c <= 26 ? c : 0)) // rough
      console.log(`Col ${c}: ${v}`)
    }
  }

  for (let si = 0; si < SECTION_STARTS.length; si++) {
    const start = SECTION_STARTS[si]
    const end = SECTION_STARTS[si + 1] ?? ws.rowCount + 1
    const dataStart = start + 1
    let main = 0, ext = 0, bp1 = 0, bp2 = 0
    for (let rn = dataStart; rn < end; rn++) {
      const row = ws.getRow(rn)
      if (cellStr(row, 3) || cellStr(row, 5) || cellStr(row, 7)) main++
      if (cellStr(row, 14) || cellStr(row, 15)) ext++
      if (cellStr(row, 22) || cellStr(row, 23)) bp1++
      if (cellStr(row, 29) || cellStr(row, 30)) bp2++
    }
    const title = cellStr(ws.getRow(start), 1)
    console.log(`\nSection ${si + 1} (${title}): rows ${dataStart}-${end - 1}`)
    console.log(`  Main: ${main}, Extender: ${ext}, Bypass1: ${bp1}, Bypass2: ${bp2}`)
  }

  // Check main phone column - sample rows with J and I
  console.log('\n=== Main router phone columns I,J (rows 3-10) ===')
  for (let rn = 3; rn <= 10; rn++) {
    const row = ws.getRow(rn)
    console.log(`R${rn}: I=${cellStr(row,9)} J=${cellStr(row,10)} G=${cellStr(row,7)}`)
  }

  // Template formula row
  const tpl = 'e:\\files2\\راوترات_الشبكة_قالب_فارغ.xlsx'
  const wb2 = new ExcelJS.Workbook()
  await wb2.xlsx.readFile(tpl)
  const ws2 = wb2.getWorksheet('1️⃣ Port 1')
  for (let r = 257; r <= 262; r++) {
    const row = ws2.getRow(r)
    const parts = []
    for (let c = 1; c <= 3; c++) {
      const cell = row.getCell(c)
      parts.push(`C${c}=${JSON.stringify(cell.value)} f=${cell.formula || ''}`)
    }
    console.log(`Tpl R${r}:`, parts.join(' | '))
  }
}

main().catch(console.error)
