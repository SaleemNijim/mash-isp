import type { SupabaseClient } from '@supabase/supabase-js'
import type ExcelJS from 'exceljs'
import {
  NETWORK_BYPASSED_TEMPLATE,
  getRouterDataStartRow,
  listRouterImportSheets,
  validateNetworkBypassedTemplate,
  validateRouterSheetHeaders,
} from '@/lib/excel/network-routers-template'
import { networkPortLabel, type NetworkPortNumber } from '@/lib/network/ports'

export interface NetworkImportError {
  row: number
  reason: string
  sheet?: string
}

export interface NetworkImportResult {
  total: number
  inserted: number
  skipped: number
  errors: NetworkImportError[]
  byPort?: Record<string, { inserted: number; skipped: number; total: number }>
}

const BATCH = 500

/**
 * يحوّل قيمة خلية ExcelJS إلى نص — يدعم النص المنسّق (Rich Text) والروابط
 * والصيغ والتواريخ. بدون هذا تتحول خلايا Rich Text (مثل MAC ملوّن منسوخ)
 * إلى "[object Object]" بدل النص الفعلي.
 */
function excelValueToString(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v instanceof Date) return v.toISOString()

  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>

    // نص منسّق: { richText: [{ text }, ...] }
    if (Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text?: unknown }>)
        .map((part) => (part?.text != null ? String(part.text) : ''))
        .join('')
        .trim()
    }

    // صيغة: { formula, result }
    if ('result' in obj && obj.result != null) {
      return excelValueToString(obj.result)
    }

    // رابط: { text, hyperlink }
    if ('text' in obj && obj.text != null) {
      return excelValueToString(obj.text)
    }
    if ('hyperlink' in obj && obj.hyperlink != null) {
      return String(obj.hyperlink).trim()
    }
  }

  return String(v).trim()
}

function cellStr(row: ExcelJS.Row, col: number): string {
  return excelValueToString(row.getCell(col).value)
}

function rowHasData(values: string[]): boolean {
  return values.some((v) => v.length > 0)
}

async function batchInsert(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + BATCH))
    if (error) throw new Error(error.message)
  }
}

export async function ensureNetworkPort(
  supabase: SupabaseClient,
  tenantId: string,
  portNumber: NetworkPortNumber,
): Promise<string> {
  const name = networkPortLabel(portNumber)
  const { data: existing } = await supabase
    .from('network_ports')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('name', name)
    .eq('is_deleted', false)
    .maybeSingle()

  if (existing?.id) return existing.id as string

  const { data: created, error } = await supabase
    .from('network_ports')
    .insert({ tenant_id: tenantId, name, is_deleted: false })
    .select('id')
    .single()

  if (error) throw error
  return created.id as string
}

async function importSingleRouterSheet(options: {
  sheet: ExcelJS.Worksheet
  sheetLabel: string
  tenantId: string
  portId: string
  supabase: SupabaseClient
}): Promise<NetworkImportResult> {
  const { sheet, sheetLabel, tenantId, portId, supabase } = options

  const templateError = validateRouterSheetHeaders(sheet)
  if (templateError) throw new Error(templateError)

  const dataStartRow = getRouterDataStartRow(sheet)
  const errors: NetworkImportError[] = []
  let total = 0
  let skipped = 0
  const routerRows: Array<{
    rowNum: number
    payload: Record<string, unknown>
    extName: string | null
    extMac: string | null
  }> = []

  sheet.eachRow((row, rowNum) => {
    if (rowNum < dataStartRow) return

    const ip = cellStr(row, 2)
    const code = cellStr(row, 3)
    const mac = cellStr(row, 4)
    const location = cellStr(row, 5)
    const ssid = cellStr(row, 6)
    const deviceType = cellStr(row, 7)
    const phone = cellStr(row, 8)
    const notes = cellStr(row, 9)
    const extName = cellStr(row, 10)
    const extMac = cellStr(row, 11)

    if (!rowHasData([ip, code, mac, location, ssid, deviceType, phone, notes, extName, extMac])) {
      return
    }

    total++
    const name = ssid || ip || mac

    routerRows.push({
      rowNum,
      payload: {
        tenant_id: tenantId,
        port_id: portId,
        name,
        model: code || null,
        mac_address: mac || null,
        ip_address: ip || null,
        location: location || null,
        device_type: deviceType || null,
        phone: phone || null,
        notes: notes || null,
        is_deleted: false,
      },
      extName: extName || null,
      extMac: extMac || null,
    })
  })

  if (routerRows.length === 0) {
    return { total, inserted: 0, skipped, errors }
  }

  const toInsert = routerRows.map((row) => row.payload)
  const extenderPending = routerRows.map((row, index) => ({
    index,
    extName: row.extName,
    extMac: row.extMac,
  }))

  const { data: inserted, error } = await supabase
    .from('network_routers')
    .insert(toInsert)
    .select('id')

  if (error) throw new Error(error.message)

  const extenderRows: Record<string, unknown>[] = []
  inserted?.forEach((r, i) => {
    const ext = extenderPending[i]
    if (!ext?.extName && !ext?.extMac) return
    extenderRows.push({
      tenant_id: tenantId,
      router_id: r.id,
      name: ext.extName,
      mac_address: ext.extMac,
      is_deleted: false,
    })
  })

  if (extenderRows.length > 0) {
    await batchInsert(supabase, 'network_extenders', extenderRows)
  }

  return { total, inserted: inserted?.length ?? 0, skipped, errors }
}

