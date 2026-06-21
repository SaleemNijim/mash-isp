'use client'

import { useMemo } from 'react'
import { calcCardDiscount } from '@/lib/card-pricing'
import { formatMoney, formatPercent } from '@/lib/format-money'

interface CardPriceBreakdownProps {
  listPrice: number | null | undefined
  unitPrice: string
  quantity?: string | number
  compact?: boolean
}

export function CardPriceBreakdown({
  listPrice,
  unitPrice,
  quantity = 1,
  compact = false,
}: CardPriceBreakdownProps) {
  const preview = useMemo(() => {
    const list = listPrice ?? Number(unitPrice) ?? 0
    const unit = Number(unitPrice)
    const qty = Number(quantity)
    if (!Number.isFinite(unit)) {
      return calcCardDiscount(list, list, 1)
    }
    return calcCardDiscount(list, unit, Number.isFinite(qty) && qty > 0 ? qty : 1)
  }, [listPrice, unitPrice, quantity])

  if (compact) {
    return (
      <p className="text-xs text-muted-foreground tabular-nums">
        {preview.discountPercent > 0 ? (
          <>
            خصم {formatMoney(preview.discountAmount)} ({formatPercent(preview.discountPercent)})
            {' · '}
          </>
        ) : null}
        الإجمالي: <span className="font-semibold text-foreground">{formatMoney(preview.lineTotal)}</span>
      </p>
    )
  }

  return (
    <div className="rounded-md bg-muted/50 px-3 py-2 text-sm space-y-1">
      <div className="flex justify-between gap-2 tabular-nums">
        <span className="text-muted-foreground">السعر المرجعي</span>
        <span>{formatMoney(preview.listPrice)}</span>
      </div>
      {preview.discountPercent > 0 && (
        <div className="flex justify-between gap-2 tabular-nums text-emerald-700">
          <span>خصم</span>
          <span>
            {formatMoney(preview.discountAmount)} ({formatPercent(preview.discountPercent)})
          </span>
        </div>
      )}
      <div className="flex justify-between gap-2 tabular-nums font-semibold border-t border-border/60 pt-1">
        <span>الإجمالي</span>
        <span>{formatMoney(preview.lineTotal)}</span>
      </div>
    </div>
  )
}
