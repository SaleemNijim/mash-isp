import fs from 'node:fs'
import path from 'node:path'

const PROJECT_ROOT = path.resolve(__dirname, '../..')
const APP_DIR = path.join(PROJECT_ROOT, 'app')

function isRouteGroup(segment: string): boolean {
  return segment.startsWith('(') && segment.endsWith(')')
}

/** Discovers page routes from app/ (page.tsx only). Route groups are stripped. */
export function discoverPageRoutes(
  rootDir = APP_DIR,
  segments: string[] = [],
): string[] {
  const routes: string[] = []

  if (!fs.existsSync(rootDir)) return routes

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const nextSegments = isRouteGroup(entry.name) ? segments : [...segments, entry.name]

    if (entry.isDirectory()) {
      routes.push(...discoverPageRoutes(path.join(rootDir, entry.name), nextSegments))
      continue
    }

    if (entry.name === 'page.tsx' || entry.name === 'page.ts') {
      const route = '/' + segments.filter(Boolean).join('/')
      routes.push(route === '/' ? '/' : route)
    }
  }

  return [...new Set(routes)].sort()
}

/** Discovers API / route handler paths from app/ (route.ts only). */
export function discoverRouteHandlers(
  rootDir = APP_DIR,
  segments: string[] = [],
): string[] {
  const routes: string[] = []

  if (!fs.existsSync(rootDir)) return routes

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const nextSegments = isRouteGroup(entry.name) ? segments : [...segments, entry.name]

    if (entry.isDirectory()) {
      routes.push(...discoverRouteHandlers(path.join(rootDir, entry.name), nextSegments))
      continue
    }

    if (entry.name === 'route.ts' || entry.name === 'route.tsx') {
      const route = '/' + segments.filter(Boolean).join('/')
      routes.push(route)
    }
  }

  return [...new Set(routes)].sort()
}

/** All resolvable app paths: pages + route handlers. */
export function discoverAppRoutes(): string[] {
  return [...new Set([...discoverPageRoutes(), ...discoverRouteHandlers()])].sort()
}

/** Paths excluded from proxy auth (proxy.ts matcher). */
export const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/register',
  '/verify-email',
  '/subscription-expired',
  '/suspended',
  '/features',
  '/pricing',
  '/contact',
] as const

export function isPublicRoute(href: string): boolean {
  const base = href.split('?')[0].split('#')[0]
  if ((PUBLIC_ROUTES as readonly string[]).includes(base)) return true
  return base.startsWith('/auth/')
}

export function stripQueryAndHash(href: string): string {
  return href.split('?')[0].split('#')[0]
}

const HREF_PATTERNS = [
  /href=["'](\/[^"'#]+)["']/g,
  /href=\{["'](\/[^"'#]+)["']\}/g,
  /router\.push\(["'](\/[^"'#]+)["']\)/g,
  /redirect\(.*?new URL\(["'](\/[^"'#?]+)/g,
  // template literals كـ `${origin}/register${q}` — التوقف أيضاً عند `$`
  // لتجنّب التقاط بداية متغير JS لاحق (${q}) كجزء من المسار الحرفي.
  /redirect\(`\$\{origin\}(\/[^`?#$]+)/g,
]

/** Scans app/ and components/ for internal href="/..." links. */
export function discoverInternalLinks(dirs = ['app', 'components']): string[] {
  const links = new Set<string>()

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') continue
        walk(full)
        continue
      }

      if (!/\.(tsx?|jsx?)$/.test(entry.name)) continue

      const content = fs.readFileSync(full, 'utf8')
      for (const pattern of HREF_PATTERNS) {
        pattern.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = pattern.exec(content)) !== null) {
          const href = match[1]
          if (!href.startsWith('http')) links.add(href)
        }
      }
    }
  }

  for (const dir of dirs) {
    walk(path.join(PROJECT_ROOT, dir))
  }

  return [...links].sort()
}

export function grepProject(
  pattern: RegExp,
  dirs = ['app', 'components', 'lib', 'hooks', 'proxy.ts'],
): { file: string; line: number; text: string }[] {
  const hits: { file: string; line: number; text: string }[] = []

  function scanFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split('\n')
    lines.forEach((text, i) => {
      if (pattern.test(text)) {
        hits.push({
          file: path.relative(PROJECT_ROOT, filePath),
          line: i + 1,
          text: text.trim(),
        })
      }
      pattern.lastIndex = 0
    })
  }

  function walk(target: string) {
    const full = path.isAbsolute(target) ? target : path.join(PROJECT_ROOT, target)
    if (!fs.existsSync(full)) return

    const stat = fs.statSync(full)
    if (stat.isFile()) {
      scanFile(full)
      return
    }

    for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue
      walk(path.join(full, entry.name))
    }
  }

  for (const dir of dirs) walk(dir)
  return hits
}

export { PROJECT_ROOT, APP_DIR }
