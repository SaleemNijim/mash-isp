import type { SupabaseClient } from '@supabase/supabase-js'
import { getMyUserProfile } from '@/lib/auth/complete-user-setup'

export type DriveAccessMode = 'admin' | 'sync'

export interface DriveTenantEligibility {
  tenantId: string
  tenantName: string
  eligible: boolean
  reason: 'paid_plan' | 'trial' | 'inactive' | 'expired' | 'missing_plan'
}

export function isDriveRoleAllowed(
  role: string | null | undefined,
  access: DriveAccessMode,
): boolean {
  if (!role) return false
  if (access === 'admin') return role === 'admin'
  return role === 'admin' || role === 'employee'
}

export async function getDriveTenantEligibility(
  supabase: SupabaseClient,
  access: DriveAccessMode = 'admin',
): Promise<DriveTenantEligibility | null> {
  const profile = await getMyUserProfile(supabase)
  if (
    !profile?.tenant_id ||
    !profile.is_active ||
    !isDriveRoleAllowed(profile.role, access)
  ) {
    return null
  }

  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id,name,is_active,is_trial,subscription_end,billing_cycle,plan_id')
    .eq('id', profile.tenant_id)
    .single()

  if (error || !tenant) return null

  const subscriptionEnd = tenant.subscription_end
    ? new Date(tenant.subscription_end).getTime()
    : 0
  const isExpired = subscriptionEnd > 0 && subscriptionEnd < Date.now()

  if (!tenant.is_active) {
    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      eligible: false,
      reason: 'inactive',
    }
  }

  if (tenant.is_trial) {
    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      eligible: false,
      reason: 'trial',
    }
  }

  if (!tenant.plan_id || !tenant.billing_cycle) {
    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      eligible: false,
      reason: 'missing_plan',
    }
  }

  if (isExpired) {
    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      eligible: false,
      reason: 'expired',
    }
  }

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    eligible: true,
    reason: 'paid_plan',
  }
}
