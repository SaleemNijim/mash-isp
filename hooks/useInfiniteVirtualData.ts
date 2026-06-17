'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function useInfiniteVirtualData(
  tableName: string,
  searchFields: string[],
  search: string,
) {
  const PAGE = 100
  const supabase = createClient()

  const query = useInfiniteQuery({
    queryKey: [tableName, search],
    queryFn: async ({ pageParam = 0 }) => {
      let q = supabase
        .from(tableName)
        .select('*', { count: 'exact' })
        .eq('is_deleted', false)
        .range(pageParam * PAGE, (pageParam + 1) * PAGE - 1)

      if (search)
        q = q.or(searchFields.map(f => `${f}.ilike.%${search}%`).join(','))

      return q
    },
    getNextPageParam: (last, pages) => {
      return pages.length * PAGE < (last.count ?? 0) ? pages.length : undefined
    },
    initialPageParam: 0,
  })

  const allItems = query.data?.pages.flatMap(p => p.data ?? []) ?? []
  return { ...query, allItems }
}
