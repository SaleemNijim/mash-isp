import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/pending-tasks/overdue
 *
 * المهام المتأخرة (pending/reminded + due_at < now()) — للوحة التنبيهات P7A.
 * §5.3: Cron 005 يحوّلها لاحقاً إلى converted_to_debt + دين (uq_task_debt).
 */
export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('pending_tasks')
    .select('id, customer_id, amount, due_at, status, related_payment_id, created_at')
    .eq('is_deleted', false)
    .in('status', ['pending', 'reminded'])
    .lt('due_at', new Date().toISOString())
    .order('due_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ tasks: data ?? [], count: data?.length ?? 0 })
}
