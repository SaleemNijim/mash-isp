import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROJECT_ROOT } from '../helpers/routes'

describe('known-issues regression suite', () => {
  it('① proxy.ts uses getUser() for the first auth check, not getSession()', () => {
    const source = fs.readFileSync(path.join(PROJECT_ROOT, 'proxy.ts'), 'utf8')

    const firstAuthBlock = source.slice(0, source.indexOf('if (!user)'))
    expect(firstAuthBlock).toContain('getUser()')
    expect(firstAuthBlock).not.toContain('getSession()')

    expect(source).toContain('getSession()')
    const forceLogoutSection = source.slice(source.indexOf('force_logout_at'))
    expect(forceLogoutSection).toContain('getSession()')
  })

  it('② register/page.tsx: session → complete setup; no session → verify-email', () => {
    const source = fs.readFileSync(
      path.join(PROJECT_ROOT, 'app', '(auth)', 'register', 'page.tsx'),
      'utf8',
    )

    expect(source).toContain('if (data.session && data.user)')
    expect(source).toContain('fetchOrCompleteUserProfile')
    expect(source).toContain('resolvePostLoginPath')
    expect(source).toContain("router.push('/verify-email')")

    const sessionBlock = source.slice(
      source.indexOf('if (data.session && data.user)'),
      source.indexOf("router.push('/verify-email')"),
    )
    expect(sessionBlock).toContain('fetchOrCompleteUserProfile')
    expect(sessionBlock).not.toContain("router.push('/verify-email')")
  })

  it('③ auth/callback/route.ts exists and completes user setup before redirect', () => {
    const callbackPath = path.join(PROJECT_ROOT, 'app', 'auth', 'callback', 'route.ts')
    expect(fs.existsSync(callbackPath)).toBe(true)

    const source = fs.readFileSync(callbackPath, 'utf8')
    expect(source).toContain('exchangeCodeForSession')
    expect(source).toContain('fetchOrCompleteUserProfile')
    expect(source).toContain('resolvePostLoginPath')
  })

  it('③b create_tenant_with_trial is called from the shared setup helper', () => {
    const setupPath = path.join(
      PROJECT_ROOT, 'lib', 'auth', 'complete-user-setup.ts',
    )
    expect(fs.existsSync(setupPath)).toBe(true)
    const source = fs.readFileSync(setupPath, 'utf8')
    expect(source).toContain("supabase.rpc('create_tenant_with_trial'")
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
