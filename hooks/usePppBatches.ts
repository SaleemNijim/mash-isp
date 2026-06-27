'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import type { PppBatchRow } from '@/lib/ppp/types'

const BATCH_SELECT =
  'id, tenant_id, plan_id, batch_number, received_at, notes, is_deleted, created_at, ppp_plans(name, speed)'

export function usePppBatches(planId?: string | null) {
  const supabase = createClient()
  const { data: tenant } = useTenant()
  return useQuery<PppBatchRow[]>({
    queryKey: ['ppp-batches', tenant?.id, planId ?? 'all'],
    queryFn: async () => {
      if (!tenant?.id) return []
      let q = supabase
        .from('ppp_batches')
        .select(BATCH_SELECT)
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
        .order('received_at', { ascending: false })
      if (planId) q = q.eq('plan_id', planId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as PppBatchRow[]
    },
    enabled: !!tenant?.id,
  })
}
