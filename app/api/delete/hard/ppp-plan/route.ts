import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/permissions'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/delete/hard/ppp-plan
 * Body: { id: string }
 */
export async function POST(request: NextRequest) {
  try {
    await requirePermission('delete_records')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized'
    return NextResponse.json(
      { error: message },
      { status: message === 'Forbidden' ? 403 : 401 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { id } = body
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: '`id` (string) is required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('hard_delete_ppp_plan', {
    p_plan_id: id,
  })

  if (error) {
    const msg = error.message
    if (
      msg.includes('still has usernames') ||
      msg.includes('still has batches') ||
      msg.includes('not found') ||
      msg.includes('access denied')
    ) {
      return NextResponse.json({ error: msg }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
