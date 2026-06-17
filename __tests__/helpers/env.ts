export function hasSupabaseEnv(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export function hasTenantJwts(): boolean {
  return !!(
    process.env.TEST_TENANT_A_JWT &&
    process.env.TEST_TENANT_B_JWT
  )
}

export function skipReason(env: 'supabase' | 'jwts'): string {
  if (env === 'supabase') {
    return 'Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY'
  }
  return 'Missing TEST_TENANT_A_JWT or TEST_TENANT_B_JWT'
}
