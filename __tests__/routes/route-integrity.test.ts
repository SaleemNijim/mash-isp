import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DASHBOARD_NAV } from '@/lib/navigation'
import {
  APP_DIR,
  PROJECT_ROOT,
  discoverAppRoutes,
  discoverInternalLinks,
  discoverPageRoutes,
  grepProject,
  isPublicRoute,
  stripQueryAndHash,
} from '../helpers/routes'

const STATIC_ROUTE_MANIFEST = discoverPageRoutes()
const ALL_APP_ROUTES = discoverAppRoutes()

describe('STATIC_ROUTE_MANIFEST', () => {
  it('discovers every app/**/page.tsx route from the filesystem', () => {
    expect(STATIC_ROUTE_MANIFEST.length).toBeGreaterThan(0)

    function collectPageFiles(dir: string): string[] {
      const files: string[] = []
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          files.push(...collectPageFiles(full))
        } else if (entry.name === 'page.tsx' || entry.name === 'page.ts') {
          files.push(full)
        }
      }
      return files
    }

    const pageFiles = collectPageFiles(APP_DIR)
    expect(STATIC_ROUTE_MANIFEST).toHaveLength(pageFiles.length)
  })

  it('includes known dashboard and public routes', () => {
    for (const route of [
      '/',
      '/login',
      '/register',
      '/dashboard',
      '/subscriptions',
      '/card-batches',
      '/super-admin/tenants',
      '/super-admin/plans',
      '/super-admin/invoices',
      '/suspended',
      '/subscription-expired',
    ]) {
      expect(STATIC_ROUTE_MANIFEST, `missing ${route}`).toContain(route)
    }
  })
})

describe('NAV_LINKS_TEST', () => {
  const availableNav = DASHBOARD_NAV.filter((item) => item.available)

  it('every available nav item href exists in STATIC_ROUTE_MANIFEST', () => {
    for (const { href, label } of availableNav) {
      expect(STATIC_ROUTE_MANIFEST, `${label} → ${href}`).toContain(href)
    }
  })

  it('forbids phantom /dashboard/* paths (except /dashboard home)', () => {
    const phantomHits = grepProject(/['"`]\/dashboard\/[^'"`]+['"`]/).filter(
      (hit) => !hit.file.startsWith('components\\dashboard\\') && !hit.file.startsWith('components/dashboard/'),
    )

    expect(
      phantomHits,
      `Found invalid /dashboard/* links:\n${phantomHits.map((h) => `${h.file}:${h.line}`).join('\n')}`,
    ).toHaveLength(0)
  })

  it('nav available links do not use /dashboard/ prefix (except home)', () => {
    for (const { href, label } of availableNav) {
      if (href === '/dashboard') continue
      expect(href, `${label} should not be under /dashboard/`).not.toMatch(/^\/dashboard\//)
    }
  })
})

describe('INTERNAL_LINKS_TEST', () => {
  const internalLinks = discoverInternalLinks()

  it('every internal href resolves to manifest, public route, or query-only register', () => {
    const violations: string[] = []

    for (const href of internalLinks) {
      const base = stripQueryAndHash(href)

      if (isPublicRoute(base)) continue
      if (STATIC_ROUTE_MANIFEST.includes(base)) continue

      // query-only patterns like /register?error=setup_incomplete
      if (href.includes('?') && isPublicRoute(base)) continue

      violations.push(href)
    }

    expect(
      violations,
      `Broken internal links:\n${violations.join('\n')}`,
    ).toHaveLength(0)
  })
})

describe('PROXY_REDIRECT_TARGETS_TEST', () => {
  const proxySource = fs.readFileSync(path.join(PROJECT_ROOT, 'proxy.ts'), 'utf8')

  const redirectTargets = [
    '/login',
    '/register',
    '/suspended',
    '/subscription-expired',
    '/super-admin/tenants',
    '/dashboard',
  ]

  it('proxy.ts references all expected redirect targets', () => {
    for (const target of redirectTargets) {
      expect(proxySource, `proxy.ts missing redirect to ${target}`).toContain(target)
    }
  })

  it('every proxy redirect target has page.tsx or route.ts', () => {
    for (const target of redirectTargets) {
      expect(ALL_APP_ROUTES, `${target} has no page/route`).toContain(target)
    }
  })

  it('auth callback route exists for email verification flow', () => {
    expect(ALL_APP_ROUTES).toContain('/auth/callback')
  })
})

describe('FORBIDDEN_PATHS_TEST (regression)', () => {
  it('no /dashboard/subscriptions anywhere in source', () => {
    const hits = grepProject(/\/dashboard\/subscriptions/)
    expect(hits).toHaveLength(0)
  })

  it('no lib/supabase/middleware (old name)', () => {
    const hits = grepProject(/lib\/supabase\/middleware/)
    expect(hits).toHaveLength(0)
    expect(fs.existsSync(path.join(PROJECT_ROOT, 'lib', 'supabase', 'middleware.ts'))).toBe(false)
  })

  it('no middleware.ts in project root', () => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, 'middleware.ts'))).toBe(false)
  })

  it('uses proxy.ts not middleware.ts (Next.js 16)', () => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, 'proxy.ts'))).toBe(true)
    expect(fs.existsSync(path.join(PROJECT_ROOT, 'lib', 'supabase', 'proxy-client.ts'))).toBe(true)
  })
})

describe('OPTIONAL smoke — super-admin pages', () => {
  const superAdminPages = [
    'app/super-admin/tenants/page.tsx',
    'app/super-admin/plans/page.tsx',
    'app/super-admin/invoices/page.tsx',
  ]

  it('all three super-admin pages exist and are not TODO stubs', () => {
    for (const rel of superAdminPages) {
      const full = path.join(PROJECT_ROOT, rel)
      expect(fs.existsSync(full), `${rel} missing`).toBe(true)

      const content = fs.readFileSync(full, 'utf8')
      expect(content).not.toMatch(/\/\/\s*TODO/i)
      expect(content.length).toBeGreaterThan(500)
    }
  })
})
