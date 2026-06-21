export interface SubscriptionPeriodRow {
  id: string
  tenant_id: string
  customer_id: string
  subscription_id: string
  credential_id: string | null
  username: string | null
  period_month: number | null
  period_start: string
  speed: string | null
  mac_address: string | null
  price: number | null
  billing_label: string
  amount_due: number | null
  cash_amount: number
  app_amount: number
  discount_amount: number
  balance_remaining: number
  paid_at: string | null
  payment_id: string | null
  pending_task_id: string | null
  notes: string | null
  created_at: string
}

export interface SubscriptionPeriodFormState {
  username: string
  period_month: string
  period_start: string
  speed: string
  mac_address: string
  price: string
  billing_label: string
  amount_due: string
  cash_amount: string
  app_amount: string
  discount_amount: string
  balance_remaining: string
  paid_at: string
  notes: string
}

export function emptyPeriodForm(): SubscriptionPeriodFormState {
  return {
    username: '',
    period_month: '',
    period_start: '',
    speed: '',
    mac_address: '',
    price: '',
    billing_label: 'شهري',
    amount_due: '',
    cash_amount: '0',
    app_amount: '0',
    discount_amount: '0',
    balance_remaining: '0',
    paid_at: '',
    notes: '',
  }
}

export function periodFormFromRow(row: SubscriptionPeriodRow): SubscriptionPeriodFormState {
  return {
    username: row.username ?? '',
    period_month: row.period_month != null ? String(row.period_month) : '',
    period_start: row.period_start?.slice(0, 10) ?? '',
    speed: row.speed ?? '',
    mac_address: row.mac_address ?? '',
    price: row.price != null ? String(row.price) : '',
    billing_label: row.billing_label ?? 'شهري',
    amount_due: row.amount_due != null ? String(row.amount_due) : '',
    cash_amount: String(row.cash_amount ?? 0),
    app_amount: String(row.app_amount ?? 0),
    discount_amount: String(row.discount_amount ?? 0),
    balance_remaining: String(row.balance_remaining ?? 0),
    paid_at: row.paid_at ? row.paid_at.slice(0, 16) : '',
    notes: row.notes ?? '',
  }
}

export function parsePeriodForm(form: SubscriptionPeriodFormState) {
  return {
    username: form.username.trim() || null,
    period_month: form.period_month.trim() ? Number(form.period_month) : null,
    period_start: form.period_start,
    speed: form.speed.trim() || null,
    mac_address: form.mac_address.trim() || null,
    price: form.price.trim() ? Number(form.price) : null,
    billing_label: form.billing_label.trim() || 'شهري',
    amount_due: form.amount_due.trim() ? Number(form.amount_due) : null,
    cash_amount: Number(form.cash_amount) || 0,
    app_amount: Number(form.app_amount) || 0,
    discount_amount: Number(form.discount_amount) || 0,
    balance_remaining: Number(form.balance_remaining) || 0,
    paid_at: form.paid_at.trim() ? new Date(form.paid_at).toISOString() : null,
    notes: form.notes.trim() || null,
  }
}
