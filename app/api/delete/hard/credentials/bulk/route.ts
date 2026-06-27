import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/permissions'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/delete/hard/credentials/bulk
 * Body: { batch_id: string } — حذf usernames دفعة واحدة
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

  const { batch_id } = body
  if (!batch_id || typeof batch_id !== 'string') {
    return NextResponse.json({ error: '`batch_id` (string) is required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('bulk_hard_delete_internet_credentials', {
    p_batch_id: batch_id,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const result = (data ?? { deleted: 0, skipped: 0 }) as {
    deleted: number
    skipped: number
  }

  return NextResponse.json({ success: true, ...result })
}
