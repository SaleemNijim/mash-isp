import { describe, expect, it } from 'vitest'
import { calcCardDiscount } from '@/lib/card-pricing'

describe('calcCardDiscount', () => {
  it('monthly 65 sold at 60 → 5 EGP (~7.69%)', () => {
    const result = calcCardDiscount(65, 60, 1)
    expect(result.discountAmount).toBe(5)
    expect(result.discountPercent).toBe(7.69)
    expect(result.lineTotal).toBe(60)
  })

  it('no discount when unit equals list', () => {
    const result = calcCardDiscount(65, 65, 3)
    expect(result.discountAmount).toBe(0)
    expect(result.discountPercent).toBe(0)
    expect(result.lineTotal).toBe(195)
  })
})
