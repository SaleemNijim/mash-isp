import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExpenseFilters, ExpenseRow, ExpenseSummary } from '@/lib/expenses/types'

const PAGE_SIZE = 100

const ELECTRONIC_METHODS = new Set(['reflect', 'jawwal_pay', 'bank'])

export function normalizeExpenseRow(row: Record<string, unknown>): ExpenseRow {
  const categories = row.expense_categories
  const normalized = Array.isArray(categories)
    ? (categories[0] as { name: string } | undefined) ?? null
    : (categories as { name: string } | null)
  const base = row as unknown as ExpenseRow
  return { ...base, expense_categories: normalized }
}

export async function fetchExpensesPage(
  supabase: SupabaseClient,
  tenantId: string,
  page: number,
  filters: ExpenseFilters,
): Promise<{ rows: ExpenseRow[]; count: number | null }> {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let q = supabase
    .from('expenses')
    .select(
      'id, tenant_id, category_id, amount, method, bank_account_id, source_account_label, description, beneficiary, notes, paid_at, recorded_by, created_at, expense_categories(name)',
      { count: 'exact' },
    )
    .eq('tenant_id', tenantId)
    .eq('is_deleted', false)
    .order('paid_at', { ascending: false })
    .range(from, to)

  if (filters.categoryId) q = q.eq('category_id', filters.categoryId)
  if (filters.method) q = q.eq('method', filters.method)
  if (filters.paidFrom) q = q.gte('paid_at', filters.paidFrom)
  if (filters.paidTo) q = q.lte('paid_at', filters.paidTo)

  const search = filters.search?.trim()
  if (search) {
    q = q.or(
      [
        `description.ilike.%${search}%`,
        `beneficiary.ilike.%${search}%`,
        `notes.ilike.%${search}%`,
      ].join(','),
    )
  }

  const { data, error, count } = await q
  if (error) throw error

  return {
    rows: (data ?? []).map((row) => normalizeExpenseRow(row as Record<string, unknown>)),
    count,
  }
}

export async function fetchExpensesInRange(
  supabase: SupabaseClient,
  tenantId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<ExpenseRow[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select(
      'id, tenant_id, category_id, amount, method, bank_account_id, source_account_label, description, beneficiary, notes, paid_at, recorded_by, created_at, expense_categories(name)',
    )
    .eq('tenant_id', tenantId)
    .eq('is_deleted', false)
    .gte('paid_at', rangeStart)
    .lte('paid_at', rangeEnd)
    .order('paid_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => normalizeExpenseRow(row as Record<string, unknown>))
}

export function summarizeExpenses(rows: ExpenseRow[]): ExpenseSummary {
  const summary: ExpenseSummary = {
    total: 0,
    count: rows.length,
    cashTotal: 0,
    bankTotal: 0,
  }

  for (const row of rows) {
    const amount = Number(row.amount) || 0
    summary.total += amount
    if (row.method === 'cash') summary.cashTotal += amount
    if (ELECTRONIC_METHODS.has(row.method)) summary.bankTotal += amount
  }

  return summary
}
