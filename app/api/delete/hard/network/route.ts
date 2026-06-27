import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/permissions'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/delete/hard/network
 * Body: { table: 'network_routers' | 'network_ports', id: string }
 *
 * حذف نهائي لسجل شبكة مفرد بعد تأكيد المستخدم.
 */
const HARD_DELETE_RPC: Record<string, string> = {
  network_routers: 'hard_delete_network_router',
  network_ports: 'hard_delete_network_port_cascade',
}

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

  const { table, id } = body
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: '`id` (string) is required' }, { status: 400 })
  }

  const rpc = typeof table === 'string' ? HARD_DELETE_RPC[table] : undefined
  if (!rpc) {
    return NextResponse.json(
      { error: `Table "${String(table)}" is not supported for hard delete` },
      { status: 400 },
    )
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc(rpc, { p_id: id })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
