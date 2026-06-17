import { createClient } from '@/lib/supabase/server'

/**
 * Asserts the current server-side user holds `permission`.
 * - role === 'admin' | 'super_admin'  → bypass (always allowed)
 * - otherwise → RPC has_permission (which also checks is_active per §1.1 B2)
 *
 * Throws 'Unauthorized' (401) or 'Forbidden' (403).
 * Call at the top of every Server Action / Route Handler that mutates data.
 */
export async function requirePermission(permission: string): Promise<void> {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('Unauthorized')
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    throw new Error('Unauthorized')
  }

  if (profile.role === 'admin' || profile.role === 'super_admin') {
    return
  }

  // has_permission already joins users.is_active=true (§1.1 B2)
  const { data: hasPerm, error: rpcError } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_permission: permission,
  })

  if (rpcError || !hasPerm) {
    throw new Error('Forbidden')
  }
}
