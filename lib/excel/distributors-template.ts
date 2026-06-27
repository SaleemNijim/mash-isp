import type ExcelJS from 'exceljs'

/** النموذج الرسمي لاستيراد الموزعين — يطابق public/templates/distributors-template.xlsx */
export const DISTRIBUTORS_TEMPLATE = {
  sheetName: 'الموزعون',
  headers: ['أسماء الموزعين', 'رقم الهاتف', 'العنوان', 'ملاحظات'] as const,
  downloadPath: '/templates/distributors-template.xlsx',
  downloadFileName: 'نموذج_الموزعين.xlsx',
} as const

export type DistributorTemplateHeader = (typeof DISTRIBUTORS_TEMPLATE.headers)[number]

export function getDistributorSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet | null {
  return (
    workbook.getWorksheet(DISTRIBUTORS_TEMPLATE.sheetName) ??
    workbook.worksheets[0] ??
    null
  )
}

function readHeaderRow(sheet: ExcelJS.Worksheet): string[] {
  const headers: string[] = []
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNum) => {
    if (colNum <= DISTRIBUTORS_TEMPLATE.headers.length) {
      headers[colNum - 1] = String(cell.value ?? '').trim()
    }
  })
  return headers
}

/** يُرجع رسالة الخطأ أو null إذا كان الملف مطابقاً للنموذج */
export function validateDistributorTemplate(sheet: ExcelJS.Worksheet): string | null {
  const sheetName = sheet.name.trim()
  if (sheetName !== DISTRIBUTORS_TEMPLATE.sheetName) {
    return `اسم ورقة العمل يجب أن يكون «${DISTRIBUTORS_TEMPLATE.sheetName}» — الموجود: «${sheetName || 'فارغ'}». حمّل النموذج الرسمي من صفحة الموزعين.`
  }

  const headers = readHeaderRow(sheet)
  for (let i = 0; i < DISTRIBUTORS_TEMPLATE.headers.length; i++) {
    const expected = DISTRIBUTORS_TEMPLATE.headers[i]
    const actual = headers[i] ?? ''
    if (actual !== expected) {
      return `العمود ${i + 1} يجب أن يكون «${expected}» — الموجود: «${actual || 'فارغ'}». لا تغيّر أسماء الأعمدة في الصف الأول.`
    }
  }

  return null
}

export function downloadDistributorTemplate(): void {
  const a = document.createElement('a')
  a.href = DISTRIBUTORS_TEMPLATE.downloadPath
  a.download = DISTRIBUTORS_TEMPLATE.downloadFileName
  a.click()
}
