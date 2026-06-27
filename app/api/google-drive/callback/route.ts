import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  encryptTokenPayload,
  exchangeCodeForTokens,
  getGoogleAccountEmail,
  GOOGLE_DRIVE_FILE_SCOPE,
} from '@/lib/google-drive/client'
import { getDriveTenantEligibility } from '@/lib/google-drive/eligibility'
import { syncTenantDrive } from '@/lib/google-drive/sync'

function redirectToSettings(request: NextRequest, status: string): NextResponse {
  return NextResponse.redirect(new URL(`/settings?drive=${status}`, request.url))
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) return redirectToSettings(request, 'oauth-error')
  if (!code || !state) return redirectToSettings(request, 'missing-code')

  const cookieStore = await cookies()
  const expectedState = cookieStore.get('google_drive_oauth_state')?.value
  cookieStore.delete('google_drive_oauth_state')

  if (!expectedState || expectedState !== state) {
    return redirectToSettings(request, 'invalid-state')
  }

  const supabase = await createClient()
  const eligibility = await getDriveTenantEligibility(supabase)
  if (!eligibility?.eligible) {
    return redirectToSettings(request, 'not-eligible')
  }

  try {
    const tokens = await exchangeCodeForTokens(code, new URL(request.url).origin)
    if (!tokens.refresh_token) {
      return redirectToSettings(request, 'missing-refresh-token')
    }

    const googleEmail = await getGoogleAccountEmail(tokens.access_token)
    const encrypted = encryptTokenPayload({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
    })

    const admin = createAdminClient()
    const folderName = `MASH ISP — ${eligibility.tenantName}`
    const { data, error: upsertError } = await admin
      .from('tenant_drive_sync')
      .upsert(
        {
          tenant_id: eligibility.tenantId,
          google_email: googleEmail,
          drive_folder_name: folderName,
          scope: tokens.scope ?? GOOGLE_DRIVE_FILE_SCOPE,
          is_connected: true,
          last_error_at: null,
          last_error_message: null,
          ...encrypted,
        },
        { onConflict: 'tenant_id' },
      )
      .select(
        'tenant_id,drive_folder_id,drive_folder_name,access_token_encrypted,refresh_token_encrypted,token_expires_at,file_ids',
      )
      .single()

    if (upsertError) throw new Error(upsertError.message)
    await syncTenantDrive(admin, data)

    return redirectToSettings(request, 'connected')
  } catch (err) {
    const admin = createAdminClient()
    await admin
      .from('tenant_drive_sync')
      .upsert(
        {
          tenant_id: eligibility.tenantId,
          is_connected: false,
          last_error_at: new Date().toISOString(),
          last_error_message: err instanceof Error ? err.message : 'Google Drive connection failed',
        },
        { onConflict: 'tenant_id' },
      )
    return redirectToSettings(request, 'error')
  }
}
