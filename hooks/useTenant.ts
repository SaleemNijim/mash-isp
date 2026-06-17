'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface Tenant {
  id: string
  name: string
  is_active: boolean
  is_trial: boolean
  trial_ends_at: string | null
  subscription_end: string | null
  plan_id: string | null
  billing_cycle: string | null
}

export function useTenant() {
  const supabase = createClient()

  return useQuery<Tenant | null>({
    queryKey: ['tenant'],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return null

      const { data: profile } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.id)
        .single()

      if (!profile?.tenant_id) return null

      const { data: tenant } = await supabase
        .from('tenants')
        .select('id,name,is_active,is_trial,trial_ends_at,subscription_end,plan_id,billing_cycle')
        .eq('id', profile.tenant_id)
        .single()

      return tenant ?? null
    },
    staleTime: 5 * 60 * 1000,
  })
}
