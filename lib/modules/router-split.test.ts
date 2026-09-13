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
const PUBLIC_HEAD = path.join(ROOT, 'lib', 'modules', 'public-head.ts')
const PUBLIC_SLUG_ROUTER = path.join(ROOT, 'lib', 'modules', 'router.public-slug.ts')

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

  // public-head.ts is what the public LAYOUT reads, so it has to stay as light as
  // a layout's graph must: head contributors only, no page, no route, no router.
  it('keeps the layout-facing head collector free of pages and routers', () => {
    expect(existsSync(PUBLIC_HEAD)).toBe(true)
    const src = readFileSync(PUBLIC_HEAD, 'utf8')
    const loaded = [...src.matchAll(/import\('([^']+)'\)/g)].map((m) => m[1]!)
    expect(loaded.filter((p) => !/^@\/modules\/[^/]+\/lib\/head$/.test(p))).toEqual([])
    expect(src).not.toMatch(/from '@\/lib\/modules\/router(\.public)?'/)
  })

  // router.public-slug.ts is what the single-segment page route reads - every
  // product page and filter landing page. A loader in it for anything deeper than
  // a module's base page puts that page's client code on all of them.
  it('keeps the single-segment router to index pages and bare-slug claims', () => {
    expect(existsSync(PUBLIC_SLUG_ROUTER)).toBe(true)
    const src = readFileSync(PUBLIC_SLUG_ROUTER, 'utf8')
    const loaded = [...src.matchAll(/import\('([^']+)'\)/g)].map((m) => m[1]!)
    const allowed = (p: string) =>
      // A module's index page: app/public/<base>/page, one folder deep and no deeper.
      /^@\/modules\/[^/]+\/app\/public\/[^/]+\/page$/.test(p) ||
      /^@\/modules\/[^/]+\/app\/root\/\[slug\]\/page$/.test(p) ||
      /^@\/modules\/[^/]+\/lib\/root-slug$/.test(p)
    expect(loaded.filter((p) => !allowed(p))).toEqual([])
    expect(src).not.toMatch(/from '@\/lib\/modules\/router(\.public)?'/)
  })
})

describe('public render paths', () => {
  // Every core file a public request can RENDER through. app/(public) is the
  // site itself; sitemap and robots share its server graph because they sit in
  // the same app.
  //
  // The agent-content routes (app/llms.txt, app/llms-full.txt,
  // app/api/agent-content/**) are deliberately NOT here. They read the full
  // extension-point map on purpose: their providers query the whole catalogue
  // and are registered serverOnly, so the public map does not carry them. A
  // route handler has its own function bundle and renders no React, so nothing
  // it imports can reach a page - which is the only thing this guard is about.
  const publicFiles = [
    ...collect(path.join(ROOT, 'app', '(public)')),
    path.join(ROOT, 'app', 'sitemap.ts'),
    path.join(ROOT, 'app', 'robots.txt', 'route.ts'),
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

  // The same mechanism one level up. A LAYOUT's client components ship on every
  // page beneath it, and router.public.ts holds a loader for every module's public
  // page - so a layout importing it, even for one helper, carries the space
  // planner, three.js and the checkout and cart pages to the home page and the
  // login page. It happened: app/(public)/layout.tsx imported the head collector
  // from there from August to September 2026. Pages under [slug] need the router;
  // layouts never do.
  it('never import the public router from a layout', () => {
    const offenders = publicFiles
      .filter((f) => path.basename(f).startsWith('layout.'))
      .filter((f) => /from '@\/lib\/modules\/router\.public'/.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(ROOT, f))
    expect(offenders, 'import collectModulePublicHead from @/lib/modules/public-head instead').toEqual([])
  })

  // One level down from the layout rule above: the single-segment page route
  // serves every product page and filter landing page, and only ever needs a
  // module's index page or a bare-slug claim.
  it('never import the full public router from the single-segment page', () => {
    const slugPage = path.join(ROOT, 'app', '(public)', '[slug]', 'page.tsx')
    expect(existsSync(slugPage)).toBe(true)
    expect(readFileSync(slugPage, 'utf8'), 'import from @/lib/modules/router.public-slug instead').not.toMatch(
      /from '@\/lib\/modules\/router\.public'/,
    )
  })

  it('never import the full extension-point map', () => {
    const offenders = publicFiles
      .filter((f) => /from '@\/lib\/modules\/extension-points'/.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(ROOT, f))
    expect(offenders, 'import @/lib/modules/extension-points.public instead').toEqual([])
  })
})
