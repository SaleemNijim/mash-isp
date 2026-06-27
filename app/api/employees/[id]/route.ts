import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyUserProfile } from '@/lib/auth/complete-user-setup'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/employees/[id]
 * يُرجع بريد الكاشير (للمدير فقط).
 */
export async function GET(_request: NextRequest, context: RouteContext) {
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

  const { id: employeeId } = await context.params

  const admin = createAdminClient()
  const { data: employeeRow, error: employeeError } = await admin
    .from('users')
    .select('id, tenant_id, role')
    .eq('id', employeeId)
    .single()

  if (
    employeeError ||
    !employeeRow ||
    employeeRow.tenant_id !== profile.tenant_id ||
    employeeRow.role !== 'employee'
  ) {
    return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 })
  }

  const { data: authUser, error: fetchError } = await admin.auth.admin.getUserById(employeeId)
  if (fetchError || !authUser.user) {
    return NextResponse.json({ error: 'تعذّر قراءة بيانات الدخول' }, { status: 500 })
  }

  return NextResponse.json({ email: authUser.user.email ?? '' })
}
