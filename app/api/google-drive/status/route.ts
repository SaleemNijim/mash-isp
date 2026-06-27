import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGoogleDriveConfigError } from '@/lib/google-drive/client'
import { getDriveTenantEligibility } from '@/lib/google-drive/eligibility'

export async function GET() {
  const supabase = await createClient()
  const eligibility = await getDriveTenantEligibility(supabase)

  if (!eligibility) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tenant_drive_sync')
    .select('google_email,drive_folder_name,is_connected,last_success_at,last_error_at,last_error_message')
    .eq('tenant_id', eligibility.tenantId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    eligible: eligibility.eligible,
    reason: eligibility.reason,
    tenantName: eligibility.tenantName,
    googleConfigured: getGoogleDriveConfigError() === null,
    sync: data ?? null,
  })
}
