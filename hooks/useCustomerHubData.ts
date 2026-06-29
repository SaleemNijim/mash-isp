'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { useInfiniteVirtualData } from '@/hooks/useInfiniteVirtualData'
import type { CustomerSubscriptionSummary } from '@/lib/subscriptions/customer-hub'
import type { CustomerRecord } from '@/components/customers/CustomerFormModal'

export function useCustomerHubData(search: string) {
  const supabase = createClient()
  const { data: tenant } = useTenant()

  const customerQuery = useInfiniteVirtualData<CustomerRecord>(
    'customers',
    ['name', 'phone', 'address'],
    search,
  )

  const { data: subscriptionByCustomer = new Map<string, CustomerSubscriptionSummary>() } =
    useQuery({
      queryKey: ['hub-subscriptions', tenant?.id],
      queryFn: async () => {
        if (!tenant?.id) return new Map<string, CustomerSubscriptionSummary>()
        const { data, error } = await supabase
          .from('subscriptions')
          .select('id, customer_id, type, speed, price, end_date, status')
          .eq('tenant_id', tenant.id)
          .eq('is_deleted', false)
          .order('end_date', { ascending: false, nullsFirst: false })
        if (error) throw error

        const map = new Map<string, CustomerSubscriptionSummary>()
        for (const row of data ?? []) {
          if (!map.has(row.customer_id)) {
            map.set(row.customer_id, row as CustomerSubscriptionSummary)
          }
        }
        return map
      },
      enabled: !!tenant?.id,
      staleTime: 30_000,
    })

  const { data: debtByCustomer = new Map<string, number>() } = useQuery({
    queryKey: ['hub-debts', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return new Map<string, number>()
      const { data, error } = await supabase
        .from('debts')
        .select('customer_id, remaining_amount')
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
        .in('status', ['active', 'temporary'])
      if (error) throw error

      const map = new Map<string, number>()
      for (const row of data ?? []) {
        const amount = Number(row.remaining_amount ?? 0)
        if (amount <= 0) continue
        map.set(row.customer_id, (map.get(row.customer_id) ?? 0) + amount)
      }
      return map
    },
    enabled: !!tenant?.id,
    staleTime: 30_000,
  })

  const customers = customerQuery.allItems

  return {
    ...customerQuery,
    customers,
    subscriptionByCustomer,
    debtByCustomer,
  }
}
