import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyUserProfile } from '@/lib/auth/complete-user-setup'
import { DEFAULT_CASHIER_PERMISSIONS } from '@/lib/permissions'

/**
 * POST /api/employees/create
 * Body: { name, email, password }
 *
 * ينشئ كاشير (employee) دون استبدال جلسة الـ admin —
 * signUp من المتصفح كان يبدّل auth.uid() ويفشل RLS على users.
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
    return NextResponse.json(
      { error: 'فقط مدير الشركة يمكنه إضافة موظفين' },
      { status: 403 },
    )
  }

  let body: { name?: string; email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON غير صالح' }, { status: 400 })
  }

  const name = body.name?.trim()
  const email = body.email?.trim()
  const password = body.password

  if (!name) {
    return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })
  }
  if (!email) {
    return NextResponse.json({ error: 'البريد مطلوب' }, { status: 400 })
  }
  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  const { data: authData, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role: 'employee' },
  })

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 })
  }

  if (!authData.user) {
    return NextResponse.json({ error: 'فشل إنشاء حساب المصادقة' }, { status: 500 })
  }

  const { error: insertError } = await admin.from('users').insert({
    id: authData.user.id,
    tenant_id: profile.tenant_id,
    role: 'employee',
    name,
    is_active: true,
  })

  if (insertError) {
    await admin.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json(
      { error: 'فشل ربط الموظف بالشركة: ' + insertError.message },
      { status: 500 },
    )
  }

  const { error: permError } = await admin.from('user_permissions').insert(
    DEFAULT_CASHIER_PERMISSIONS.map((permission) => ({
      user_id: authData.user.id,
      permission,
    })),
  )

  if (permError) {
    await admin.from('users').delete().eq('id', authData.user.id)
    await admin.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json(
      { error: 'فشل تعيين الصلاحيات الافتراضية: ' + permError.message },
      { status: 500 },
    )
  }

  return NextResponse.json({ id: authData.user.id, name })
}
