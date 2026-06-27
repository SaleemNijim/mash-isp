import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchSalesInRange, type SaleKind } from '@/lib/sales/fetch-sales'

export type ActivitySource = 'sale' | 'audit'

export interface ActivityLogEntry {
  id: string
  source: ActivitySource
  action: string
  detail: string
  amount: number | null
  performedAt: string
  performerId: string | null
  performerName: string
  tableName?: string
}

const SALE_ACTION_LABELS: Record<SaleKind, string> = {
  retail: 'بيع بطاقة',
  distributor: 'بيع لموزع',
  renewal: 'تجديد اشتراك',
  new: 'اشتراك جديد',
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  SOFT_DELETED: 'إخفاء سجل',
  HARD_DELETED: 'حذف نهائي',
  BATCH_DELETED_STOCK_REVERSED: 'حذف دفعة وعكس المخزون',
}

const TABLE_LABELS: Record<string, string> = {
  customers: 'مشترك',
  subscriptions: 'اشتراك',
  card_products: 'منتج بطاقة',
  card_batches: 'دفعة بطاقات',
  internet_credentials: 'PPP',
  network_routers: 'راوتر',
  network_ports: 'منفذ',
  warehouse_items: 'مستودع',
  payments: 'دفعة',
  debts: 'دين',
}

async function loadUserNames(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return new Map()

  const { data, error } = await supabase.from('users').select('id, name').in('id', unique)
  if (error) throw error

  return new Map((data ?? []).map((u) => [u.id as string, u.name as string]))
}

export async function fetchSalesActivityLog(
  supabase: SupabaseClient,
  tenantId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<ActivityLogEntry[]> {
  const sales = await fetchSalesInRange(supabase, tenantId, rangeStart, rangeEnd)
  const performerIds = sales.map((s) => s.performerId).filter(Boolean) as string[]
  const names = await loadUserNames(supabase, performerIds)

  return sales.map((sale) => ({
    id: `sale-${sale.kind}-${sale.id}`,
    source: 'sale' as const,
    action: SALE_ACTION_LABELS[sale.kind],
    detail: sale.label,
    amount: sale.amount,
    performedAt: sale.created_at,
    performerId: sale.performerId ?? null,
    performerName: sale.performerId ? (names.get(sale.performerId) ?? 'مستخدم') : 'غير مسجّل',
  }))
}

export async function fetchAuditLogEntries(
  supabase: SupabaseClient,
  tenantId: string,
  rangeStart: string,
  rangeEnd: string,
  limit = 200,
): Promise<ActivityLogEntry[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, table_name, record_id, action, performed_at, performed_by')
    .eq('tenant_id', tenantId)
    .eq('is_deleted', false)
    .gte('performed_at', rangeStart)
    .lte('performed_at', rangeEnd)
    .order('performed_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  const performerIds = (data ?? []).map((r) => r.performed_by).filter(Boolean) as string[]
  const names = await loadUserNames(supabase, performerIds)

  return (data ?? []).map((row) => {
    const tableLabel = TABLE_LABELS[row.table_name] ?? row.table_name
    const actionLabel = AUDIT_ACTION_LABELS[row.action] ?? row.action
    return {
      id: `audit-${row.id}`,
      source: 'audit' as const,
      action: actionLabel,
      detail: `${tableLabel}${row.record_id ? ` — ${String(row.record_id).slice(0, 8)}…` : ''}`,
      amount: null,
      performedAt: row.performed_at as string,
      performerId: row.performed_by as string | null,
      performerName: row.performed_by
        ? (names.get(row.performed_by as string) ?? 'مستخدم')
        : 'النظام',
      tableName: row.table_name,
    }
  })
}

export function fetchPerformerBreakdown(
  entries: ActivityLogEntry[],
): { performerName: string; count: number; total: number }[] {
  const map = new Map<string, { count: number; total: number }>()

  for (const entry of entries) {
    if (entry.source !== 'sale') continue
    const key = entry.performerName
    const prev = map.get(key) ?? { count: 0, total: 0 }
    prev.count += 1
    prev.total += entry.amount ?? 0
    map.set(key, prev)
  }

  return [...map.entries()]
    .map(([performerName, stats]) => ({ performerName, ...stats }))
    .sort((a, b) => b.total - a.total)
}
