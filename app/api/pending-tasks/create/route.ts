import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/pending-tasks/create
 * Body: { customer_id, amount, due_at, related_payment_id? }
 *
 * تُستدعى من RenewalModal عند اختيار «إشعار لاحقاً».
 * لا تُنشئ ديوناً — §5.3: الديون من Cron 005 فقط.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { customer_id, amount, due_at, related_payment_id } = body

  if (!customer_id || typeof customer_id !== 'string') {
    return NextResponse.json({ error: '`customer_id` مطلوب' }, { status: 400 })
  }

  if (amount == null || Number.isNaN(Number(amount))) {
    return NextResponse.json({ error: '`amount` مطلوب' }, { status: 400 })
  }

  if (!due_at || typeof due_at !== 'string') {
    return NextResponse.json({ error: '`due_at` مطلوب' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!profile?.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const insertRow: Record<string, unknown> = {
    tenant_id: profile.tenant_id,
    customer_id,
    amount: Number(amount),
    due_at,
    status: 'pending',
  }

  if (related_payment_id && typeof related_payment_id === 'string') {
    insertRow.related_payment_id = related_payment_id
  }

  const { data, error } = await supabase
    .from('pending_tasks')
    .insert(insertRow)
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: data.id })
}
