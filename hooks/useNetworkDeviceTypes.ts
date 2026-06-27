'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

/** أنواع الأجهزة المستخدمة سابقاً في الشبكة (distinct من DB) */
export function useNetworkDeviceTypes() {
  const supabase = createClient()

  return useQuery<string[]>({
    queryKey: ['network-device-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('network_routers')
        .select('device_type')
        .eq('is_deleted', false)
        .not('device_type', 'is', null)

      if (error) throw error

      const unique = new Set<string>()
      for (const row of data ?? []) {
        const value = row.device_type?.trim()
        if (value) unique.add(value)
      }

      return [...unique].sort((a, b) => a.localeCompare(b, 'ar'))
    },
    staleTime: 60_000,
  })
}
