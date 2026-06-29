import { describe, expect, it } from 'vitest'
import { isDriveRoleAllowed } from '@/lib/google-drive/eligibility'

describe('isDriveRoleAllowed', () => {
  it('يسمح للمسؤول بربط Drive وإدارته', () => {
    expect(isDriveRoleAllowed('admin', 'admin')).toBe(true)
    expect(isDriveRoleAllowed('admin', 'sync')).toBe(true)
  })

  it('يسمح للكاشير بالمزامنة فقط وليس بالربط', () => {
    expect(isDriveRoleAllowed('employee', 'sync')).toBe(true)
    expect(isDriveRoleAllowed('employee', 'admin')).toBe(false)
  })

  it('يرفض super_admin والأدوار غير المعروفة', () => {
    expect(isDriveRoleAllowed('super_admin', 'sync')).toBe(false)
    expect(isDriveRoleAllowed('super_admin', 'admin')).toBe(false)
    expect(isDriveRoleAllowed(null, 'sync')).toBe(false)
  })
})
