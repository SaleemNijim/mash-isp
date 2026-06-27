'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'

export interface NetworkPort {
  id: string
  name: string
  parent_port_id: string | null
  capacity: number | null
}

export function useNetworkPorts() {
  const { data: tenant } = useTenant()
  const supabase = createClient()

  return useQuery({
    queryKey: ['network-ports', tenant?.id],
    queryFn: async (): Promise<NetworkPort[]> => {
      if (!tenant?.id) return []

      const { data, error } = await supabase
        .from('network_ports')
        .select('id, name, parent_port_id, capacity')
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
        .order('name')

      if (error) throw error
      return data ?? []
    },
    enabled: !!tenant?.id,
    staleTime: 30_000,
  })
}
