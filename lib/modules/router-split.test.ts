import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'fs'
import path from 'path'

// The module router is generated as TWO files, and the split is the only thing
// keeping the public site's JavaScript down.
//
// A lazy `() => import(...)` is not a free edge. Next.js walks it when it decides
// which client components belong to a route, and every client component it finds
// is emitted as an eager <script> in that route's HTML - rendered or not. So while
// PAGE_LOADERS (every module's admin screens) and PUBLIC_PAGE_LOADERS shared one
// file, app/(public)/[slug] carried the admin half of all 30 modules: the Puck
// editor and its 118 client blocks, uk-bookkeeping's ledger UI, the space planner,
// three.js. Measured on deskwell.co.uk in August 2026: 5.5MB of uncompressed
// JavaScript to draw a category listing, of which 2.2MB was admin screens.
//
// tsc and eslint see nothing wrong with any of it. The only symptom is weight.

const ROOT = path.join(__dirname, '..', '..')
const ADMIN_ROUTER = path.join(ROOT, 'lib', 'modules', 'router.ts')
const PUBLIC_ROUTER = path.join(ROOT, 'lib', 'modules', 'router.public.ts')

function collect(dir: string, out: string[] = []): string[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collect(full, out)
    else if (/\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

const importsAdminRouter = (src: string) => /from '@\/lib\/modules\/router'/.test(src)

describe('the generated module router', () => {
  it('is split into an admin half and a public half', () => {
    expect(existsSync(ADMIN_ROUTER)).toBe(true)
    expect(existsSync(PUBLIC_ROUTER)).toBe(true)
  })

  it('keeps the admin page loaders out of the public half', () => {
    const src = readFileSync(PUBLIC_ROUTER, 'utf8')
    // Anchored: PUBLIC_PAGE_LOADERS legitimately contains the same substring.
    expect(src).not.toMatch(/\bconst PAGE_LOADERS\b/)
    expect(src).not.toContain('/app/cactus-admin/')
  })

  it('keeps the module API routes out of the public half', () => {
    const src = readFileSync(PUBLIC_ROUTER, 'utf8')
    expect(src).not.toContain('API_ROUTES')
    // Only the module's own app/public/** tree may be loaded from here.
    const loaded = [...src.matchAll(/import\('(@\/modules\/[^']+)'\)/g)].map((m) => m[1]!)
    // app/public/** is a module's own public tree, app/root/** its bare-slug claim
    // page, lib/** the sitemap and robots contributors. Nothing else belongs here.
    const offenders = loaded.filter((p) => !/^@\/modules\/[^/]+\/(app\/public\/|app\/root\/|lib\/)/.test(p))
    expect(offenders).toEqual([])
  })

  it('does not import the admin half back', () => {
    expect(importsAdminRouter(readFileSync(PUBLIC_ROUTER, 'utf8'))).toBe(false)
  })
})

describe('public render paths', () => {
  // Every core file a public request can reach. app/(public) is the site itself;
  // sitemap and robots share its server graph because they sit in the same app.
  const publicFiles = [
    ...collect(path.join(ROOT, 'app', '(public)')),
    path.join(ROOT, 'app', 'sitemap.ts'),
    path.join(ROOT, 'app', 'robots.ts'),
    path.join(ROOT, 'app', 'not-found.tsx'),
  ].filter((f) => existsSync(f) && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))

  it('finds the public tree (guard is worthless if the glob breaks)', () => {
    expect(publicFiles.length).toBeGreaterThan(5)
  })

  it('never import the admin router', () => {
    const offenders = publicFiles
      .filter((f) => importsAdminRouter(readFileSync(f, 'utf8')))
      .map((f) => path.relative(ROOT, f))
    expect(offenders, 'import from @/lib/modules/router.public instead').toEqual([])
  })

  it('never import the full extension-point map', () => {
    const offenders = publicFiles
      .filter((f) => /from '@\/lib\/modules\/extension-points'/.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(ROOT, f))
    expect(offenders, 'import @/lib/modules/extension-points.public instead').toEqual([])
  })
})
