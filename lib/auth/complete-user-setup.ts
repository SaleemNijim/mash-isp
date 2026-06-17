import type { SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'

export type UserProfile = {
  role: string
  is_active: boolean
}

type DbProfile = {
  role: string
  is_active: boolean
  tenant_id: string | null
  force_logout_at: string | null
}

/** جلب الملف عبر RPC — يتجاوز قيود RLS عند الدخول */
export async function getMyUserProfile(
  supabase: SupabaseClient,
): Promise<DbProfile | null> {
  const { data, error } = await supabase.rpc('get_my_user_profile')

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[auth] get_my_user_profile:', error.message)
    }
    return null
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') return null

  const p = row as DbProfile
  if (!p.role) return null
  return p
}

/**
 * يجلب ملف المستخدم أو يُكمل إعداد الشركة من metadata عند الحاجة.
 */
export async function fetchOrCompleteUserProfile(
  supabase: SupabaseClient,
  user: User,
): Promise<{ profile: UserProfile | null; setupError?: string }> {
  const existing = await getMyUserProfile(supabase)
  if (existing) {
    return { profile: { role: existing.role, is_active: existing.is_active } }
  }

  const meta = user.user_metadata ?? {}
  const companyName =
    typeof meta.company_name === 'string' ? meta.company_name.trim() : ''
  const adminName =
    (typeof meta.admin_name === 'string' ? meta.admin_name.trim() : '') ||
    companyName ||
    (typeof meta.name === 'string' ? meta.name.trim() : '')

  if (!companyName || !adminName) {
    return { profile: null, setupError: 'missing_metadata' }
  }

  const { error: rpcError } = await supabase.rpc('create_tenant_with_trial', {
    p_company_name: companyName,
    p_admin_name: adminName,
  })

  if (rpcError) {
    const isDuplicate =
      rpcError.message.includes('duplicate key') ||
      rpcError.code === '23505'

    if (isDuplicate) {
      const retry = await getMyUserProfile(supabase)
      if (retry) {
        return { profile: { role: retry.role, is_active: retry.is_active } }
      }
    }

    return { profile: null, setupError: rpcError.message }
  }

  const created = await getMyUserProfile(supabase)
  if (!created) {
    return { profile: null, setupError: 'profile_not_found_after_setup' }
  }

  return { profile: { role: created.role, is_active: created.is_active } }
}
