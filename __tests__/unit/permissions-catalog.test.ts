import { describe, expect, it } from 'vitest'
import {
  PERMISSION_CODES,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  ROUTE_REQUIRED_PERMISSIONS,
} from '@/lib/permissions'
import { ROUTES } from '@/lib/navigation'

describe('permissions catalog', () => {
  it('كل كود له تسمية عربية', () => {
    for (const code of PERMISSION_CODES) {
      expect(PERMISSION_LABELS[code], `missing label for ${code}`).toBeTruthy()
    }
  })

  it('مصفوفة PERMISSION_GROUPS تغطي كل الأكواد مرة واحدة', () => {
    const grouped = PERMISSION_GROUPS.flatMap((g) => g.codes)
    expect(grouped).toHaveLength(PERMISSION_CODES.length)
    expect(new Set(grouped).size).toBe(PERMISSION_CODES.length)
    for (const code of PERMISSION_CODES) {
      expect(grouped, `missing group for ${code}`).toContain(code)
    }
  })

  it('مسار المصروفات مربوط بـ manage_expenses', () => {
    expect(ROUTE_REQUIRED_PERMISSIONS['/expenses']).toEqual(['manage_expenses'])
    expect(ROUTES.expenses).toBe('/expenses')
  })

  it('مسار الصلاحيات يقبل manage_users أو manage_permissions', () => {
    expect(ROUTE_REQUIRED_PERMISSIONS['/permissions']).toEqual([
      'manage_users',
      'manage_permissions',
    ])
  })
})
