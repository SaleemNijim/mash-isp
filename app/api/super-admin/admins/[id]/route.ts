import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSuperAdminApi } from '@/lib/auth/require-super-admin-api'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireSuperAdminApi()
  if ('error' in auth) return auth.error

  const { id } = await context.params

  let body: { name?: string; is_active?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON غير صالح' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: target, error: fetchError } = await admin
    .from('users')
    .select('id,role,is_active')
    .eq('id', id)
    .maybeSingle()

  if (fetchError || !target) {
    return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
  }
  if (target.role !== 'super_admin') {
    return NextResponse.json({ error: 'ليس حساب Super Admin' }, { status: 400 })
  }

  if (body.is_active === false && id === auth.user.id) {
    return NextResponse.json(
      { error: 'لا يمكنك تعطيل حسابك الحالي' },
      { status: 400 },
    )
  }

  if (body.is_active === false) {
    const { count, error: countError } = await admin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'super_admin')
      .eq('is_active', true)
      .neq('id', id)

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 })
    }
    if ((count ?? 0) < 1) {
      return NextResponse.json(
        { error: 'يجب بقاء Super Admin نشط واحد على الأقل' },
        { status: 400 },
      )
    }
  }

  const updates: { name?: string; is_active?: boolean } = {}
  if (typeof body.name === 'string' && body.name.trim()) {
    updates.name = body.name.trim()
  }
  if (typeof body.is_active === 'boolean') {
    updates.is_active = body.is_active
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'لا توجد تغييرات' }, { status: 400 })
  }

  const { error: updateError } = await admin.from('users').update(updates).eq('id', id)
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
