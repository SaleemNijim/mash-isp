'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { usePppPlans } from '@/hooks/usePppPlans'
import { isPppPlanBelowMin, type PppPlan } from '@/lib/ppp/plans'

export interface PppPlanInventoryStats {
  availableByPlan: Record<string, number>
  totalByPlan: Record<string, number>
  lowPlans: PppPlan[]
}

export function usePppPlanInventory(): PppPlanInventoryStats & { isLoading: boolean } {
  const supabase = createClient()
  const { data: tenant } = useTenant()
  const { data: plans = [], isLoading: plansLoading } = usePppPlans()

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['ppp-plan-inventory', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) {
        return { availableByPlan: {}, totalByPlan: {} }
      }
      const { data, error } = await supabase
        .from('internet_credentials')
        .select('plan_id, is_used')
        .eq('tenant_id', tenant.id)
        .eq('type', 'bb')
        .eq('is_deleted', false)
        .not('plan_id', 'is', null)
      if (error) throw error

      const availableByPlan: Record<string, number> = {}
      const totalByPlan: Record<string, number> = {}
      for (const row of data ?? []) {
        const pid = row.plan_id as string
        totalByPlan[pid] = (totalByPlan[pid] ?? 0) + 1
        if (!row.is_used) {
          availableByPlan[pid] = (availableByPlan[pid] ?? 0) + 1
        }
      }
      return { availableByPlan, totalByPlan }
    },
    enabled: !!tenant?.id,
  })

  const availableByPlan = stats?.availableByPlan ?? {}
  const totalByPlan = stats?.totalByPlan ?? {}

  const lowPlans = useMemo(
    () =>
      plans.filter((p) =>
        isPppPlanBelowMin(availableByPlan[p.id] ?? 0, p.min_available_usernames),
      ),
    [plans, availableByPlan],
  )

  return {
    availableByPlan,
    totalByPlan,
    lowPlans,
    isLoading: plansLoading || statsLoading,
  }
}
