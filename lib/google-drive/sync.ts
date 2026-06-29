import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildDistributorsWorkbookBuffer,
  buildRoutersWorkbookBuffer,
  type RouterDriveRow,
} from '@/lib/excel/drive-sync-exports'
import {
  buildMonthlyRenewalsWorkbookBuffer,
  getMonthlyRenewalsFileName,
  type MonthlyRenewalExportRow,
} from '@/lib/excel/monthly-renewals-export'
import { deleteDriveFile, ensureDriveFolder, uploadExcelFile } from '@/lib/google-drive/drive-api'
import { getValidAccessToken, type DriveSyncTokens } from '@/lib/google-drive/client'

type DriveSyncRecord = DriveSyncTokens & {
  tenant_id: string
  drive_folder_id: string | null
  drive_folder_name: string | null
  file_ids: Record<string, string> | null
}

type NetworkRouterQueryRow = {
  name: string
  ip_address: string | null
  model: string | null
  mac_address: string | null
  location: string | null
  device_type: string | null
  phone: string | null
  notes: string | null
  port_id: string | null
  network_ports?: { name?: string | null } | { name?: string | null }[] | null
}

type RenewalQueryRow = {
  period_start: string | null
  paid_at: string | null
  username: string | null
  speed: string | null
  mac_address: string | null
  billing_label: string | null
  amount_due: number | null
  cash_amount: number | null
  app_amount: number | null
  discount_amount: number | null
  balance_remaining: number | null
  notes: string | null
  customers?: { name?: string | null; phone?: string | null } | { name?: string | null; phone?: string | null }[] | null
  internet_credentials?: { password?: string | null } | { password?: string | null }[] | null
}

interface SyncResult {
  tenantId: string
  filesUploaded: number
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || 'export'
}

function monthKey(date: string): string {
  return date.slice(0, 7)
}

function normalizeJoin<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

async function updateSyncRecord(
  admin: SupabaseClient,
  tenantId: string,
  values: Record<string, unknown> | DriveSyncTokens,
): Promise<void> {
  const { error } = await admin.from('tenant_drive_sync').update(values).eq('tenant_id', tenantId)
  if (error) throw new Error(error.message)
}

async function getTenantName(admin: SupabaseClient, tenantId: string): Promise<string> {
  const { data, error } = await admin.from('tenants').select('name').eq('id', tenantId).single()
  if (error || !data?.name) throw new Error(error?.message ?? 'Tenant not found')
  return data.name
}

async function syncDistributors(options: {
  admin: SupabaseClient
  accessToken: string
  tenantId: string
  folderId: string
  fileIds: Record<string, string>
}): Promise<number> {
  const { data, error } = await options.admin
    .from('distributors')
    .select('name,phone,address,notes')
    .eq('tenant_id', options.tenantId)
    .eq('is_deleted', false)
    .order('name', { ascending: true })

  if (error) throw new Error(error.message)

  const buffer = await buildDistributorsWorkbookBuffer(data ?? [])
  const id = await uploadExcelFile({
    accessToken: options.accessToken,
    folderId: options.folderId,
    fileId: options.fileIds.distributors,
    fileName: 'الموزعون.xlsx',
    buffer,
  })
  options.fileIds.distributors = id
  return 1
}

async function syncRouters(options: {
  admin: SupabaseClient
  accessToken: string
  tenantId: string
  rootFolderId: string
  fileIds: Record<string, string>
}): Promise<number> {
  const routersFolderId = await ensureDriveFolder({
    accessToken: options.accessToken,
    name: 'راوترات',
    parentId: options.rootFolderId,
  })
  options.fileIds['folder:routers'] = routersFolderId

  const { data, error } = await options.admin
    .from('network_routers')
    .select('name,ip_address,model,mac_address,location,device_type,phone,notes,port_id,network_ports(name)')
    .eq('tenant_id', options.tenantId)
    .eq('is_deleted', false)
    .order('name', { ascending: true })

  if (error) throw new Error(error.message)

  const grouped = new Map<string, { portName: string; rows: RouterDriveRow[] }>()
  for (const router of (data ?? []) as NetworkRouterQueryRow[]) {
    const port = normalizeJoin<{ name?: string | null }>(router.network_ports)
    const portId = router.port_id ?? 'بدون-بورت'
    const portName = port?.name ?? 'بدون بورت'
    const current = grouped.get(portId) ?? { portName, rows: [] }
    current.rows.push({
      port_name: portName,
      name: router.name,
      ip_address: router.ip_address,
      model: router.model,
      mac_address: router.mac_address,
      location: router.location,
      device_type: router.device_type,
      phone: router.phone,
      notes: router.notes,
    })
    grouped.set(portId, current)
  }

  let count = 0
  const currentKeys = new Set<string>()
  for (const [portId, group] of grouped) {
    const key = `router-port:${portId}`
    currentKeys.add(key)
    const buffer = await buildRoutersWorkbookBuffer({
      portName: group.portName,
      rows: group.rows,
    })
    const id = await uploadExcelFile({
      accessToken: options.accessToken,
      folderId: routersFolderId,
      fileId: options.fileIds[key],
      fileName: `${sanitizeFileName(group.portName)}.xlsx`,
      buffer,
    })
    options.fileIds[key] = id
    count += 1
  }

  for (const [key, fileId] of Object.entries(options.fileIds)) {
    if (key.startsWith('router-port:') && !currentKeys.has(key)) {
      await deleteDriveFile({ accessToken: options.accessToken, fileId })
      delete options.fileIds[key]
    }
  }

  return count
}

