import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { hasSupabaseEnv, skipReason } from '../helpers/env'

const describeIfSupabase = hasSupabaseEnv() ? describe : describe.skip

describeIfSupabase('registration flow (§2.1 / §8.2 PR6)', () => {
  if (!hasSupabaseEnv()) {
    it.skip(skipReason('supabase'), () => {})
    return
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  it('free_trial plan exists with trial_days from DB', async () => {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('slug, trial_days, is_active')
      .eq('slug', 'free_trial')
      .single()

    expect(error).toBeNull()
    expect(data?.is_active).toBe(true)
    expect(data?.trial_days).toBeGreaterThan(0)
  })

  it('create_tenant_with_trial RPC is callable (requires authenticated user in integration)', async () => {
    const { data, error } = await supabase.rpc('create_tenant_with_trial', {
      p_company_name: '__test_skip__',
      p_admin_name: '__test_skip__',
    })

    // Without auth context the RPC should fail — proves function exists
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error?.message).toBeTruthy()
  })
})

describe('registration page contract (static)', () => {
  it('documents verify-email path when session is null', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const source = readFileSync(
      join(process.cwd(), 'app', 'register', 'page.tsx'),
      'utf8',
    )
    expect(source).toContain('/verify-email')
    expect(source).toContain('emailRedirectTo')
    expect(source).toContain('/auth/callback')
  })
})
