'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { throwIfSupabaseError } from '@/lib/supabase/errors'
import { useTenant } from '@/hooks/useTenant'

export const TENANT_USERS_QUERY_KEY = ['tenant-users'] as const
export const TENANT_USER_PERMISSIONS_QUERY_KEY = ['tenant-user-permissions'] as const

export interface TenantUserRow {
  id: string
  name: string
  role: string
  is_active: boolean
}

export function useTenantUsers(enabled = true) {
  const { data: tenant } = useTenant()

  return useQuery<TenantUserRow[]>({
    queryKey: [...TENANT_USERS_QUERY_KEY, tenant?.id],
    enabled: enabled && !!tenant?.id,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('list_tenant_users')
      throwIfSupabaseError(error)
      return (Array.isArray(data) ? data : []) as TenantUserRow[]
    },
    staleTime: 60_000,
  })
}

/** كاشير نشطون في الشركة — يُشتق من list_tenant_users */
export function useTenantEmployees(enabled = true) {
  const query = useTenantUsers(enabled)
  return {
    ...query,
    data: query.data?.filter((u) => u.role === 'employee') ?? [],
  }
}
