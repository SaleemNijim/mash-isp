/**
 * components/excel/ExcelImportEngine.ts
 *
 * Excel import engine for MASH ISP.
 * Uses exceljs exclusively — §5.5 (ممنوع import من 'xlsx').
 */

import ExcelJS from 'exceljs'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Public Types
// ─────────────────────────────────────────────────────────────────────────────

export type ImportType =
  | 'subscribers_payments'
  | 'broadband_credentials'
  | 'we_subscribers'
  | 'bb_subscribers'
  | 'network_routers'
  | 'card_inventory'
  | 'card_distributor_sales'

export interface ImportError {
  row: number
  reason: string
}

export interface ImportResult {
  total: number
  inserted: number
  updated: number
  skipped: number
  errors: ImportError[]
}

export interface ImportOptions {
  workbook: ExcelJS.Workbook
  tenantId: string
  /** auth.uid() of the performing user */
  performedBy: string
  fileName: string
  supabase: SupabaseClient
  /** Auto-detected from row-1 headers when omitted */
  importType?: ImportType
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Constants
// ─────────────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 500

/**
 * Column fingerprints per import type.
 * Each inner array = a list of aliases for ONE required signature field.
 * Detection score = # of signature fields whose alias appears in the headers.
 * Minimum score of 2 needed for a confident match.
 */
const TYPE_SIGNATURES: Record<ImportType, string[][]> = {
  subscribers_payments: [
    ['customer_name', 'اسم العميل', 'عميل', 'الاسم'],
    ['amount', 'المبلغ', 'مبلغ', 'الدفعة'],
    ['method', 'طريقة الدفع', 'الطريقة', 'نوع الدفع'],
  ],
  broadband_credentials: [
    ['username', 'يوزر', 'اسم المستخدم', 'user', 'مستخدم'],
    ['password', 'كلمة المرور', 'باسورد', 'pass'],
  ],
  we_subscribers: [
    ['we_number', 'رقم we', 'رقم_we', 'حساب we', 'رقم الـ we'],
    ['name', 'الاسم', 'اسم العميل', 'العميل'],
  ],
  bb_subscribers: [
    ['speed', 'السرعة', 'سرعة الخط', 'سرعة'],
    ['start_date', 'تاريخ البداية', 'بداية', 'من'],
    ['name', 'الاسم', 'اسم العميل', 'العميل'],
  ],
  network_routers: [
    ['mac_address', 'mac', 'عنوان الماك', 'ماك', 'الماك'],
    ['device_type', 'نوع الجهاز', 'نوع', 'الجهاز', 'جهاز'],
  ],
  card_inventory: [
    ['denomination', 'الفئة', 'القيمة', 'فئة'],
    ['quantity', 'الكمية', 'كمية'],
  ],
  card_distributor_sales: [
    ['distributor_name', 'اسم الموزع', 'الموزع'],
    ['commission_percent', 'نسبة العمولة', 'عمولة', 'commission'],
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Private Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeKey(s: unknown): string {
  return String(s ?? '').trim().toLowerCase().replace(/[\s_\-]+/g, '')
}

/**
 * §5.5 — خلفية حمراء → is_used=true.
 * Checks cells 1–3 of the row for a red ARGB fill color.
 */
function isRedBackground(row: ExcelJS.Row): boolean {
  for (let col = 1; col <= 3; col++) {
    const fill = row.getCell(col).fill as ExcelJS.FillPattern | undefined
    const argb = fill?.fgColor?.argb?.toUpperCase() ?? ''
    if (!argb) continue
    if (argb === 'FFFF0000') return true     // standard Excel red
    if (argb.startsWith('FFE')) return true  // §5.5 blueprint pattern
  }
  return false
}

/**
 * Normalizes device_type variants to "DD-WRT".
 * Handles: dd-WRT / dd-wart / ddwrt / DD WRT (any case, any separator).
 */
function normalizeDeviceType(raw: string): string {
  const cleaned = raw.toLowerCase().replace(/[\s\-_]+/g, '')
  if (/^dd(wrt|wart|w[ar]rt)$/i.test(cleaned)) return 'DD-WRT'
  return raw.trim()
}

function cellStrFromValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return String(v)
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).trim()
}

function cellStr(row: ExcelJS.Row, col: number): string {
  if (col < 1) return ''
  const v = row.getCell(col).value
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return String(v)
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    // Formula result
    if ('result' in v) return cellStrFromValue((v as { result: unknown }).result)
    // Rich text
    if ('richText' in v) {
      return (v as { richText: Array<{ text: string }> })
        .richText.map(rt => rt.text).join('').trim()
    }
    // Hyperlink
    if ('text' in v) {
      const t = (v as { text: unknown }).text
      if (typeof t === 'string') return t.trim()
      if (t && typeof t === 'object' && 'richText' in t)
        return (t as { richText: Array<{ text: string }> })
          .richText.map(rt => rt.text).join('').trim()
    }
  }
  return ''
}

