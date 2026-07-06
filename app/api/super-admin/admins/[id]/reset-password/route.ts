import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSuperAdminApi } from '@/lib/auth/require-super-admin-api'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireSuperAdminApi()
  if ('error' in auth) return auth.error

  const { id } = await context.params

  let body: { password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON غير صالح' }, { status: 400 })
  }

  const password = body.password
  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  const { data: target, error: fetchError } = await admin
    .from('users')
    .select('id,role')
    .eq('id', id)
    .maybeSingle()

  if (fetchError || !target) {
    return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
  }
  if (target.role !== 'super_admin') {
    return NextResponse.json({ error: 'ليس حساب Super Admin' }, { status: 400 })
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(id, {
    password,
  })

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
