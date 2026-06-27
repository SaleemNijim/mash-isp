export interface DistributorLineBreakdown {
  paidQuantity: number
  bonusQuantity: number
  stockQuantity: number
  lineAmount: number
}

/** يطابق منطق sell_cards في قاعدة البيانات */
export function calcDistributorLineBreakdown(
  lineAmount: number,
  unitPrice: number,
  commissionPercent: number,
): DistributorLineBreakdown | null {
  if (!Number.isFinite(lineAmount) || lineAmount <= 0) return null
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return null

  const paidQuantity = Math.floor(lineAmount / unitPrice)
  if (paidQuantity <= 0) return null

  const bonusQuantity = Math.floor((paidQuantity * commissionPercent) / 100)

  return {
    paidQuantity,
    bonusQuantity,
    stockQuantity: paidQuantity + bonusQuantity,
    lineAmount,
  }
}
