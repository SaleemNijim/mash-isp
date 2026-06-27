import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyUserProfile } from '@/lib/auth/complete-user-setup'

/**
 * POST /api/employees/update
 * Body: { userId, email?, password? }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  }

  const profile = await getMyUserProfile(supabase)
  if (!profile?.tenant_id || profile.role !== 'admin') {
    return NextResponse.json({ error: 'فقط مدير الشركة' }, { status: 403 })
  }

  let body: { userId?: string; email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON غير صالح' }, { status: 400 })
  }

  const userId = body.userId?.trim()
  const email = body.email?.trim()
  const password = body.password

  if (!userId) {
    return NextResponse.json({ error: 'معرّف الموظف مطلوب' }, { status: 400 })
  }
  if (!email) {
    return NextResponse.json({ error: 'البريد مطلوب' }, { status: 400 })
  }
  if (password !== undefined && password.length > 0 && password.length < 8) {
    return NextResponse.json(
      { error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()
  const { data: employeeRow, error: employeeError } = await admin
    .from('users')
    .select('id, tenant_id, role')
    .eq('id', userId)
    .single()

  if (
    employeeError ||
    !employeeRow ||
    employeeRow.tenant_id !== profile.tenant_id ||
    employeeRow.role !== 'employee'
  ) {
    return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 })
  }

  const updatePayload: { email?: string; password?: string } = { email }
  if (password && password.length >= 8) {
    updatePayload.password = password
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(userId, updatePayload)
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
