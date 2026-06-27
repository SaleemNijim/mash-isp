import ExcelJS from 'exceljs'

const out = 'e:\\files2\\راوترات_الشبكة_مملوء.xlsx'

function cellStr(row, col) {
  const v = row.getCell(col).value
  if (v == null) return ''
  if (typeof v === 'object' && v.result != null) return String(v.result)
  return String(v).trim()
}

async function main() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(out)
  const ws = wb.getWorksheet('1️⃣ Port 1')
  console.log('Port 1 - first 5 data rows:')
  for (let r = 4; r <= 8; r++) {
    const vals = []
    for (let c = 1; c <= 9; c++) vals.push(cellStr(ws.getRow(r), c))
    console.log(`R${r}:`, vals.join(' | '))
  }
  console.log('\nPort 1 - last written row sample (254):')
  const r254 = ws.getRow(257)
  console.log('R257:', [1,2,3,4,5,6,7,8,9].map(c => cellStr(r254, c)).join(' | '))
  console.log('\nPort 2 - count with IP:')
  const ws2 = wb.getWorksheet('2️⃣ Port 2')
  let n = 0
  for (let r = 4; r <= 257; r++) if (cellStr(ws2.getRow(r), 2)) n++
  console.log('Rows with IP:', n)
}

main().catch(console.error)
