import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROJECT_ROOT } from '../helpers/routes'

describe('known-issues regression suite', () => {
  it('① proxy.ts uses getUser() for the first auth check, not getSession()', () => {
    const source = fs.readFileSync(path.join(PROJECT_ROOT, 'proxy.ts'), 'utf8')

    const getUserIndex = source.indexOf('getUser()')
    const firstAuthBlock = source.slice(0, source.indexOf('// 2.'))

    expect(firstAuthBlock).toContain('getUser()')
    expect(firstAuthBlock).not.toContain('getSession()')

    // getSession is allowed later for force_logout_at comparison only
    expect(getUserIndex).toBeGreaterThan(-1)
    expect(source).toContain('getSession()')
    const forceLogoutSection = source.slice(source.indexOf('force_logout_at'))
    expect(forceLogoutSection).toContain('getSession()')
  })

  it('② register/page.tsx: session → rpc; no session → verify-email', () => {
    const source = fs.readFileSync(
      path.join(PROJECT_ROOT, 'app', '(auth)', 'register', 'page.tsx'),
      'utf8',
    )

    expect(source).toContain('if (data.session)')
    expect(source).toContain("supabase.rpc('create_tenant_with_trial'")
    expect(source).toContain("router.push('/verify-email')")
    expect(source).toContain("router.push('/dashboard')")

    const sessionBlock = source.slice(
      source.indexOf('if (data.session)'),
      source.indexOf("router.push('/verify-email')"),
    )
    expect(sessionBlock).toContain('create_tenant_with_trial')
    expect(sessionBlock).not.toContain("router.push('/verify-email')")
  })

  it('③ auth/callback/route.ts exists and calls create_tenant_with_trial', () => {
    const callbackPath = path.join(PROJECT_ROOT, 'app', 'auth', 'callback', 'route.ts')
    expect(fs.existsSync(callbackPath)).toBe(true)

    const source = fs.readFileSync(callbackPath, 'utf8')
    expect(source).toContain('exchangeCodeForSession')
    expect(source).toContain("supabase.rpc('create_tenant_with_trial'")
    expect(source).toContain('/dashboard')
  })

  it('④ usePermissions.subscribe removes old channel before creating new one', () => {
    const source = fs.readFileSync(
      path.join(PROJECT_ROOT, 'hooks', 'usePermissions.ts'),
      'utf8',
    )

    expect(source).toContain('removeChannel')
    expect(source).toContain('activeUnsubscribe')
    expect(source).toMatch(/if \(activeUnsubscribe\)/)
    expect(source).toMatch(/activeUnsubscribe\(\)/)
  })

  it('⑤ migration 007_admin_user_rls.sql exists in supabase/migrations/', () => {
    const migrationPath = path.join(
      PROJECT_ROOT,
      'supabase',
      'migrations',
      '007_admin_user_rls.sql',
    )
    expect(fs.existsSync(migrationPath)).toBe(true)
    const content = fs.readFileSync(migrationPath, 'utf8')
    expect(content.length).toBeGreaterThan(50)
  })

  it('⑥ ExcelImportEngine imports from exceljs, not xlsx', () => {
    const source = fs.readFileSync(
      path.join(PROJECT_ROOT, 'components', 'excel', 'ExcelImportEngine.ts'),
      'utf8',
    )

    expect(source).toMatch(/import\s+ExcelJS\s+from\s+['"]exceljs['"]/)
    expect(source).not.toMatch(/from\s+['"]xlsx['"]/)
    expect(source).toContain('exceljs')
  })
})
