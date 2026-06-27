import ExcelJS from 'exceljs'
import path from 'path'

const src = 'c:\\Users\\Saleem\\OneDrive\\Desktop\\سجل المشتركين 2026 محدث\\كشف راوترات الشبكة.xlsx'
const tpl = 'e:\\files2\\راوترات_الشبكة_قالب_فارغ.xlsx'

function cellStr(row, col) {
  const v = row.getCell(col).value
  if (v == null) return ''
  if (typeof v === 'object' && v.richText) return v.richText.map((t) => t.text).join('')
  if (typeof v === 'object' && v.text) return String(v.text)
  if (typeof v === 'object' && v.result != null) return String(v.result)
  return String(v).trim()
}

function colLetter(n) {
  let s = ''
  while (n > 0) {
    n--
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26)
  }
  return s
}

async function analyze() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(src)
  const ws = wb.worksheets[0]
  console.log('Source sheet:', ws.name, 'rows:', ws.rowCount, 'cols:', ws.columnCount)

  const portRows = []
  ws.eachRow((row, rn) => {
    for (let c = 1; c <= Math.min(60, ws.columnCount); c++) {
      const v = cellStr(row, c)
      if (/Port/i.test(v)) {
        portRows.push({ row: rn, col: c, text: v })
      }
    }
  })
  console.log('\nPort sections:', portRows.length)
  portRows.forEach((p) => console.log(`  R${p.row}: ${p.text}`))

  // Show header row after first port
  if (portRows.length) {
    const start = portRows[0].row
    console.log('\n--- Rows around first port ---')
    for (let rn = start; rn <= start + 5; rn++) {
      const row = ws.getRow(rn)
      const parts = []
      for (let c = 1; c <= 35; c++) {
        const v = cellStr(row, c)
        if (v) parts.push(`${colLetter(c)}=${v.slice(0, 35)}`)
      }
      console.log(`R${rn}: ${parts.join(' | ')}`)
    }
  }

  // Sample data row with extender/bypass
  console.log('\n--- Sample data rows (first port section) ---')
  const s1 = portRows[0]?.row ?? 1
  const s2 = portRows[1]?.row ?? ws.rowCount + 1
  let shown = 0
  for (let rn = s1 + 2; rn < s2 && shown < 5; rn++) {
    const row = ws.getRow(rn)
    const a = cellStr(row, 1)
    const c = cellStr(row, 3)
    if (!a && !c) continue
    shown++
    const parts = []
    for (let col = 1; col <= 33; col++) {
      const v = cellStr(row, col)
      if (v) parts.push(`${colLetter(col)}=${v.slice(0, 30)}`)
    }
    console.log(`R${rn}: ${parts.join(' | ')}`)
  }

  const wb2 = new ExcelJS.Workbook()
  await wb2.xlsx.readFile(tpl)
  console.log('\nTemplate sheets:', wb2.worksheets.map((s) => s.name))
  for (const sn of wb2.worksheets.slice(0, 3)) {
    console.log(`\n--- ${sn.name} ---`)
    for (let r = 1; r <= 4; r++) {
      const vals = []
      for (let c = 1; c <= 9; c++) vals.push(cellStr(sn.getRow(r), c))
      console.log(`R${r}:`, vals)
    }
    for (let r = 255; r <= 260; r++) {
      const v = sn.getRow(r).getCell(1).value
      const v2 = sn.getRow(r).getCell(2).value
      if (v || v2) console.log(`R${r}: A=${JSON.stringify(v)} B=${JSON.stringify(v2)}`)
    }
  }
}

analyze().catch(console.error)
