'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import {
  NETWORK_PORT_NUMBERS,
  networkPortLabel,
  type NetworkPortNumber,
} from '@/lib/network/ports'

export function useNetworkPortMap() {
  const { data: tenant } = useTenant()
  const supabase = createClient()

  return useQuery({
    queryKey: ['network-port-map', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return new Map<NetworkPortNumber, string>()

      const names = NETWORK_PORT_NUMBERS.map((n) => networkPortLabel(n))
      const { data: existing } = await supabase
        .from('network_ports')
        .select('id, name')
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
        .in('name', names)

      const map = new Map<NetworkPortNumber, string>()
      existing?.forEach((p) => {
        const match = /^Port (\d+)$/.exec(p.name as string)
        if (match) map.set(Number(match[1]) as NetworkPortNumber, p.id as string)
      })

      const missing = NETWORK_PORT_NUMBERS.filter((n) => !map.has(n))
      if (missing.length > 0) {
        const { data: created, error } = await supabase
          .from('network_ports')
          .insert(
            missing.map((n) => ({
              tenant_id: tenant.id,
              name: networkPortLabel(n),
              is_deleted: false,
            })),
          )
          .select('id, name')
        if (error) throw error
        created?.forEach((p) => {
          const match = /^Port (\d+)$/.exec(p.name as string)
          if (match) map.set(Number(match[1]) as NetworkPortNumber, p.id as string)
        })
      }

      return map
    },
    enabled: !!tenant?.id,
    staleTime: 60_000,
  })
}
