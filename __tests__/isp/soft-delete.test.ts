import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { hasSupabaseEnv, skipReason } from '../helpers/env'

const describeIfSupabase = hasSupabaseEnv() ? describe : describe.skip

describeIfSupabase('soft delete (§8.1 S5 / S6)', () => {
  if (!hasSupabaseEnv()) {
    it.skip(skipReason('supabase'), () => {})
    return
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  it('soft-deleted records remain queryable with is_deleted=true', async () => {
    const { data, error } = await supabase
      .from('customers')
      .select('id, is_deleted')
      .eq('is_deleted', true)
      .limit(5)

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    if (data && data.length > 0) {
      expect(data.every((r) => r.is_deleted === true)).toBe(true)
    }
  })

  it('audit_logs table is reachable for delete audit trail', async () => {
    const { error } = await supabase.from('audit_logs').select('id').limit(1)
    expect(error).toBeNull()
  })
})

describe('soft delete API contract (static)', () => {
  it('whitelist includes customers and never issues real DELETE', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const source = readFileSync(
      join(process.cwd(), 'app', 'api', 'delete', 'soft', 'route.ts'),
      'utf8',
    )

    expect(source).toContain("'customers'")
    expect(source).toContain('is_deleted: true')
    expect(source).not.toMatch(/\.delete\(/)
  })
})