function cellNum(row: ExcelJS.Row, col: number): number | null {
  if (col < 1) return null
  const s = cellStr(row, col)
  if (!s) return null
  const n = parseFloat(s.replace(/,/g, ''))
  return isNaN(n) ? null : n
}

function cellDate(row: ExcelJS.Row, col: number): string | null {
  if (col < 1) return null
  const cell = row.getCell(col)
  if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10)
  const s = cellStr(row, col)
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10)
}

function getHeaders(sheet: ExcelJS.Worksheet): string[] {
  const headers: string[] = []
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNum) => {
    headers[colNum - 1] = normalizeKey(cell.value)
  })
  return headers
}

/** Returns 1-based column index, or -1 if not found */
function findCol(headers: string[], aliases: string[]): number {
  const norm = aliases.map(normalizeKey)
  for (let i = 0; i < headers.length; i++) {
    if (norm.includes(headers[i])) return i + 1
  }
  return -1
}

async function batchInsert(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + BATCH_SIZE))
    if (error) throw new Error(`Insert error on ${table}: ${error.message}`)
  }
}

async function batchUpsert(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const { error } = await supabase
      .from(table)
      .upsert(rows.slice(i, i + BATCH_SIZE), { onConflict })
    if (error) throw new Error(`Upsert error on ${table}: ${error.message}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: detectImportType
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Guesses the import type from column headers in row 1.
 * Returns null when no type reaches the minimum confidence score (2 fields).
 */
export function detectImportType(sheet: ExcelJS.Worksheet): ImportType | null {
  const headers = getHeaders(sheet)
  let bestType: ImportType | null = null
  let bestScore = 0

  for (const [type, signature] of Object.entries(TYPE_SIGNATURES) as Array<
    [ImportType, string[][]]
  >) {
    const score = signature.reduce((acc, aliases) => {
      const normAliases = aliases.map(normalizeKey)
      return acc + (headers.some(h => normAliases.includes(h)) ? 1 : 0)
    }, 0)

    if (score > bestScore) {
      bestScore = score
      bestType = type
    }
  }

  return bestScore >= 2 ? bestType : null
}

// ─────────────────────────────────────────────────────────────────────────────
// Private Handlers
// ─────────────────────────────────────────────────────────────────────────────

/** broadband_credentials — §5.5: red background → is_used=true */
async function importBroadbandCredentials(
  sheet: ExcelJS.Worksheet,
  tenantId: string,
  supabase: SupabaseClient,
): Promise<ImportResult> {
  const headers = getHeaders(sheet)
  const usernameCol = findCol(headers, ['username', 'يوزر', 'اسم المستخدم', 'user', 'مستخدم'])
  const passwordCol = findCol(headers, ['password', 'كلمة المرور', 'باسورد', 'pass'])
  const typeCol     = findCol(headers, ['type', 'نوع', 'النوع', 'نوع الخدمة'])

  const errors: ImportError[] = []
  const seenInFile = new Set<string>()
  const validRows: Record<string, unknown>[] = []
  let total = 0
  let skipped = 0

  // Collect all sheet usernames for a single bulk DB lookup
  const sheetUsernames: string[] = []
  sheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return
    const u = cellStr(row, usernameCol)
    if (u) sheetUsernames.push(u)
  })

  // Bulk fetch existing usernames to avoid N+1 queries
  const dbSet = new Set<string>()
  if (sheetUsernames.length > 0) {
    const { data } = await supabase
      .from('internet_credentials')
      .select('username')
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .in('username', sheetUsernames)
    data?.forEach(r => dbSet.add(r.username as string))
  }

  sheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return
    total++

    const username = cellStr(row, usernameCol)
    const password = cellStr(row, passwordCol)

    if (!username) {
      errors.push({ row: rowNum, reason: 'username فارغ' })
      skipped++
      return
    }

    // Duplicate within file → skip
    if (seenInFile.has(username)) {
      errors.push({ row: rowNum, reason: `username مكرر داخل الملف: ${username}` })
      skipped++
      return
    }

    // Already exists in DB → skip
    if (dbSet.has(username)) {
      errors.push({ row: rowNum, reason: `username موجود في قاعدة البيانات: ${username}` })
      skipped++
      return
    }

    seenInFile.add(username)

    const credType = typeCol !== -1 ? (cellStr(row, typeCol) || 'bb') : 'bb'
    const isUsed = isRedBackground(row) // §5.5

    validRows.push({
      tenant_id: tenantId,
      username,
      password: password || null,
      type: credType,
      is_used: isUsed,
      is_deleted: false,
    })
  })

  if (validRows.length > 0) {
    await supabase.rpc('bulk_insert_credentials', { p_rows: validRows })
  }

  return { total, inserted: validRows.length, updated: 0, skipped, errors }
}

/** Shared logic for we_subscribers and bb_subscribers */
async function importSubscribersGeneric(
  sheet: ExcelJS.Worksheet,
  tenantId: string,
  supabase: SupabaseClient,
  subType: 'bb' | 'we',
): Promise<ImportResult> {
  const headers = getHeaders(sheet)
  const nameCol      = findCol(headers, ['name', 'الاسم', 'اسم العميل', 'العميل'])
  const phoneCol     = findCol(headers, ['phone', 'الهاتف', 'هاتف', 'رقم الهاتف', 'موبايل'])
  const addressCol   = findCol(headers, ['address', 'العنوان', 'عنوان'])
  const speedCol     = findCol(headers, ['speed', 'السرعة', 'سرعة الخط', 'سرعة'])
  const priceCol     = findCol(headers, ['price', 'السعر', 'سعر', 'الاشتراك'])
  const startDateCol = findCol(headers, ['start_date', 'تاريخ البداية', 'بداية', 'من'])
  const endDateCol   = findCol(headers, ['end_date', 'تاريخ الانتهاء', 'الانتهاء', 'إلى'])
  const statusCol    = findCol(headers, ['status', 'الحالة', 'حالة'])
  const notesCol     = findCol(headers, ['notes', 'ملاحظات', 'ملاحظة'])

  interface ProcessedRow {
    name: string
    phone: string
    address: string | null
    speed: string | null
    price: number | null
    start_date: string | null
    end_date: string | null
    status: string | null
    notes: string | null
  }

  const errors: ImportError[] = []
  const seenInFile = new Set<string>()
  const processedRows: ProcessedRow[] = []
  let total = 0
  let skipped = 0

  sheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return
    total++

    const name  = cellStr(row, nameCol)
    const phone = cellStr(row, phoneCol)

    if (!name) {
      errors.push({ row: rowNum, reason: 'اسم العميل فارغ' })
      skipped++
      return
    }

    const key = `${name}|${phone}`
    if (seenInFile.has(key)) {
      errors.push({ row: rowNum, reason: `مشترك مكرر داخل الملف: ${name}` })
      skipped++
      return
    }
    seenInFile.add(key)

    processedRows.push({
      name,
      phone,
      address: addressCol !== -1 ? cellStr(row, addressCol) || null : null,
      speed: speedCol !== -1 ? cellStr(row, speedCol) || null : null,
      price: cellNum(row, priceCol),
      start_date: cellDate(row, startDateCol),
      end_date: cellDate(row, endDateCol),
      status: statusCol !== -1 ? cellStr(row, statusCol) || null : null,
      notes: notesCol !== -1 ? cellStr(row, notesCol) || null : null,
    })
  })

  if (processedRows.length === 0) {
    return { total, inserted: 0, updated: 0, skipped, errors }
  }

  // Bulk-check existing customers to avoid duplicates
  const uniqueNames = [...new Set(processedRows.map(r => r.name))]
  const { data: existingCustomers } = await supabase
    .from('customers')
    .select('id, name, phone')
    .eq('tenant_id', tenantId)
    .eq('is_deleted', false)
    .in('name', uniqueNames)

  const customerMap = new Map<string, string>() // "name|phone" → id
  existingCustomers?.forEach(c =>
    customerMap.set(`${c.name}|${c.phone}`, c.id as string),
  )

  // Insert new customers in batches and collect their IDs
  const newCustomers = processedRows.filter(
    r => !customerMap.has(`${r.name}|${r.phone}`),
  )
  for (let i = 0; i < newCustomers.length; i += BATCH_SIZE) {
    const chunk = newCustomers.slice(i, i + BATCH_SIZE).map(r => ({
      tenant_id: tenantId,
      name: r.name,
      phone: r.phone || null,
      address: r.address,
      is_deleted: false,
    }))
    const { data: inserted, error } = await supabase
      .from('customers')
      .insert(chunk)
      .select('id, name, phone')
    if (error) throw new Error(`Customer insert error: ${error.message}`)
    inserted?.forEach(c =>
      customerMap.set(`${c.name}|${c.phone}`, c.id as string),
    )
  }

  // Build subscription rows for all processed rows
  const subscriptionRows = processedRows
    .filter(r => customerMap.has(`${r.name}|${r.phone}`))
    .map(r => ({
      tenant_id: tenantId,
      customer_id: customerMap.get(`${r.name}|${r.phone}`),
      type: subType,
      speed: r.speed,
      price: r.price,
      start_date: r.start_date,
      end_date: r.end_date,
      status: r.status || 'active',
      is_deleted: false,
    }))

  if (subscriptionRows.length > 0) {
    await batchInsert(supabase, 'subscriptions', subscriptionRows)
  }

  return { total, inserted: subscriptionRows.length, updated: 0, skipped, errors }
}

async function importWeSubscribers(
  sheet: ExcelJS.Worksheet,
  tenantId: string,
  supabase: SupabaseClient,
): Promise<ImportResult> {
  return importSubscribersGeneric(sheet, tenantId, supabase, 'we')
}

async function importBbSubscribers(
  sheet: ExcelJS.Worksheet,
  tenantId: string,
  supabase: SupabaseClient,
): Promise<ImportResult> {
  return importSubscribersGeneric(sheet, tenantId, supabase, 'bb')
}

async function importSubscribersPayments(
  sheet: ExcelJS.Worksheet,
  tenantId: string,
  supabase: SupabaseClient,
): Promise<ImportResult> {
  const headers = getHeaders(sheet)
  const customerNameCol = findCol(headers, ['customer_name', 'اسم العميل', 'الاسم', 'عميل'])
  const amountCol       = findCol(headers, ['amount', 'المبلغ', 'مبلغ', 'الدفعة'])
  const methodCol       = findCol(headers, ['method', 'طريقة الدفع', 'الطريقة', 'نوع الدفع'])
  const paidAtCol       = findCol(headers, ['paid_at', 'تاريخ الدفع', 'تاريخ', 'date'])
  const notesCol        = findCol(headers, ['notes', 'ملاحظات', 'ملاحظة'])

  const ALLOWED_METHODS = ['cash', 'debt', 'reflect', 'jawwal_pay', 'bank']

  const errors: ImportError[] = []
  const pending: Array<{
    customerName: string
    amount: number
    method: string
    paidAt: string | null
    notes: string | null
  }> = []
  let total = 0
  let skipped = 0

  sheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return
    total++

    const customerName = cellStr(row, customerNameCol)
    const amount       = cellNum(row, amountCol)
    const methodRaw    = cellStr(row, methodCol)

    if (!customerName || amount === null || !methodRaw) {
      errors.push({ row: rowNum, reason: 'بيانات ناقصة: اسم العميل أو المبلغ أو طريقة الدفع' })
      skipped++
      return
    }

    const method = ALLOWED_METHODS.includes(methodRaw.toLowerCase())
      ? methodRaw.toLowerCase()
      : 'cash'

    pending.push({
      customerName,
      amount,
      method,
      paidAt: cellDate(row, paidAtCol),
      notes: notesCol !== -1 ? cellStr(row, notesCol) || null : null,
    })
  })

  if (pending.length === 0) {
    return { total, inserted: 0, updated: 0, skipped, errors }
  }

  // Find or create customers
  const uniqueNames = [...new Set(pending.map(p => p.customerName))]
  const { data: existingCustomers } = await supabase
    .from('customers')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('is_deleted', false)
    .in('name', uniqueNames)

  const customerIdMap = new Map<string, string>()
  existingCustomers?.forEach(c => customerIdMap.set(c.name as string, c.id as string))

  const missingNames = uniqueNames.filter(n => !customerIdMap.has(n))
  if (missingNames.length > 0) {
    const { data: newCustomers } = await supabase
      .from('customers')
      .insert(missingNames.map(name => ({ tenant_id: tenantId, name, is_deleted: false })))
      .select('id, name')
    newCustomers?.forEach(c => customerIdMap.set(c.name as string, c.id as string))
  }

  const paymentRows = pending
    .filter(p => customerIdMap.has(p.customerName))
    .map(p => ({
      tenant_id: tenantId,
      customer_id: customerIdMap.get(p.customerName),
      amount: p.amount,
      method: p.method,
      paid_at: p.paidAt ? new Date(p.paidAt).toISOString() : new Date().toISOString(),
      notes: p.notes,
      is_deleted: false,
    }))

  if (paymentRows.length > 0) {
    await batchInsert(supabase, 'payments', paymentRows)
  }

  return { total, inserted: paymentRows.length, updated: 0, skipped, errors }
}

async function importNetworkRouters(
  sheet: ExcelJS.Worksheet,
  tenantId: string,
  supabase: SupabaseClient,
): Promise<ImportResult> {
  const headers = getHeaders(sheet)
  const nameCol       = findCol(headers, ['name', 'الاسم', 'اسم الجهاز', 'جهاز'])
  const modelCol      = findCol(headers, ['model', 'النموذج', 'موديل', 'الموديل'])
  const macCol        = findCol(headers, ['mac_address', 'mac', 'عنوان الماك', 'ماك', 'الماك'])
  const ipCol         = findCol(headers, ['ip_address', 'ip', 'عنوان ip', 'آيبي'])
  const locationCol   = findCol(headers, ['location', 'الموقع', 'موقع'])
  const deviceTypeCol = findCol(headers, ['device_type', 'نوع الجهاز', 'نوع', 'الجهاز', 'جهاز'])

  const errors: ImportError[] = []
  const seenMacs = new Set<string>()
  const validRows: Record<string, unknown>[] = []
  let total = 0
  let skipped = 0

  sheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return
    total++

    const name = cellStr(row, nameCol)
    if (!name) {
      errors.push({ row: rowNum, reason: 'اسم الجهاز فارغ' })
      skipped++
      return
    }

    const mac = macCol !== -1 ? cellStr(row, macCol) : ''
    if (mac) {
      const macUp = mac.toUpperCase()
      if (seenMacs.has(macUp)) {
        errors.push({ row: rowNum, reason: `MAC مكرر داخل الملف: ${mac}` })
        skipped++
        return
      }
      seenMacs.add(macUp)
    }

    const deviceRaw = deviceTypeCol !== -1 ? cellStr(row, deviceTypeCol) : ''

    validRows.push({
      tenant_id: tenantId,
      name,
      model: modelCol !== -1 ? cellStr(row, modelCol) || null : null,
      mac_address: mac || null,
      ip_address: ipCol !== -1 ? cellStr(row, ipCol) || null : null,
      location: locationCol !== -1 ? cellStr(row, locationCol) || null : null,
      device_type: deviceRaw ? normalizeDeviceType(deviceRaw) : null,
      is_deleted: false,
    })
  })

  if (validRows.length > 0) {
    await batchInsert(supabase, 'network_routers', validRows)
  }

  return { total, inserted: validRows.length, updated: 0, skipped, errors }
}

async function importCardInventory(
  sheet: ExcelJS.Worksheet,
  tenantId: string,
  supabase: SupabaseClient,
): Promise<ImportResult> {
  const headers = getHeaders(sheet)
  const nameCol      = findCol(headers, ['product_name', 'اسم المنتج', 'اسم البطاقة', 'المنتج', 'البطاقة'])
  const denomCol     = findCol(headers, ['denomination', 'الفئة', 'القيمة', 'فئة'])
  const quantityCol  = findCol(headers, ['quantity', 'الكمية', 'كمية', 'الكمية المتاحة'])
  const costPriceCol = findCol(headers, ['cost_price', 'سعر التكلفة', 'التكلفة', 'تكلفة'])
  const salePriceCol = findCol(headers, ['sale_price', 'سعر البيع', 'البيع', 'بيع'])
  const minQtyCol    = findCol(headers, ['min_quantity', 'الحد الأدنى', 'الحد الادنى', 'حد أدنى'])

  const errors: ImportError[] = []
  const seenNames = new Set<string>()
  let total = 0
  let skipped = 0

  // Collect names for bulk existence check
  const allNames: string[] = []
  sheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return
    const n = cellStr(row, nameCol)
    if (n) allNames.push(n)
  })

  const { data: existing } = await supabase
    .from('card_products')
    .select('name')
    .eq('tenant_id', tenantId)
    .eq('is_deleted', false)
    .in('name', allNames)

  const existingNames = new Set(existing?.map(p => p.name as string) ?? [])

  const newRows: Record<string, unknown>[] = []
  const updateRows: Record<string, unknown>[] = []

  sheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return
    total++

    const name = cellStr(row, nameCol)
    if (!name) {
      errors.push({ row: rowNum, reason: 'اسم المنتج فارغ' })
      skipped++
      return
    }

    if (seenNames.has(name)) {
      errors.push({ row: rowNum, reason: `منتج مكرر داخل الملف: ${name}` })
      skipped++
      return
    }
    seenNames.add(name)

    const rowData = {
      tenant_id: tenantId,
      name,
      denomination: cellNum(row, denomCol),
      quantity_in_stock: cellNum(row, quantityCol) ?? 0,
      cost_price: cellNum(row, costPriceCol),
      sale_price: cellNum(row, salePriceCol),
      min_quantity: cellNum(row, minQtyCol) ?? 0,
      is_deleted: false,
    }

    if (existingNames.has(name)) {
      updateRows.push(rowData)
    } else {
      newRows.push(rowData)
    }
  })

  // Upsert existing products (updates), insert new ones
  if (updateRows.length > 0) {
    await batchUpsert(supabase, 'card_products', updateRows, 'tenant_id,name')
  }
  if (newRows.length > 0) {
    await batchInsert(supabase, 'card_products', newRows)
  }

  return {
    total,
    inserted: newRows.length,
    updated: updateRows.length,
    skipped,
    errors,
  }
}

async function importCardDistributorSales(
  sheet: ExcelJS.Worksheet,
  tenantId: string,
  supabase: SupabaseClient,
): Promise<ImportResult> {
  const headers = getHeaders(sheet)
  const distNameCol    = findCol(headers, ['distributor_name', 'اسم الموزع', 'الموزع'])
  const totalAmountCol = findCol(headers, ['total_amount', 'المبلغ الإجمالي', 'الإجمالي', 'مبلغ'])
  const commCol        = findCol(headers, ['commission_percent', 'نسبة العمولة', 'عمولة', 'commission'])
  const prevBalCol     = findCol(headers, ['previous_balance', 'الرصيد السابق', 'الرصيد', 'رصيد'])

  const errors: ImportError[] = []
  const validRows: Record<string, unknown>[] = []
  let total = 0
  let skipped = 0

  sheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return
    total++

    const distributorName = cellStr(row, distNameCol)
    const totalAmount = cellNum(row, totalAmountCol)

    if (!distributorName || totalAmount === null) {
      errors.push({ row: rowNum, reason: 'اسم الموزع أو المبلغ الإجمالي فارغ' })
      skipped++
      return
    }

    const prevBalance = cellNum(row, prevBalCol) ?? 0
    // BM4: previous_balance دائماً >= 0
    const safePrevBalance = Math.max(0, prevBalance)

    validRows.push({
      tenant_id: tenantId,
      distributor_name: distributorName,
      total_amount: totalAmount,
      commission_percent: cellNum(row, commCol),
      previous_balance: safePrevBalance,
      is_deleted: false,
    })
  })

  if (validRows.length > 0) {
    await batchInsert(supabase, 'card_distributor_sales', validRows)
  }

  return { total, inserted: validRows.length, updated: 0, skipped, errors }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private: logImportResult
// ─────────────────────────────────────────────────────────────────────────────

async function logImportResult(
  supabase: SupabaseClient,
  tenantId: string,
  performedBy: string,
  fileName: string,
  importType: ImportType,
  result: ImportResult,
): Promise<void> {
  const { error } = await supabase.from('imports').insert({
    tenant_id: tenantId,
    file_name: fileName,
    import_type: importType,
    total: result.total,
    inserted: result.inserted,
    updated: result.updated,
    skipped: result.skipped,
    errors: result.errors.length > 0 ? result.errors : null,
    performed_by: performedBy,
    is_deleted: false,
  })
  if (error) {
    // Non-critical — log to console without throwing
    console.error('[ExcelImportEngine] imports log failed:', error.message)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: processImport — Main Entry Point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Processes an Excel workbook and imports data into the appropriate DB tables.
 * Uses the first worksheet. Auto-detects the import type from headers when
 * `importType` is not provided in options.
 *
 * @throws when the sheet is empty, the type cannot be determined, or a DB
 *         batch operation fails. Per-row validation issues are collected into
 *         the returned `errors` array and counted as `skipped`.
 */
export async function processImport(options: ImportOptions): Promise<ImportResult> {
  const { workbook, tenantId, performedBy, fileName, supabase } = options
  const sheet = workbook.worksheets[0]

  if (!sheet) throw new Error('الملف لا يحتوي على أي ورقة عمل')

  const importType = options.importType ?? detectImportType(sheet)
  if (!importType) {
    throw new Error(
      'تعذّر تحديد نوع الاستيراد من أسماء الأعمدة — تأكد من وجود ترويسة في الصف الأول',
    )
  }

  let result: ImportResult

  switch (importType) {
    case 'broadband_credentials':
      result = await importBroadbandCredentials(sheet, tenantId, supabase)
      break
    case 'we_subscribers':
      result = await importWeSubscribers(sheet, tenantId, supabase)
      break
    case 'bb_subscribers':
      result = await importBbSubscribers(sheet, tenantId, supabase)
      break
    case 'subscribers_payments':
      result = await importSubscribersPayments(sheet, tenantId, supabase)
      break
    case 'network_routers':
      result = await importNetworkRouters(sheet, tenantId, supabase)
      break
    case 'card_inventory':
      result = await importCardInventory(sheet, tenantId, supabase)
      break
    case 'card_distributor_sales':
      result = await importCardDistributorSales(sheet, tenantId, supabase)
      break
  }

  await logImportResult(supabase, tenantId, performedBy, fileName, importType, result)

  return result
}