/** استيراد ورقة Excel واحدة إلى بورت محدّد */
export async function importNetworkRoutersToPort(options: {
  sheet: ExcelJS.Worksheet
  tenantId: string
  portId: string
  portLabel: string
  supabase: SupabaseClient
}): Promise<NetworkImportResult> {
  const { sheet, tenantId, portId, portLabel, supabase } = options

  const result = await importSingleRouterSheet({
    sheet,
    sheetLabel: portLabel,
    tenantId,
    portId,
    supabase,
  })

  return {
    ...result,
    byPort: {
      [portLabel]: {
        inserted: result.inserted,
        skipped: result.skipped,
        total: result.total,
      },
    },
  }
}

/** @deprecated — استيراد متعدد التبويبات (ترحيل قديم) */
export async function importNetworkRoutersWorkbook(options: {
  workbook: ExcelJS.Workbook
  tenantId: string
  supabase: SupabaseClient
}): Promise<NetworkImportResult> {
  const { workbook, tenantId, supabase } = options
  const sheets = listRouterImportSheets(workbook)

  if (sheets.length === 0) {
    throw new Error(
      'لم تُعثر على أوراق Port صالحة — تأكد أن كل ورقة تحمل اسم «Port 1» … «Port 9» مع الترويسة الصحيحة',
    )
  }

  const byPort: Record<string, { inserted: number; skipped: number; total: number }> = {}

  let total = 0
  let inserted = 0
  let skipped = 0
  const errors: NetworkImportError[] = []

  for (const { sheet, portNumber, portLabel } of sheets) {
    const portId = await ensureNetworkPort(supabase, tenantId, portNumber)
    const sheetResult = await importSingleRouterSheet({
      sheet,
      sheetLabel: `${portLabel} (${sheet.name})`,
      tenantId,
      portId,
      supabase,
    })

    total += sheetResult.total
    inserted += sheetResult.inserted
    skipped += sheetResult.skipped
    errors.push(...sheetResult.errors)
    byPort[portLabel] = {
      inserted: sheetResult.inserted,
      skipped: sheetResult.skipped,
      total: sheetResult.total,
    }
  }

  return { total, inserted, skipped, errors, byPort }
}

export async function importNetworkBypassedSheet(options: {
  sheet: ExcelJS.Worksheet
  tenantId: string
  portId: string | null
  supabase: SupabaseClient
}): Promise<NetworkImportResult> {
  const { sheet, tenantId, portId, supabase } = options
  const templateError = validateNetworkBypassedTemplate(sheet)
  if (templateError) throw new Error(templateError)

  const errors: NetworkImportError[] = []
  let total = 0
  let skipped = 0
  const validRows: Record<string, unknown>[] = []

  sheet.eachRow((row, rowNum) => {
    if (rowNum < NETWORK_BYPASSED_TEMPLATE.dataStartRow) return

    const ip = cellStr(row, 2)
    const code = cellStr(row, 3)
    const mac = cellStr(row, 4)
    const location = cellStr(row, 5)
    const ssid = cellStr(row, 6)
    const deviceType = cellStr(row, 7)
    const phone = cellStr(row, 8)
    const notes = cellStr(row, 9)

    if (!rowHasData([ip, code, mac, location, ssid, deviceType, phone, notes])) return

    total++
    const name = ssid || ip || mac

    validRows.push({
      tenant_id: tenantId,
      port_id: portId,
      name,
      mac_address: mac || null,
      ip_address: ip || null,
      location: location || null,
      device_type: deviceType || null,
      phone: phone || null,
      notes: [code, notes].filter(Boolean).join(' — ') || null,
      is_deleted: false,
    })
  })

  if (validRows.length > 0) {
    await batchInsert(supabase, 'network_bypassed', validRows)
  }

  return { total, inserted: validRows.length, skipped, errors }
}
