import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/permissions'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/network/wipe
 * حذف نهائي (Hard Delete) لكل بيانات الشبكة للـ tenant الحالي.
 */
export async function POST() {
  try {
    await requirePermission('delete_records')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized'
    return NextResponse.json(
      { error: message },
      { status: message === 'Forbidden' ? 403 : 401 },
    )
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('hard_delete_all_network')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const total = typeof data === 'number' ? data : 0

  return NextResponse.json({ success: true, total })
}
