import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SuperAdminLayoutClient } from '@/app/super-admin/SuperAdminLayoutClient'

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profileRows, error: profileError } = await supabase.rpc('get_my_user_profile')

  if (profileError) {
    redirect('/login?error=setup_incomplete')
  }

  const profile = Array.isArray(profileRows) ? profileRows[0] : profileRows

  if (!profile?.is_active) {
    redirect('/suspended')
  }

  if (profile.role !== 'super_admin') {
    redirect('/dashboard')
  }

  return <SuperAdminLayoutClient>{children}</SuperAdminLayoutClient>
}