async function syncMonthlyRenewals(options: {
  admin: SupabaseClient
  accessToken: string
  tenantId: string
  tenantName: string
  folderId: string
  fileIds: Record<string, string>
}): Promise<number> {
  const { data, error } = await options.admin
    .from('subscription_periods')
    .select(
      'period_start,paid_at,username,speed,mac_address,billing_label,amount_due,cash_amount,app_amount,discount_amount,balance_remaining,notes,customers(name,phone),internet_credentials(password)',
    )
    .eq('tenant_id', options.tenantId)
    .eq('is_deleted', false)
    .order('period_start', { ascending: true })

  if (error) throw new Error(error.message)

  const grouped = new Map<string, MonthlyRenewalExportRow[]>()
  for (const row of (data ?? []) as RenewalQueryRow[]) {
    const periodStart = row.period_start
    if (!periodStart) continue

    const customer = normalizeJoin<{ name?: string | null; phone?: string | null }>(row.customers)
    const credential = normalizeJoin<{ password?: string | null }>(row.internet_credentials)
    const key = monthKey(periodStart)
    const rows = grouped.get(key) ?? []
    rows.push({
      customer_name: customer?.name ?? null,
      customer_phone: customer?.phone ?? null,
      username: row.username ?? null,
      password: credential?.password ?? null,
      speed: row.speed ?? null,
      mac_address: row.mac_address ?? null,
      billing_label: row.billing_label ?? null,
      amount_due: row.amount_due ?? null,
      cash_amount: row.cash_amount ?? null,
      app_amount: row.app_amount ?? null,
      discount_amount: row.discount_amount ?? null,
      balance_remaining: row.balance_remaining ?? null,
      period_start: periodStart,
      paid_at: row.paid_at ?? null,
      notes: row.notes ?? null,
    })
    grouped.set(key, rows)
  }

  let count = 0
  const currentKeys = new Set<string>()
  for (const [month, rows] of grouped) {
    const key = `renewals:${month}`
    currentKeys.add(key)
    const buffer = await buildMonthlyRenewalsWorkbookBuffer({
      companyName: options.tenantName,
      month,
      rows,
    })
    const id = await uploadExcelFile({
      accessToken: options.accessToken,
      folderId: options.folderId,
      fileId: options.fileIds[key],
      fileName: getMonthlyRenewalsFileName(month),
      buffer,
    })
    options.fileIds[key] = id
    count += 1
  }

  for (const [key, fileId] of Object.entries(options.fileIds)) {
    if (key.startsWith('renewals:') && !currentKeys.has(key)) {
      await deleteDriveFile({ accessToken: options.accessToken, fileId })
      delete options.fileIds[key]
    }
  }

  return count
}

export async function syncTenantDrive(admin: SupabaseClient, record: DriveSyncRecord): Promise<SyncResult> {
  const tenantName = await getTenantName(admin, record.tenant_id)
  const { accessToken, refreshed } = await getValidAccessToken(record)

  if (refreshed) {
    await updateSyncRecord(admin, record.tenant_id, refreshed)
  }

  const fileIds = { ...(record.file_ids ?? {}) }
  const folderName = record.drive_folder_name || `MASH ISP — ${tenantName}`
  const folderId =
    record.drive_folder_id ??
    (await ensureDriveFolder({
      accessToken,
      name: folderName,
    }))

  let filesUploaded = 0
  filesUploaded += await syncDistributors({
    admin,
    accessToken,
    tenantId: record.tenant_id,
    folderId,
    fileIds,
  })
  filesUploaded += await syncRouters({
    admin,
    accessToken,
    tenantId: record.tenant_id,
    rootFolderId: folderId,
    fileIds,
  })
  filesUploaded += await syncMonthlyRenewals({
    admin,
    accessToken,
    tenantId: record.tenant_id,
    tenantName,
    folderId,
    fileIds,
  })

  await updateSyncRecord(admin, record.tenant_id, {
    drive_folder_id: folderId,
    drive_folder_name: folderName,
    file_ids: fileIds,
    last_sync_at: new Date().toISOString(),
    last_success_at: new Date().toISOString(),
    last_error_at: null,
    last_error_message: null,
  })

  return { tenantId: record.tenant_id, filesUploaded }
}

export async function syncConnectedTenants(admin: SupabaseClient): Promise<SyncResult[]> {
  const { data, error } = await admin
    .from('tenant_drive_sync')
    .select(
      'tenant_id,drive_folder_id,drive_folder_name,access_token_encrypted,refresh_token_encrypted,token_expires_at,file_ids',
    )
    .eq('is_connected', true)

  if (error) throw new Error(error.message)

  const results: SyncResult[] = []
  for (const record of (data ?? []) as DriveSyncRecord[]) {
    try {
      results.push(await syncTenantDrive(admin, record))
    } catch (error) {
      await updateSyncRecord(admin, record.tenant_id, {
        last_sync_at: new Date().toISOString(),
        last_error_at: new Date().toISOString(),
        last_error_message: error instanceof Error ? error.message : 'Unknown sync error',
      })
    }
  }

  return results
}
