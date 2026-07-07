import type { SupabaseClient } from '@supabase/supabase-js'
import type { MonthlyExpenseExportRow } from '@/lib/excel/monthly-expenses-export'
import { LEDGER_METHOD_LABELS } from '@/lib/payments/ledger-labels'

function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

function normalizeJoin<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function bankAccountLabel(row: {
  bank_name?: string | null
  account_name?: string | null
  account_number?: string | null
} | null): string | null {
  if (!row) return null
  const parts = [row.bank_name, row.account_name, row.account_number ? `(${row.account_number})` : null]
    .filter(Boolean)
    .join(' — ')
  return parts || null
}

export async function fetchExpensesGroupedByMonth(
  admin: SupabaseClient,
  tenantId: string,
): Promise<Map<string, MonthlyExpenseExportRow[]>> {
  const { data, error } = await admin
    .from('expenses')
    .select(
      'paid_at, amount, method, source_account_label, description, beneficiary, notes, expense_categories(name), company_bank_accounts(bank_name, account_name, account_number)',
    )
    .eq('tenant_id', tenantId)
    .eq('is_deleted', false)
    .order('paid_at', { ascending: true })

  if (error) throw new Error(error.message)

  const grouped = new Map<string, MonthlyExpenseExportRow[]>()

  for (const row of data ?? []) {
    const paidAt = row.paid_at as string
    if (!paidAt) continue

    const category = normalizeJoin<{ name?: string | null }>(row.expense_categories)
    const bank = normalizeJoin<{
      bank_name?: string | null
      account_name?: string | null
      account_number?: string | null
    }>(row.company_bank_accounts)
    const method = (row.method as string) ?? 'cash'

    const key = monthKey(paidAt)
    const rows = grouped.get(key) ?? []
    rows.push({
      paid_at: paidAt,
      category_name: category?.name?.trim() || '—',
      amount: Number(row.amount ?? 0),
      method_label: LEDGER_METHOD_LABELS[method] ?? method,
      bank_account_label: method === 'cash' ? null : bankAccountLabel(bank),
      source_account_label: (row.source_account_label as string | null) ?? null,
      description: (row.description as string | null) ?? null,
      beneficiary: (row.beneficiary as string | null) ?? null,
      notes: (row.notes as string | null) ?? null,
    })
    grouped.set(key, rows)
  }

  return grouped
}
