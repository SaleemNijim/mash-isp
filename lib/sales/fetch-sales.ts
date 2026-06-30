import type { SupabaseClient } from '@supabase/supabase-js'

export type SaleKind = 'retail' | 'distributor' | 'renewal' | 'new'

export interface SaleRow {
  id: string
  kind: SaleKind
  label: string
  amount: number
  discountPercent?: number | null
  created_at: string
  performerId?: string | null
  paymentMethod?: string | null
  debtorName?: string | null
  /** معرّف الزبون — للاشتراكات، يُستخدم للانتقال لصفحة تعديل الاشتراك */
  customerId?: string | null
  /** بيانات التعديل — بيع تجزئة فقط */
  retailEdit?: {
    quantity: number
    unitPrice: number
    method: string
    notes: string | null
    customerId: string | null
    contactLabel: string | null
    contactPhone: string | null
    dueAt: string | null
  }
}

export interface SalesBucket {
  total: number
  count: number
}

export interface SalesSummary {
  total: number
  count: number
  retail: SalesBucket
  distributor: SalesBucket
  subscriptions: SalesBucket
  renewals: SalesBucket
  newSubscriptions: SalesBucket
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'نقدي',
  debt: 'دين',
  reflect: 'ريفلكت',
  jawwal_pay: 'جوال باي',
  bank: 'تحويل',
}

export function paymentMethodLabel(method: string | null | undefined): string | null {
  if (!method) return null
  return PAYMENT_METHOD_LABELS[method] ?? method
}

function emptyBucket(): SalesBucket {
  return { total: 0, count: 0 }
}

export function summarizeSales(rows: SaleRow[]): SalesSummary {
  const summary: SalesSummary = {
    total: 0,
    count: rows.length,
    retail: emptyBucket(),
    distributor: emptyBucket(),
    subscriptions: emptyBucket(),
    renewals: emptyBucket(),
    newSubscriptions: emptyBucket(),
  }

  for (const row of rows) {
    summary.total += row.amount
    let bucket: SalesBucket
    if (row.kind === 'retail') bucket = summary.retail
    else if (row.kind === 'distributor') bucket = summary.distributor
    else if (row.kind === 'new') {
      bucket = summary.newSubscriptions
      summary.subscriptions.total += row.amount
      summary.subscriptions.count += 1
    } else {
      bucket = summary.renewals
      summary.subscriptions.total += row.amount
      summary.subscriptions.count += 1
    }
    bucket.total += row.amount
    bucket.count += 1
  }

  return summary
}

export async function fetchSalesInRange(
  supabase: SupabaseClient,
  tenantId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<SaleRow[]> {
  const [retailRes, distRes, periodRes, newSubRes] = await Promise.all([
    supabase
      .from('card_retail_sales')
      .select(
        `id, total_amount, sale_type, discount_percent, created_at, sold_by, method, notes,
        quantity, unit_price, customer_id, contact_label, contact_phone,
        card_products(name),
        customers(name),
        pending_tasks(due_at)`,
      )
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .gte('created_at', rangeStart)
      .lte('created_at', rangeEnd)
      .order('created_at', { ascending: false }),
    supabase
      .from('card_distributor_sales')
      .select('id, total_amount, distributor_name, created_at, sold_by')
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .gte('created_at', rangeStart)
      .lte('created_at', rangeEnd)
      .order('created_at', { ascending: false }),
    supabase
      .from('subscription_periods')
      .select(
        'id, subscription_id, customer_id, amount_due, cash_amount, app_amount, discount_amount, created_at, recorded_by, customers(name)',
      )
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .gte('created_at', rangeStart)
      .lte('created_at', rangeEnd)
      .order('created_at', { ascending: false }),
    supabase
      .from('subscriptions')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .gte('created_at', rangeStart)
      .lte('created_at', rangeEnd),
  ])

  if (retailRes.error) throw retailRes.error
  if (distRes.error) throw distRes.error
  if (periodRes.error) throw periodRes.error
  if (newSubRes.error) throw newSubRes.error

  const newSubIds = new Set((newSubRes.data ?? []).map((s) => s.id as string))
  const rows: SaleRow[] = []

  for (const r of retailRes.data ?? []) {
    const productRaw = r.card_products as { name?: string } | { name?: string }[] | null
    const product = Array.isArray(productRaw) ? productRaw[0] : productRaw
    const customerRaw = r.customers as { name?: string } | { name?: string }[] | null
    const customer = Array.isArray(customerRaw) ? customerRaw[0] : customerRaw
    const taskRaw = r.pending_tasks as { due_at?: string } | { due_at?: string }[] | null
    const task = Array.isArray(taskRaw) ? taskRaw[0] : taskRaw
    const method = (r.method as string) ?? 'cash'
    const debtorName =
      customer?.name?.trim() ||
      (r.contact_label as string | null)?.trim() ||
      (method === 'debt' ? 'دين — غير محدد' : null)

    rows.push({
      id: r.id,
      kind: 'retail',
      label: product?.name ? `بطاقة — ${product.name}` : 'بيع بطاقة',
      amount: Number(r.total_amount),
      discountPercent: r.discount_percent != null ? Number(r.discount_percent) : null,
      created_at: r.created_at,
      performerId: r.sold_by as string | null,
      paymentMethod: method,
      debtorName: method === 'debt' ? debtorName : null,
      retailEdit: {
        quantity: Number(r.quantity),
        unitPrice: Number(r.unit_price),
        method,
        notes: (r.notes as string | null) ?? null,
        customerId: (r.customer_id as string | null) ?? null,
        contactLabel: (r.contact_label as string | null) ?? null,
        contactPhone: (r.contact_phone as string | null) ?? null,
        dueAt: task?.due_at ?? null,
      },
    })
  }

  for (const d of distRes.data ?? []) {
    rows.push({
      id: d.id,
      kind: 'distributor',
      label: `موزع: ${d.distributor_name}`,
      amount: Number(d.total_amount ?? 0),
      created_at: d.created_at,
      performerId: (d as { sold_by?: string | null }).sold_by ?? null,
    })
  }

  for (const period of periodRes.data ?? []) {
    const customerRaw = period.customers as { name?: string } | { name?: string }[] | null
    const customer = Array.isArray(customerRaw) ? customerRaw[0] : customerRaw
    const collected = Number(period.cash_amount ?? 0) + Number(period.app_amount ?? 0)
    const isNew = newSubIds.has(period.subscription_id as string)
    rows.push({
      id: period.id,
      kind: isNew ? 'new' : 'renewal',
      label: `${isNew ? 'اشتراك جديد' : 'تجديد'} PPP — ${customer?.name ?? ''}`,
      amount: collected,
      created_at: period.created_at,
      performerId: (period as { recorded_by?: string | null }).recorded_by ?? null,
      customerId: (period.customer_id as string | null) ?? null,
    })
  }

  rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return rows
}
