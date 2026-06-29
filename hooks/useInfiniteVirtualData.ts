'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type InfiniteVirtualOptions = {
  filters?: Record<string, string | null | undefined>
  orderBy?: { column: string; ascending?: boolean }
  select?: string
  enabled?: boolean
}

export function useInfiniteVirtualData<T = Record<string, unknown>>(
  tableName: string,
  searchFields: string[],
  search: string,
  options?: InfiniteVirtualOptions,
) {
  const PAGE = 100
  const supabase = createClient()
  const filters = options?.filters
  const orderBy = options?.orderBy
  const select = options?.select ?? '*'
  const enabled = options?.enabled ?? true

  const query = useInfiniteQuery({
    queryKey: [tableName, search, filters, orderBy, select],
    queryFn: async ({ pageParam = 0 }) => {
      let q = supabase
        .from(tableName)
        .select(select, { count: 'exact' })
        .eq('is_deleted', false)
        .range(pageParam * PAGE, (pageParam + 1) * PAGE - 1)

      if (filters) {
        for (const [col, val] of Object.entries(filters)) {
          if (val != null && val !== '') q = q.eq(col, val)
        }
      }

      if (search)
        q = q.or(searchFields.map(f => `${f}.ilike.%${search}%`).join(','))

      if (orderBy) {
        q = q.order(orderBy.column, { ascending: orderBy.ascending ?? true })
      }

      return q
    },
    getNextPageParam: (last, pages) => {
      return pages.length * PAGE < (last.count ?? 0) ? pages.length : undefined
    },
    initialPageParam: 0,
    enabled,
  })

  const allItems = (query.data?.pages.flatMap((p) => (p.data ?? []) as T[]) ?? []) as T[]
  return { ...query, allItems }
}
