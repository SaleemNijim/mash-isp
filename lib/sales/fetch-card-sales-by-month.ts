import type { SupabaseClient } from '@supabase/supabase-js'
import type { MonthlySalesExportRow } from '@/lib/excel/monthly-sales-export'
import { paymentMethodLabel } from '@/lib/sales/fetch-sales'

function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

function normalizeJoin<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export async function fetchCardSalesGroupedByMonth(
  admin: SupabaseClient,
  tenantId: string,
): Promise<Map<string, MonthlySalesExportRow[]>> {
  const [retailRes, distRes] = await Promise.all([
    admin
      .from('card_retail_sales')
      .select(
        `created_at, total_amount, method, notes, quantity, unit_price, discount_percent,
        card_products(name), customers(name), contact_label`,
      )
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true }),
    admin
      .from('card_distributor_sales')
      .select('created_at, total_amount, distributor_name, payment_method')
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true }),
  ])

  if (retailRes.error) throw new Error(retailRes.error.message)
  if (distRes.error) throw new Error(distRes.error.message)

  const grouped = new Map<string, MonthlySalesExportRow[]>()

  for (const row of retailRes.data ?? []) {
    const createdAt = row.created_at as string
    if (!createdAt) continue

    const product = normalizeJoin<{ name?: string | null }>(row.card_products)
    const customer = normalizeJoin<{ name?: string | null }>(row.customers)
    const method = (row.method as string) ?? 'cash'
    const debtorName =
      customer?.name?.trim() ||
      (row.contact_label as string | null)?.trim() ||
      (method === 'debt' ? 'دين — غير محدد' : null)

    const key = monthKey(createdAt)
    const rows = grouped.get(key) ?? []
    rows.push({
      created_at: createdAt,
      kind: 'retail',
      description: product?.name ? `بطاقة — ${product.name}` : 'بيع بطاقة',
      quantity: row.quantity != null ? Number(row.quantity) : null,
      unit_price: row.unit_price != null ? Number(row.unit_price) : null,
      discount_percent: row.discount_percent != null ? Number(row.discount_percent) : null,
      total_amount: Number(row.total_amount ?? 0),
      payment_method: paymentMethodLabel(method),
      debtor_name: method === 'debt' ? debtorName : null,
      notes: (row.notes as string | null) ?? null,
    })
    grouped.set(key, rows)
  }

  for (const row of distRes.data ?? []) {
    const createdAt = row.created_at as string
    if (!createdAt) continue

    const key = monthKey(createdAt)
    const rows = grouped.get(key) ?? []
    rows.push({
      created_at: createdAt,
      kind: 'distributor',
      description: `موزع: ${row.distributor_name ?? '—'}`,
      quantity: null,
      unit_price: null,
      discount_percent: null,
      total_amount: Number(row.total_amount ?? 0),
      payment_method: paymentMethodLabel((row.payment_method as string | null) ?? null),
      debtor_name: null,
      notes: null,
    })
    grouped.set(key, rows)
  }

  for (const [, rows] of grouped) {
    rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }

  return grouped
}
