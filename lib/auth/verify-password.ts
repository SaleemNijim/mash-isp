import type { SupabaseClient } from '@supabase/supabase-js'
import { mapAuthErrorMessage } from '@/lib/auth/auth-errors'

export async function verifyCurrentPassword(
  supabase: SupabaseClient,
  email: string,
  currentPassword: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: currentPassword,
  })

  if (error) {
    return { ok: false, message: mapAuthErrorMessage(error.message) }
  }

  return { ok: true }
}
