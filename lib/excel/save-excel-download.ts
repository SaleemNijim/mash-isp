const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export type ExcelSaveOutcome = 'saved' | 'cancelled'

function ensureXlsxExtension(fileName: string): string {
  return fileName.toLowerCase().endsWith('.xlsx') ? fileName : `${fileName}.xlsx`
}

/**
 * يعرض نافذة اختيار مكان الحفظ (File System Access API) عند توفرها،
 * وإلا يحمّل الملف إلى مجلد التنزيلات الافتراضي.
 */
export async function promptSaveExcelFile(
  blob: Blob,
  suggestedFileName: string,
): Promise<ExcelSaveOutcome> {
  const fileName = ensureXlsxExtension(suggestedFileName)

  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: 'ملف Excel',
            accept: { [EXCEL_MIME]: ['.xlsx'] },
          },
        ],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return 'saved'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return 'cancelled'
      }
      throw err
    }
  }

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
  return 'saved'
}

export interface ExcelExportResult {
  count: number
  saved: boolean
}
