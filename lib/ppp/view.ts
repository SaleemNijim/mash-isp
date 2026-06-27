/** عرض باقة PPP — كل باقة = مخزون معزول (مثل port:uuid) */
export type PppPlanViewId = string

export type PppViewFilter = 'all' | `plan:${string}`

export function planViewFilter(planId: string): PppViewFilter {
  return `plan:${planId}`
}

export function parsePppViewFilter(filter: PppViewFilter): {
  mode: 'all' | 'plan'
  planId?: string
} {
  if (filter === 'all') return { mode: 'all' }
  if (filter.startsWith('plan:')) {
    return { mode: 'plan', planId: filter.slice(5) }
  }
  return { mode: 'all' }
}

export function isValidPlanView(planId: string | null | undefined): planId is PppPlanViewId {
  return typeof planId === 'string' && planId.length > 0
}
