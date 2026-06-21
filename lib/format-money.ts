export function formatMoney(n: number | null | undefined): string {
  if (n == null) return '—'
  return Number(n).toLocaleString('ar-EG')
}

export function formatPercent(n: number | null | undefined): string {
  if (n == null || n <= 0) return '0%'
  return `${Number(n).toLocaleString('ar-EG')}%`
}
