import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMyUserProfile } from '@/lib/auth/complete-user-setup'

/**
 * POST /api/pending-tasks/create
 * Body: { customer_id?, title?, contact_label?, contact_phone?, amount?, due_at, notes?, related_payment_id? }
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

  const {
    customer_id,
    title,
    contact_label,
    contact_phone,
    amount,
    due_at,
    notes,
    related_payment_id,
  } = body

  const hasCustomer = typeof customer_id === 'string' && customer_id.length > 0
  const hasTitle = typeof title === 'string' && title.trim().length > 0
  const hasContact =
    typeof contact_label === 'string' && contact_label.trim().length > 0

  if (!hasCustomer && !hasTitle && !hasContact) {
    return NextResponse.json(
      { error: 'يجب تحديد مشترك أو عنوان أو اسم جهة' },
      { status: 400 },
    )
  }

  if (!due_at || typeof due_at !== 'string') {
    return NextResponse.json({ error: '`due_at` مطلوب' }, { status: 400 })
  }

  if (amount != null && Number.isNaN(Number(amount))) {
    return NextResponse.json({ error: '`amount` غير صالح' }, { status: 400 })
  }

  const profile = await getMyUserProfile(supabase)

  if (!profile?.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const insertRow: Record<string, unknown> = {
    tenant_id: profile.tenant_id,
    due_at,
    status: 'pending',
    customer_id: hasCustomer ? customer_id : null,
    title: hasTitle ? String(title).trim() : null,
    contact_label: hasContact ? String(contact_label).trim() : null,
    contact_phone:
      typeof contact_phone === 'string' && contact_phone.trim()
        ? contact_phone.trim()
        : null,
    notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
    amount: amount != null && Number(amount) > 0 ? Number(amount) : null,
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
