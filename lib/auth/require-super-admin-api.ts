import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMyUserProfile } from '@/lib/auth/complete-user-setup'

export async function requireSuperAdminApi() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'غير مصرح' }, { status: 401 }),
    }
  }

  const profile = await getMyUserProfile(supabase)
  if (profile?.role !== 'super_admin' || !profile.is_active) {
    return {
      error: NextResponse.json({ error: 'Super Admin فقط' }, { status: 403 }),
    }
  }

  return { supabase, user, profile }
}
