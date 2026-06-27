export interface PppPlan {
  id: string
  tenant_id: string
  name: string
  speed: string
  price: number
  min_available_usernames: number
  is_deleted: boolean
  created_at: string
}

/** تنبيه فقط عندما min > 0 والمتاح أقل من الحد */
export function isPppPlanBelowMin(available: number, minAvailable: number): boolean {
  return minAvailable > 0 && available < minAvailable
}

/** توحيد السرعة للمطابقة (4M / 4MB / 4 M) */
export function normalizePppSpeed(s: string | null | undefined): string {
  if (!s) return ''
  return s.trim().toUpperCase().replace(/\s+/g, '')
}

/** إيجاد باقة تطابق سرعة الاشتراك */
export function findPppPlanBySpeed(
  plans: PppPlan[],
  subscriptionSpeed: string | null | undefined,
): PppPlan | undefined {
  const norm = normalizePppSpeed(subscriptionSpeed)
  if (!norm) return undefined

  const exact = plans.find((p) => normalizePppSpeed(p.speed) === norm)
  if (exact) return exact

  return plans.find((p) => {
    const planNorm = normalizePppSpeed(p.speed)
    if (!planNorm) return false
    return norm.includes(planNorm) || planNorm.includes(norm)
  })
}

/** نص خيار الباقة في القوائم المنسدلة */
export function formatPppPlanOptionLabel(
  plan: PppPlan,
  available: number,
  formatPrice: (n: number) => string,
): string {
  const low = isPppPlanBelowMin(available, plan.min_available_usernames)
  const baseName = plan.name.trim() || plan.speed || 'باقة'
  const showSpeed = plan.speed && !baseName.includes(plan.speed)
  let label = `${low ? '⚠ ' : ''}${baseName}`
  if (showSpeed) label += ` — ${plan.speed}`
  label += ` (${formatPrice(plan.price)})`
  if (plan.min_available_usernames > 0) label += ` · متاح ${available}`
  return label
}

/** يحوّل package من Excel — كل package = باقة مستقلة (الاسم الكامل) */
export function parsePackageLabel(raw: string): { speed: string; name: string } | null {
  const s = raw.trim()
  if (!s || s.toLowerCase() === 'package') return null

  const mb = s.match(/(\d+)\s*MB/i)
  const speed = mb ? `${mb[1]}MB` : s

  return { speed, name: s }
}

export function isPppPlaceholderRow(username: string, password: string): boolean {
  const u = username.trim().toLowerCase()
  const p = password.trim().toLowerCase()
  return u === 'username' || p === 'password' || u === 'package'
}
