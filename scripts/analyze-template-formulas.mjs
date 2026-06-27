import ExcelJS from 'exceljs'

const tpl = 'e:\\files2\\راوترات_الشبكة_قالب_فارغ.xlsx'

async function main() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(tpl)
  const ws = wb.getWorksheet('1️⃣ Port 1')
  for (let r = 1; r <= 262; r++) {
    const row = ws.getRow(r)
    const cells = []
    for (let c = 1; c <= 9; c++) {
      const cell = row.getCell(c)
      if (cell.value != null || cell.formula) {
        cells.push(`${c}:${JSON.stringify(cell.value)}${cell.formula ? ` [=${cell.formula}]` : ''}`)
      }
    }
    if (cells.length) console.log(`R${r}:`, cells.join(' | '))
  }
}

main().catch(console.error)
