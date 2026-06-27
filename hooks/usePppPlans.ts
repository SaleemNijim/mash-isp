'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import type { PppPlan } from '@/lib/ppp/plans'

const PPP_PLAN_SELECT =
  'id, tenant_id, name, speed, price, min_available_usernames, is_deleted, created_at'

export function usePppPlans() {
  const supabase = createClient()
  const { data: tenant } = useTenant()
  return useQuery<PppPlan[]>({
    queryKey: ['ppp-plans', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return []
      const { data, error } = await supabase
        .from('ppp_plans')
        .select(PPP_PLAN_SELECT)
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
        .order('name')
      if (error) throw error
      return (data ?? []) as PppPlan[]
    },
    enabled: !!tenant?.id,
  })
}
