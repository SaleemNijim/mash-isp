/** عرض مدة التجربة من قيمة DB — بدون hard-code لعدد الأيام */
export function formatTrialPeriod(days: number | null | undefined): string {
  if (days == null || days <= 0) return 'تجربة مجانية'
  if (days === 30) return 'شهر مجاني'
  if (days % 30 === 0) {
    const months = days / 30
    return months === 1 ? 'شهر مجاني' : `${months} أشهر مجاناً`
  }
  return `${days} يوماً`
}

export function formatTrialPeriodShort(days: number | null | undefined): string {
  if (days == null || days <= 0) return ''
  if (days === 30) return '/ شهر مجاني'
  if (days % 30 === 0) {
    const months = days / 30
    return months === 1 ? '/ شهر مجاني' : `/ ${months} أشهر`
  }
  return `/ ${days} يوم`
}

export function planFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((f): f is string => typeof f === 'string')
}
