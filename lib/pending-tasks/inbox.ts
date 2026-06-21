import type { SupabaseClient } from '@supabase/supabase-js'
import {
  resolveTaskDisplay,
  taskRequiresPaymentProof,
  type PendingTaskScope,
} from '@/lib/pending-tasks/task-display'

export type { PendingTaskScope }
export { TASK_SCOPE_LABELS } from '@/lib/pending-tasks/task-display'

export type PendingInboxKind = 'task' | 'debt' | 'transfer'

export interface PendingInboxItem {
  id: string
  kind: PendingInboxKind
  customer_id: string | null
  customer_name: string
  phone: string
  amount: number
  due_at: string | null
  recorded_at: string
  status: string
  status_label: string
  /** pending_task */
  task_id?: string
  task_scope?: PendingTaskScope
  task_title?: string | null
  task_notes?: string | null
  requires_payment_proof?: boolean
  related_payment_id?: string | null
  has_proof?: boolean
  /** debt */
  debt_id?: string
  subscription_period_id?: string | null
  reason?: string | null
  /** transfer */
  payment_id?: string
  method?: string
  bank_account_id?: string | null
  source_account_label?: string | null
}

const TASK_STATUS_LABELS: Record<string, string> = {
  pending: 'معلّقة',
  reminded: 'تم التذكير',
}

const DEBT_STATUS_LABELS: Record<string, string> = {
  active: 'دين نشط',
  temporary: 'دين مؤقت',
}

const METHOD_LABELS: Record<string, string> = {
  bank: 'تحويل بنكي',
  reflect: 'Reflect',
  jawwal_pay: 'Jawwal Pay',
}

function customerFromRow(
  raw: { name: string; phone: string | null } | { name: string; phone: string | null }[] | null,
): { name: string; phone: string } {
  const c = Array.isArray(raw) ? raw[0] : raw
  return { name: c?.name ?? '—', phone: c?.phone ?? '' }
}

export async function fetchPendingInbox(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<PendingInboxItem[]> {
  const [tasksRes, debtsRes, paymentsRes] = await Promise.all([
    supabase
      .from('pending_tasks')
      .select(
        'id, customer_id, title, notes, contact_label, contact_phone, amount, due_at, status, related_payment_id, created_at, customers(name, phone)',
      )
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .in('status', ['pending', 'reminded'])
      .order('due_at', { ascending: true, nullsFirst: false }),

    supabase
      .from('debts')
      .select(
        'id, customer_id, original_amount, remaining_amount, status, reason, related_task_id, subscription_period_id, created_at, customers(name, phone)',
      )
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .in('status', ['active', 'temporary'])
      .gt('remaining_amount', 0)
      .order('created_at', { ascending: false }),

    supabase
      .from('payments')
      .select(
        'id, customer_id, amount, method, bank_account_id, source_account_label, paid_at, created_at, customers(name, phone)',
      )
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .not('method', 'in', '("cash","debt")')
      .order('created_at', { ascending: false }),
  ])

  if (tasksRes.error) throw tasksRes.error
  if (debtsRes.error) throw debtsRes.error
  if (paymentsRes.error) throw paymentsRes.error

  const tasks = tasksRes.data ?? []
  const debts = debtsRes.data ?? []
  const payments = paymentsRes.data ?? []

  const paymentIdsForProof = [
    ...tasks.map((t) => t.related_payment_id).filter(Boolean),
    ...payments.map((p) => p.id),
  ] as string[]

  let proofSet = new Set<string>()
  if (paymentIdsForProof.length > 0) {
    const { data: proofs, error: proofErr } = await supabase
      .from('payment_proofs')
      .select('payment_id')
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .in('payment_id', paymentIdsForProof)

    if (proofErr) throw proofErr
    proofSet = new Set((proofs ?? []).map((p) => p.payment_id as string))
  }

  const pendingTaskIds = new Set(tasks.map((t) => t.id))
  const taskPaymentIds = new Set(
    tasks.map((t) => t.related_payment_id).filter(Boolean) as string[],
  )

  const items: PendingInboxItem[] = []

  for (const t of tasks) {
    const { name, phone } = customerFromRow(
      t.customers as { name: string; phone: string | null } | { name: string; phone: string | null }[] | null,
    )
    const display = resolveTaskDisplay({
      customer_id: t.customer_id,
      title: t.title,
      notes: t.notes,
      contact_label: t.contact_label,
      contact_phone: t.contact_phone,
      amount: t.amount != null ? Number(t.amount) : null,
      customer_name: name !== '—' ? name : undefined,
      customer_phone: phone || undefined,
    })
    items.push({
      id: `task-${t.id}`,
      kind: 'task',
      task_id: t.id,
      customer_id: t.customer_id,
      customer_name: display.primary,
      phone: display.secondary ?? phone,
      amount: Number(t.amount ?? 0),
      due_at: t.due_at,
      recorded_at: t.due_at ?? t.created_at,
      status: t.status,
      status_label: TASK_STATUS_LABELS[t.status] ?? t.status,
      task_scope: display.scope,
      task_title: t.title,
      task_notes: t.notes,
      requires_payment_proof: taskRequiresPaymentProof({
        customer_id: t.customer_id,
        title: t.title,
        notes: t.notes,
        contact_label: t.contact_label,
        contact_phone: t.contact_phone,
        amount: t.amount != null ? Number(t.amount) : null,
      }),
      related_payment_id: t.related_payment_id,
      has_proof: t.related_payment_id ? proofSet.has(t.related_payment_id) : false,
    })
  }

  for (const d of debts) {
    if (d.related_task_id && pendingTaskIds.has(d.related_task_id)) continue

    const { name, phone } = customerFromRow(
      d.customers as { name: string; phone: string | null } | { name: string; phone: string | null }[] | null,
    )
    const remaining = Number(d.remaining_amount ?? d.original_amount ?? 0)
    items.push({
      id: `debt-${d.id}`,
      kind: 'debt',
      debt_id: d.id,
      customer_id: d.customer_id,
      customer_name: name,
      phone,
      amount: remaining,
      due_at: null,
      recorded_at: d.created_at,
      status: d.status,
      status_label: DEBT_STATUS_LABELS[d.status] ?? d.status,
      subscription_period_id: d.subscription_period_id,
      reason: d.reason,
    })
  }

  for (const p of payments) {
    if (taskPaymentIds.has(p.id)) continue
    if (proofSet.has(p.id)) continue

    const { name, phone } = customerFromRow(
      p.customers as { name: string; phone: string | null } | { name: string; phone: string | null }[] | null,
    )
    items.push({
      id: `transfer-${p.id}`,
      kind: 'transfer',
      payment_id: p.id,
      customer_id: p.customer_id,
      customer_name: name,
      phone,
      amount: Number(p.amount),
      due_at: null,
      recorded_at: p.paid_at ?? p.created_at,
      status: 'awaiting_proof',
      status_label: 'بانتظار إثبات',
      method: p.method,
      bank_account_id: p.bank_account_id,
      source_account_label: p.source_account_label,
      has_proof: false,
    })
  }

  items.sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  )

  return items
}

export function inboxKindLabel(kind: PendingInboxKind): string {
  switch (kind) {
    case 'task':
      return 'مهمة معلقة'
    case 'debt':
      return 'دين'
    case 'transfer':
      return 'تحويل'
  }
}

export function inboxMethodLabel(method: string | undefined): string {
  if (!method) return '—'
  return METHOD_LABELS[method] ?? method
}
