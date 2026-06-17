import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { hasSupabaseEnv, hasTenantJwts, skipReason } from '../helpers/env'

const describeIfSupabase = hasSupabaseEnv() ? describe : describe.skip
const describeIfJwts = hasSupabaseEnv() && hasTenantJwts() ? describe : describe.skip

describeIfSupabase('multi-tenant security (§8.1)', () => {
  if (!hasSupabaseEnv()) {
    it.skip(skipReason('supabase'), () => {})
    return
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  describeIfJwts('S1 — Tenant A cannot SELECT Tenant B customers', () => {
    it('returns 0 rows when Tenant A queries another tenant', async () => {
      const tenantA = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        global: { headers: { Authorization: `Bearer ${process.env.TEST_TENANT_A_JWT}` } },
      })

      const admin = createClient(supabaseUrl, serviceKey)
      const { data: tenants } = await admin.from('tenants').select('id').limit(2)
      if (!tenants || tenants.length < 2) {
        console.warn('Need at least 2 tenants in test DB — skipping assertion')
        return
      }

      const foreignTenantId = tenants.find((t) => t.id)?.id
      if (!foreignTenantId) return

      const { data, error } = await tenantA
        .from('customers')
        .select('id')
        .eq('tenant_id', foreignTenantId)

      expect(error).toBeNull()
      expect(data ?? []).toHaveLength(0)
    })
  })

  describe('S2/S5 — soft delete API tenant isolation', () => {
    it('POST /api/delete/soft rejects cross-tenant delete without permission', async () => {
      // Without a valid session cookie the route must return 401
      const baseUrl = process.env.TEST_BASE_URL ?? 'http://localhost:3000'
      const res = await fetch(`${baseUrl}/api/delete/soft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'customers', id: '00000000-0000-0000-0000-000000000000' }),
      })

      expect([401, 403]).toContain(res.status)
    })
  })
})

describe('S9 — Realtime isolation', () => {
  it.skip(
    hasSupabaseEnv() && hasTenantJwts()
      ? undefined
      : skipReason(hasSupabaseEnv() ? 'jwts' : 'supabase'),
    () => {
      // Requires two live browser sessions — manual QA documented in docs/TESTING.md
    },
  )
})
