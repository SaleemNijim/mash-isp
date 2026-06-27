import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createGoogleAuthUrl, getGoogleDriveConfigError } from '@/lib/google-drive/client'
import { getDriveTenantEligibility } from '@/lib/google-drive/eligibility'

function redirectToSettings(request: NextRequest, status: string): NextResponse {
  return NextResponse.redirect(new URL(`/settings?drive=${status}`, request.url))
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const eligibility = await getDriveTenantEligibility(supabase)

    if (!eligibility) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    if (!eligibility.eligible) {
      return redirectToSettings(request, 'not-eligible')
    }

    const configError = getGoogleDriveConfigError()
    if (configError) {
      return redirectToSettings(request, configError)
    }

    const state = crypto.randomBytes(24).toString('base64url')
    const cookieStore = await cookies()
    cookieStore.set('google_drive_oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 10 * 60,
    })

    const origin = new URL(request.url).origin
    return NextResponse.redirect(createGoogleAuthUrl(state, origin))
  } catch (err) {
    console.error('[google-drive/connect]', err)
    return redirectToSettings(request, 'error')
  }
}
