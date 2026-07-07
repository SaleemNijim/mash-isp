import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchExpensesInRange, summarizeExpenses } from '@/lib/expenses/fetch-expenses'
import { fetchSalesInRange, summarizeSales } from '@/lib/sales/fetch-sales'

export interface FinancePeriodSummary {
  revenueTotal: number
  revenueCount: number
  expenseTotal: number
  expenseCount: number
  netFlow: number
  cashExpenseTotal: number
  bankExpenseTotal: number
}

export async function fetchFinancePeriodSummary(
  supabase: SupabaseClient,
  tenantId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<FinancePeriodSummary> {
  const [sales, expenses] = await Promise.all([
    fetchSalesInRange(supabase, tenantId, rangeStart, rangeEnd),
    fetchExpensesInRange(supabase, tenantId, rangeStart, rangeEnd),
  ])

  const revenue = summarizeSales(sales)
  const expense = summarizeExpenses(expenses)

  return {
    revenueTotal: revenue.total,
    revenueCount: revenue.count,
    expenseTotal: expense.total,
    expenseCount: expense.count,
    netFlow: revenue.total - expense.total,
    cashExpenseTotal: expense.cashTotal,
    bankExpenseTotal: expense.bankTotal,
  }
}
