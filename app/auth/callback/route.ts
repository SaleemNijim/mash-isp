import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolvePostLoginPath } from '@/lib/auth-redirect'
import { fetchOrCompleteUserProfile } from '@/lib/auth/complete-user-setup'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/register?error=setup_failed`)
  }

  const supabase = await createClient()

  const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code)

  if (sessionError || !data.user) {
    return NextResponse.redirect(`${origin}/register?error=setup_failed`)
  }

  const { profile, setupError } = await fetchOrCompleteUserProfile(supabase, data.user)

  if (!profile) {
    const q = setupError ? `?error=setup_failed` : '?error=setup_incomplete'
    return NextResponse.redirect(`${origin}/register${q}`)
  }

  return NextResponse.redirect(`${origin}${resolvePostLoginPath(profile.role)}`)
}
