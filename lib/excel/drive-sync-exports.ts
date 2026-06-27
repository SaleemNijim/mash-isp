import ExcelJS from 'exceljs'

export interface DistributorDriveRow {
  name: string
  phone: string | null
  address: string | null
  notes: string | null
}

export interface RouterDriveRow {
  port_name: string
  name: string
  ip_address: string | null
  model: string | null
  mac_address: string | null
  location: string | null
  device_type: string | null
  phone: string | null
  notes: string | null
}

function styleSheet(sheet: ExcelJS.Worksheet): void {
  sheet.views = [{ rightToLeft: true, state: 'frozen', ySplit: 1 }]
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Tajawal' }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F6E56' },
    }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })
}

async function workbookToBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

export async function buildDistributorsWorkbookBuffer(
  rows: DistributorDriveRow[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'MASH ISP'
  const sheet = workbook.addWorksheet('الموزعون')

  sheet.addRow(['أسماء الموزعين', 'رقم الهاتف', 'العنوان', 'ملاحظات'])
  rows.forEach((row) => {
    sheet.addRow([row.name, row.phone ?? '', row.address ?? '', row.notes ?? ''])
  })

  sheet.columns = [{ width: 28 }, { width: 18 }, { width: 28 }, { width: 36 }]
  styleSheet(sheet)
  return workbookToBuffer(workbook)
}

export async function buildRoutersWorkbookBuffer(options: {
  portName: string
  rows: RouterDriveRow[]
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'MASH ISP'
  const sheet = workbook.addWorksheet(options.portName.slice(0, 31) || 'Port')

  sheet.addRow([
    'م',
    'IP',
    'الموديل',
    'MAC',
    'الموقع',
    'الاسم',
    'نوع الجهاز',
    'رقم الهاتف',
    'ملاحظات',
  ])
  options.rows.forEach((row, index) => {
    sheet.addRow([
      index + 1,
      row.ip_address ?? '',
      row.model ?? '',
      row.mac_address ?? '',
      row.location ?? '',
      row.name,
      row.device_type ?? '',
      row.phone ?? '',
      row.notes ?? '',
    ])
  })

  sheet.columns = [
    { width: 6 },
    { width: 18 },
    { width: 18 },
    { width: 20 },
    { width: 22 },
    { width: 24 },
    { width: 16 },
    { width: 16 },
    { width: 30 },
  ]
  styleSheet(sheet)
  return workbookToBuffer(workbook)
}
