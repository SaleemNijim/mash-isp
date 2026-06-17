import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROJECT_ROOT } from '../helpers/routes'

/**
 * Mirrors subscription_plans.discount_percent GENERATED column (§2.4 / §8.2 PR1).
 */
function calcDiscountPercent(
  priceMonthly: number | null,
  priceAnnual: number | null,
): number | null {
  if (priceMonthly == null || priceAnnual == null || priceMonthly <= 0) return null
  return Math.round(((priceMonthly * 12 - priceAnnual) / (priceMonthly * 12)) * 1000) / 10
}

describe('pricing (§8.2)', () => {
  describe('PR1 — discount_percent calculation', () => {
    it('price_monthly=20, price_annual=180 → discount_percent=25.0', () => {
      expect(calcDiscountPercent(20, 180)).toBe(25.0)
    })

    it('returns null when monthly price is zero or missing', () => {
      expect(calcDiscountPercent(0, 180)).toBeNull()
      expect(calcDiscountPercent(null, 180)).toBeNull()
      expect(calcDiscountPercent(20, null)).toBeNull()
    })

    it('recalculates when annual price changes (PR2 logic)', () => {
      expect(calcDiscountPercent(20, 192)).toBe(20.0)
    })
  })

  describe('PR3 — no hard-coded prices in UI components', () => {
    const UI_DIRS = ['components/public', 'components/trial', 'app/(public)']

    function collectTsxFiles(dir: string): string[] {
      const files: string[] = []
      if (!fs.existsSync(dir)) return files

      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) files.push(...collectTsxFiles(full))
        else if (entry.name.endsWith('.tsx')) files.push(full)
      }
      return files
    }

    it('PricingCards and public pages do not embed literal dollar prices', () => {
      const violations: string[] = []
      const priceLiteral = /\$\s*\d+(?:\.\d{1,2})?/

      for (const dir of UI_DIRS) {
        for (const file of collectTsxFiles(path.join(PROJECT_ROOT, dir))) {
          const content = fs.readFileSync(file, 'utf8')
          const lines = content.split('\n')
          lines.forEach((line, i) => {
            if (line.trim().startsWith('//')) return
            if (priceLiteral.test(line) && !line.includes('${price}')) {
              violations.push(`${path.relative(PROJECT_ROOT, file)}:${i + 1}: ${line.trim()}`)
            }
          })
        }
      }

      expect(violations, `Hard-coded prices found:\n${violations.join('\n')}`).toHaveLength(0)
    })
  })

  describe('PR4 — Enterprise coming soon', () => {
    it('PricingCards renders EnterpriseComingSoonCard for is_coming_soon plans', () => {
      const source = fs.readFileSync(
        path.join(PROJECT_ROOT, 'components', 'public', 'PricingCards.tsx'),
        'utf8',
      )
      expect(source).toContain('EnterpriseComingSoonCard')
      expect(source).toContain('is_coming_soon')
    })
  })
})
