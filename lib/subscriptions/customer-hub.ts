export interface CustomerSubscriptionSummary {
  id: string
  customer_id: string
  type: 'bb' | 'we'
  speed: string | null
  price: number | null
  end_date: string | null
  status: string | null
}

export type HubStatusFilter =
  | 'all'
  | 'no_subscription'
  | 'active'
  | 'expired'
  | 'expiring_soon'
  | 'has_debt'

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function addDaysISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function formatHubDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function subscriptionStatusLabel(endDate: string | null): {
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
} {
  if (!endDate) return { label: 'بدون اشتراك', variant: 'outline' }
  const today = todayISO()
  if (endDate < today) return { label: 'منتهي', variant: 'destructive' }
  if (endDate <= addDaysISO(7)) return { label: 'ينتهي قريباً', variant: 'secondary' }
  return { label: 'نشط', variant: 'default' }
}

export function matchesHubFilter(
  filter: HubStatusFilter,
  endDate: string | null,
  hasSubscription: boolean,
  debtTotal: number,
): boolean {
  const today = todayISO()
  const weekEnd = addDaysISO(7)

  switch (filter) {
    case 'all':
      return true
    case 'no_subscription':
      return !hasSubscription
    case 'active':
      return hasSubscription && !!endDate && endDate >= today
    case 'expired':
      return hasSubscription && !!endDate && endDate < today
    case 'expiring_soon':
      return (
        hasSubscription &&
        !!endDate &&
        endDate >= today &&
        endDate <= weekEnd
      )
    case 'has_debt':
      return debtTotal > 0
    default:
      return true
  }
}
