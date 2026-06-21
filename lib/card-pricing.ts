export interface CardDiscountPreview {
  listPrice: number
  unitPrice: number
  discountAmount: number
  discountPercent: number
  lineTotal: number
}

/** حساب عرض فقط — التخزين عبر Generated Column في DB */
export function calcCardDiscount(
  listPrice: number,
  unitPrice: number,
  quantity = 1,
): CardDiscountPreview {
  const list = Number.isFinite(listPrice) ? listPrice : 0
  const unit = Number.isFinite(unitPrice) ? unitPrice : 0
  const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 1

  let discountAmount = 0
  let discountPercent = 0

  if (list > 0 && unit < list) {
    discountAmount = list - unit
    discountPercent = Math.round((discountAmount / list) * 10000) / 100
  }

  return {
    listPrice: list,
    unitPrice: unit,
    discountAmount,
    discountPercent,
    lineTotal: unit * qty,
  }
}
