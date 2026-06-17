import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/pending-tasks/remind
 * Body: { id: string }
 *
 * يُحدِّث status='reminded' — B9 enum.
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

  const { id } = body

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: '`id` مطلوب' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('pending_tasks')
    .update({ status: 'reminded' })
    .eq('id', id)
    .in('status', ['pending', 'reminded'])
    .select('id, status')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'المهمة غير موجودة أو غير قابلة للتذكير' }, { status: 404 })
  }

  return NextResponse.json({ id: data.id, status: data.status })
}
