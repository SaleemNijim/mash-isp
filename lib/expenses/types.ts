export type ExpenseMethod = 'cash' | 'reflect' | 'jawwal_pay' | 'bank'

export interface ExpenseCategory {
  id: string
  tenant_id: string
  name: string
  sort_order: number
  is_system: boolean
  is_deleted: boolean
}

export interface ExpenseRow {
  id: string
  tenant_id: string
  category_id: string
  amount: number
  method: ExpenseMethod
  bank_account_id: string | null
  source_account_label: string | null
  description: string | null
  beneficiary: string | null
  notes: string | null
  paid_at: string
  recorded_by: string | null
  created_at: string
  expense_categories: { name: string } | { name: string }[] | null
}

export interface ExpenseFilters {
  search?: string
  categoryId?: string | null
  method?: ExpenseMethod | null
  paidFrom?: string | null
  paidTo?: string | null
}

export interface ExpenseSummary {
  total: number
  count: number
  cashTotal: number
  bankTotal: number
}
