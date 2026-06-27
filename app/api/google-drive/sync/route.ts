import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getDriveTenantEligibility } from '@/lib/google-drive/eligibility'
import { syncConnectedTenants, syncTenantDrive } from '@/lib/google-drive/sync'

function isCronRequest(request: NextRequest): boolean {
  const secret = process.env.GOOGLE_DRIVE_SYNC_SECRET ?? process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(request: NextRequest) {
  if (isCronRequest(request)) {
    const admin = createAdminClient()
    const results = await syncConnectedTenants(admin)
    return NextResponse.json({ ok: true, results })
  }

  const supabase = await createClient()
  const eligibility = await getDriveTenantEligibility(supabase)

  if (!eligibility) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  }

  if (!eligibility.eligible) {
    return NextResponse.json({ error: 'الميزة متاحة للباقات المدفوعة فقط' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tenant_drive_sync')
    .select(
      'tenant_id,drive_folder_id,drive_folder_name,access_token_encrypted,refresh_token_encrypted,token_expires_at,file_ids',
    )
    .eq('tenant_id', eligibility.tenantId)
    .eq('is_connected', true)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Google Drive غير مربوط' }, { status: 400 })
  }

  const result = await syncTenantDrive(admin, data)
  return NextResponse.json({ ok: true, result })
}

export async function GET(request: NextRequest) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  }

  const admin = createAdminClient()
  const results = await syncConnectedTenants(admin)
  return NextResponse.json({ ok: true, results })
}
