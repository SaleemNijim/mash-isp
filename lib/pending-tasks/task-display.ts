export type PendingTaskScope = 'subscriber' | 'contact' | 'reminder'

export const TASK_SCOPE_LABELS: Record<PendingTaskScope, string> = {
  subscriber: 'مشترك',
  contact: 'جهة',
  reminder: 'تذكير',
}

export interface PendingTaskRowFields {
  customer_id: string | null
  title: string | null
  notes: string | null
  contact_label: string | null
  contact_phone: string | null
  amount: number | null
}

export function resolveTaskScope(row: PendingTaskRowFields): PendingTaskScope {
  if (row.customer_id) return 'subscriber'
  if (row.contact_label?.trim()) return 'contact'
  return 'reminder'
}

export function resolveTaskDisplay(
  row: PendingTaskRowFields & { customer_name?: string; customer_phone?: string },
): { primary: string; secondary: string | null; scope: PendingTaskScope } {
  const scope = resolveTaskScope(row)

  if (scope === 'subscriber') {
    return {
      scope,
      primary: row.customer_name?.trim() || '—',
      secondary: row.customer_phone?.trim() || null,
    }
  }

  if (scope === 'contact') {
    return {
      scope,
      primary: row.contact_label?.trim() || '—',
      secondary: row.contact_phone?.trim() || row.notes?.trim() || null,
    }
  }

  return {
    scope,
    primary: row.title?.trim() || '—',
    secondary: row.notes?.trim() || null,
  }
}

/** مهمة متابعة دفع لمشترك — تتطلب إثباتاً قبل التأكيد */
export function taskRequiresPaymentProof(row: PendingTaskRowFields): boolean {
  return !!row.customer_id && Number(row.amount ?? 0) > 0
}
