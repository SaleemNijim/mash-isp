import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getDriveTenantEligibility } from '@/lib/google-drive/eligibility'

export async function POST() {
  const supabase = await createClient()
  const eligibility = await getDriveTenantEligibility(supabase)

  if (!eligibility) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('tenant_drive_sync')
    .update({
      is_connected: false,
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_expires_at: null,
    })
    .eq('tenant_id', eligibility.tenantId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
