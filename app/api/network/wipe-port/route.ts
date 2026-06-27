import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/permissions'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/network/wipe-port
 * Body: { port_id: string }
 *
 * حذف نهائي لبورت محدد مع أبنائه والراوترات/المتجاوَزة المرتبطة.
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

  const portId = body.port_id
  if (!portId || typeof portId !== 'string') {
    return NextResponse.json({ error: '`port_id` (string) is required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('hard_delete_network_port_cascade', {
    p_id: portId,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const portsDeleted = typeof data === 'number' ? data : 0

  return NextResponse.json({ success: true, ports_deleted: portsDeleted })
}
