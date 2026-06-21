import type { QueryClient } from '@tanstack/react-query'

/** إبطال كل الاستعلامات المتأثرة بتسديد دين أو استلام دفعة موزع */
export async function invalidateDebtQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['debts-customers'] }),
    queryClient.invalidateQueries({ queryKey: ['debts-distributors'] }),
    queryClient.invalidateQueries({ queryKey: ['debts'] }),
    queryClient.invalidateQueries({ queryKey: ['hub-debts'] }),
    queryClient.invalidateQueries({ queryKey: ['pending-inbox'] }),
    queryClient.invalidateQueries({ queryKey: ['pending-inbox-count'] }),
    queryClient.invalidateQueries({ queryKey: ['subscription-periods'] }),
    queryClient.invalidateQueries({ queryKey: ['payments'] }),
    queryClient.invalidateQueries({ queryKey: ['customers'] }),
    queryClient.invalidateQueries({ queryKey: ['distributor'] }),
    queryClient.invalidateQueries({ queryKey: ['distributor-receipts'] }),
    queryClient.invalidateQueries({ queryKey: ['distributors-select'] }),
  ])
}
