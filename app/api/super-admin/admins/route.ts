import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSuperAdminApi } from '@/lib/auth/require-super-admin-api'

export async function GET() {
  const auth = await requireSuperAdminApi()
  if ('error' in auth) return auth.error

  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from('users')
    .select('id,name,role,is_active,created_at')
    .eq('role', 'super_admin')
    .order('created_at')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: authList, error: listError } = await admin.auth.admin.listUsers({
    perPage: 200,
  })
  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 })
  }

  const emailById = new Map(
    (authList.users ?? []).map((u) => [u.id, u.email ?? '']),
  )

  const admins = (rows ?? []).map((row) => ({
    ...row,
    email: emailById.get(row.id) ?? '',
  }))

  return NextResponse.json({ admins })
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdminApi()
  if ('error' in auth) return auth.error

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
    user_metadata: { name, role: 'super_admin' },
  })

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 })
  }

  if (!authData.user) {
    return NextResponse.json({ error: 'فشل إنشاء حساب المصادقة' }, { status: 500 })
  }

  const { error: insertError } = await admin.from('users').insert({
    id: authData.user.id,
    tenant_id: null,
    role: 'super_admin',
    name,
    is_active: true,
  })

  if (insertError) {
    await admin.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json(
      { error: 'فشل إنشاء ملف Super Admin: ' + insertError.message },
      { status: 500 },
    )
  }

  return NextResponse.json({ id: authData.user.id, name, email })
}
