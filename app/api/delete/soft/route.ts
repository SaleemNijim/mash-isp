import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/permissions'
import { createClient } from '@/lib/supabase/server'

/**
 * Tables that support soft delete.
 * Adding a table here is the only code change needed — no client-supplied
 * table names are accepted outside this list (§ Blueprint prohibition).
 */
const SOFT_DELETE_WHITELIST = [
  'customers',
  'subscriptions',
  'internet_credentials',
  'card_products',
  'card_batches',
  'payments',
  'debts',
  'pending_tasks',
  'network_routers',
  'network_ports',
] as const

type SoftDeleteTable = (typeof SOFT_DELETE_WHITELIST)[number]

function isWhitelisted(table: unknown): table is SoftDeleteTable {
  return (
    typeof table === 'string' &&
    (SOFT_DELETE_WHITELIST as readonly string[]).includes(table)
  )
}

/**
 * POST /api/delete/soft
 * Body: { table: string, id: string }
 *
 * Guards:
 *  1. requirePermission('delete_records') — admin/super_admin bypass; others need RPC.
 *  2. Whitelist check — rejects unknown table names.
 *  3. Sets is_deleted=true — never issues a real DELETE (§ Blueprint B8 + §8.1 S5).
 *
 * The 003 trigger fires on is_deleted=true and writes to audit_logs automatically.
 */
export async function POST(request: NextRequest) {
  // 1. Auth + permission
  try {
    await requirePermission('delete_records')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized'
    return NextResponse.json(
      { error: message },
      { status: message === 'Forbidden' ? 403 : 401 }
    )
  }

  // 2. Parse body
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { table, id } = body

  if (!table || !id || typeof id !== 'string') {
    return NextResponse.json(
      { error: '`table` and `id` (string) are required' },
      { status: 400 }
    )
  }

  // 3. Whitelist — client-supplied table names are never trusted raw
  if (!isWhitelisted(table)) {
    return NextResponse.json(
      { error: `Table "${String(table)}" is not in the soft-delete whitelist` },
      { status: 400 }
    )
  }

  // 4. Soft delete — UPDATE only, never DELETE
  const supabase = await createClient()

  const { error } = await supabase
    .from(table)
    .update({ is_deleted: true })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
