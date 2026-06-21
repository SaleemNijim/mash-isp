import type { SupabaseClient } from '@supabase/supabase-js'

export interface LedgerEntry {
  id: string
  recorded_at: string
  amount: number
  method: string
  counterparty: string
  source_account_label: string | null
  notes: string | null
  bank_account_id: string | null
  kind: 'payment' | 'distributor_receipt' | 'distributor_sale' | 'retail_sale'
}

export interface FinancialOverview {
  cashTotal: number
  debtTotal: number
  bankInflowTotal: number
  ledger: LedgerEntry[]
}

const METHODS_BANK = ['reflect', 'jawwal_pay', 'bank']

export async function fetchFinancialOverview(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<FinancialOverview> {
  const [
    paymentsRes,
    debtsRes,
    distributorsRes,
    receiptsRes,
    distSalesRes,
    retailSalesRes,
  ] = await Promise.all([
    supabase
      .from('payments')
      .select(
        'id, amount, method, bank_account_id, source_account_label, paid_at, created_at, notes, customer_id, customers(name)',
      )
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false),
    supabase
      .from('debts')
      .select('remaining_amount, original_amount')
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .in('status', ['active', 'temporary']),
    supabase
      .from('distributors')
      .select('balance_due')
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false),
    supabase
      .from('distributor_payment_receipts')
      .select(
        'id, amount, method, bank_account_id, source_account_label, created_at, notes, distributor_id, distributors(name)',
      )
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false),
    supabase
      .from('card_distributor_sales')
      .select(
        'id, total_amount, payment_method, bank_account_id, source_account_label, created_at, distributor_name',
      )
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false),
    supabase
      .from('card_retail_sales')
      .select('id, total_amount, method, bank_account_id, source_account_label, created_at, notes')
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false),
  ])

  if (paymentsRes.error) throw paymentsRes.error
  if (debtsRes.error) throw debtsRes.error
  if (distributorsRes.error) throw distributorsRes.error
  if (receiptsRes.error) throw receiptsRes.error
  if (distSalesRes.error) throw distSalesRes.error
  if (retailSalesRes.error) throw retailSalesRes.error

  let cashTotal = 0
  let bankInflowTotal = 0
  const ledger: LedgerEntry[] = []

  for (const row of paymentsRes.data ?? []) {
    const amount = Number(row.amount)
    const method = row.method as string
    const customers = row.customers as { name: string } | { name: string }[] | null
    const customerName = Array.isArray(customers)
      ? customers[0]?.name
      : customers?.name

    if (method === 'cash') cashTotal += amount
    if (METHODS_BANK.includes(method)) bankInflowTotal += amount

    ledger.push({
      id: row.id,
      recorded_at: row.paid_at ?? row.created_at,
      amount,
      method,
      counterparty: customerName ?? 'مشترك',
      source_account_label: row.source_account_label,
      notes: row.notes,
      bank_account_id: row.bank_account_id,
      kind: 'payment',
    })
  }

  for (const row of receiptsRes.data ?? []) {
    const amount = Number(row.amount)
    const method = row.method as string
    const distributors = row.distributors as { name: string } | { name: string }[] | null
    const distName = Array.isArray(distributors)
      ? distributors[0]?.name
      : distributors?.name

    if (method === 'cash') cashTotal += amount
    if (METHODS_BANK.includes(method)) bankInflowTotal += amount

    ledger.push({
      id: row.id,
      recorded_at: row.created_at,
      amount,
      method,
      counterparty: distName ?? 'موزع',
      source_account_label: row.source_account_label,
      notes: row.notes,
      bank_account_id: row.bank_account_id,
      kind: 'distributor_receipt',
    })
  }

  for (const row of distSalesRes.data ?? []) {
    const amount = Number(row.total_amount ?? 0)
    const method = (row.payment_method as string) ?? 'cash'

    if (method === 'cash') cashTotal += amount
    if (METHODS_BANK.includes(method)) bankInflowTotal += amount

    if (method !== 'debt') {
      ledger.push({
        id: row.id,
        recorded_at: row.created_at,
        amount,
        method,
        counterparty: row.distributor_name ?? 'موزع',
        source_account_label: row.source_account_label,
        notes: null,
        bank_account_id: row.bank_account_id,
        kind: 'distributor_sale',
      })
    }
  }

  for (const row of retailSalesRes.data ?? []) {
    const amount = Number(row.total_amount ?? 0)
    const method = (row.method as string) ?? 'cash'

    if (method === 'cash') cashTotal += amount
    if (METHODS_BANK.includes(method)) bankInflowTotal += amount

    if (method !== 'debt') {
      ledger.push({
        id: row.id,
        recorded_at: row.created_at,
        amount,
        method,
        counterparty: row.notes?.trim() || 'بيع تجزئة',
        source_account_label: row.source_account_label,
        notes: row.notes,
        bank_account_id: row.bank_account_id,
        kind: 'retail_sale',
      })
    }
  }

  const customerDebt = (debtsRes.data ?? []).reduce(
    (s, d) => s + Number(d.remaining_amount ?? d.original_amount ?? 0),
    0,
  )
  const distributorDebt = (distributorsRes.data ?? []).reduce(
    (s, d) => s + Number(d.balance_due ?? 0),
    0,
  )

  ledger.sort(
    (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime(),
  )

  return {
    cashTotal,
    debtTotal: customerDebt + distributorDebt,
    bankInflowTotal,
    ledger,
  }
}
