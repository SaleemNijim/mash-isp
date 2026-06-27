import { NextRequest, NextResponse } from 'next/server'
import { createMiddlewareClient } from '@/lib/supabase/proxy-client'
import { EMPLOYEE_ROUTE_PREFIXES } from '@/lib/navigation'
import { isEmployeeRouteAllowed } from '@/lib/permissions'

type ProxyProfile = {
  role: string
  is_active: boolean
  tenant_id: string | null
  force_logout_at: string | null
}

export async function proxy(request: NextRequest) {
  const { supabase, response } = createMiddlewareClient(request)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const { data: profileRows, error: profileError } = await supabase.rpc('get_my_user_profile')

  if (profileError) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?error=setup_incomplete', request.url))
  }

  const profile = (Array.isArray(profileRows) ? profileRows[0] : profileRows) as ProxyProfile | undefined

  if (!profile?.role) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?error=setup_incomplete', request.url))
  }

  if (!profile.is_active) return NextResponse.redirect(new URL('/suspended', request.url))

  if (profile.force_logout_at) {
    const { data: { session } } = await supabase.auth.getSession()
    const signedInAt = session?.user?.last_sign_in_at
    if (signedInAt && new Date(profile.force_logout_at) > new Date(signedInAt)) {
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  if (profile.role === 'super_admin') {
    if (!request.nextUrl.pathname.startsWith('/super-admin'))
      return NextResponse.redirect(new URL('/super-admin/tenants', request.url))
    return response()
  }

  if (!profile.tenant_id) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?error=setup_incomplete', request.url))
  }

  const { data: tenant } = await supabase.from('tenants')
    .select('is_active,is_trial,trial_ends_at,subscription_end')
    .eq('id', profile.tenant_id).single()

  if (!tenant?.is_active)
    return NextResponse.redirect(new URL('/subscription-expired', request.url))

  const expiryDate = tenant.is_trial
    ? new Date(tenant.trial_ends_at)
    : new Date(tenant.subscription_end)
  if (expiryDate < new Date())
    return NextResponse.redirect(new URL('/subscription-expired', request.url))

  if (request.nextUrl.pathname.startsWith('/super-admin'))
    return NextResponse.redirect(new URL('/dashboard', request.url))

  const pathname = request.nextUrl.pathname

  if (profile.role === 'employee') {
    const isKnownRoute = EMPLOYEE_ROUTE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
    )
    if (!isKnownRoute) {
      return NextResponse.redirect(new URL('/sales', request.url))
    }

    const { data: permRows } = await supabase
      .from('user_permissions')
      .select('permission')
      .eq('user_id', user.id)

    const permissions = (permRows ?? []).map((r) => r.permission as string)

    if (!isEmployeeRouteAllowed(pathname, permissions)) {
      return NextResponse.redirect(new URL('/sales', request.url))
    }
  }

  return response()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|login|register|verify-email|forgot-password|reset-password|subscription-expired|suspended|auth|features|pricing|contact)(?:.+))',
  ],
}
