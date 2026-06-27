/** رمز بسيط للعملة — بدون كتابة «ج.م» */
const CURRENCY_SYMBOL = '₪'

export function formatAmount(n: number | null | undefined): string {
  if (n == null) return '—'
  const num = Number(n)
  const safe = Number.isFinite(num) ? num : 0
  return `${safe.toLocaleString('ar-EG')} ${CURRENCY_SYMBOL}`
}

export function formatMoney(n: number | null | undefined): string {
  return formatAmount(n)
}

export function formatPercent(n: number | null | undefined): string {
  if (n == null || n <= 0) return '0%'
  return `${Number(n).toLocaleString('ar-EG')}%`
}
