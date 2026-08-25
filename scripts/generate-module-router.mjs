#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getModuleNames as registeredModuleNames } from './lib/module-names.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const modulesDir = join(rootDir, 'modules')
const routerPath = join(rootDir, 'lib', 'modules', 'router.ts')
const publicRouterPath = join(rootDir, 'lib', 'modules', 'router.public.ts')

function scanDir(dir, suffix) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true })
    .map(f => String(f).replace(/\\/g, '/'))
    .filter(f => f.endsWith(suffix))
    .sort()
}

// Registry-filtered: see scripts/lib/module-names.mjs for why a bare directory
// listing is not good enough here.
function getModuleNames() {
  return registeredModuleNames(rootDir)
}

function readManifest(moduleName) {
  const manifestPath = join(modulesDir, moduleName, 'cactus.module.json')
  if (!existsSync(manifestPath)) return null
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    console.warn(`[generate-module-router] Could not parse ${manifestPath} — skipping`)
    return null
  }
}

// Orders route patterns literal-first so first-match dispatch is deterministic:
// at the first segment where two same-length patterns differ, a literal segment
// beats a dynamic [param] one (Next.js precedence, static > dynamic). Without
// this, an alphabetical file sort puts `[id]` (which starts with '[', 0x5B)
// ahead of a sibling literal like `reorder`, and because matchPattern treats
// `[id]` as a wildcard the literal route is never reached - the request lands on
// `categories/[id]` with id="reorder" instead of `categories/reorder`.
function isDynamicSegment(seg) {
  return seg.startsWith('[') && seg.endsWith(']')
}
function comparePatternSegments(a, b) {
  const min = Math.min(a.length, b.length)
  for (let i = 0; i < min; i++) {
    const aDynamic = isDynamicSegment(a[i])
    const bDynamic = isDynamicSegment(b[i])
    if (aDynamic !== bDynamic) return aDynamic ? 1 : -1 // literal segment first
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1
  }
  return a.length - b.length
}
// Sorts `{ pattern: string[], ... }` route entries literal-first.
function sortRoutesBySpecificity(routes) {
  return [...routes].sort((x, y) => comparePatternSegments(x.pattern, y.pattern))
}
// Sorts slash-joined pattern keys literal-first (splits into segments first).
function sortPatternKeys(keys) {
  return [...keys].sort((a, b) =>
    comparePatternSegments(a ? a.split('/') : [], b ? b.split('/') : [])
  )
}

const moduleNames = getModuleNames()

if (moduleNames.length === 0) {
  console.log('[generate-module-router] No modules found — writing empty router.')
}

// Everything the router reaches for is emitted as a lazy `() => import(...)` loader,
// never a top-level `import * as`, so each handler sits in its own async chunk resolved
// only when a request matches its pattern.
//
// Lazy is necessary but not sufficient: a `() => import(...)` is still an edge the
// bundler follows when it decides what belongs to a route. That is why the tables are
// emitted into TWO files below - router.ts (admin + module API) and router.public.ts
// (the public site) - rather than one. While they shared a file, app/(public)/[slug]
// reached PAGE_LOADERS and therefore every admin screen's client components.
const pageLoaders = {}  // moduleName → { key → importPath }
const apiRoutes = {}    // moduleName → [{ pattern, importPath }]

const publicBases = new Map() // base → moduleName
const publicPageLoaders = {}  // base → { key → importPath }
const publicRoutes = {}       // base → [{ pattern, importPath }]
const rootSlugClaims = []     // [{ moduleName, pageImport, claimImport, claimExport }]
const sitemapModules = []     // [{ moduleName, importPath }]
const robotsModules = []      // [{ moduleName, importPath }]

for (const moduleName of moduleNames) {
  // PAGE_LOADERS — scan modules/[name]/app/cactus-admin/[name]/**/page.tsx
  const adminDir = join(rootDir, 'modules', moduleName, 'app', 'cactus-admin', moduleName)
  const pageFiles = scanDir(adminDir, 'page.tsx')

  if (pageFiles.length > 0) {
    pageLoaders[moduleName] = {}
    for (const rel of pageFiles) {
      const key = rel.replace(/\/?page\.tsx$/, '')
      const importPath = `@/modules/${moduleName}/app/cactus-admin/${moduleName}/${rel.replace(/\.tsx$/, '')}`
      pageLoaders[moduleName][key] = importPath
    }
  }

  // API_ROUTES — scan modules/[name]/app/api/**/route.ts
  const apiDir = join(rootDir, 'modules', moduleName, 'app', 'api')
  const routeFiles = scanDir(apiDir, 'route.ts')

  if (routeFiles.length > 0) {
    apiRoutes[moduleName] = []
    for (const rel of routeFiles) {
      // Strip optional leading slash + route.ts from end
      const withoutRoute = rel.replace(/(?:\/)?route\.ts$/, '')
      const rawSegments = withoutRoute ? withoutRoute.split('/') : []
      // Strip only the module-name wrapper segment (app/api/admin/<moduleName>/...).
      // Filtering every occurrence would also eat a legitimate resource segment that
      // happens to share the module's own name, e.g. the Board-entity endpoints
      // nested at admin/boards/boards/... for the "boards" module.
      const nameIdx = rawSegments.indexOf(moduleName)
      const pattern = nameIdx === -1 ? rawSegments : [...rawSegments.slice(0, nameIdx), ...rawSegments.slice(nameIdx + 1)]
      const importPath = `@/modules/${moduleName}/app/api/${rel.replace(/\.ts$/, '')}`
      apiRoutes[moduleName].push({ pattern, importPath })
    }
  }

  const manifest = readManifest(moduleName)

  // Bare top-level slug claims — independent of publicBasePath, so collect them
  // before the `continue` below drops modules with no public base of their own.
  const rootSlug = manifest?.publicRootSlug
  if (rootSlug?.page && rootSlug?.claimImport && rootSlug?.claimExport) {
    const toAlias = (p) => p.replace(/^\.\//, `@/modules/${moduleName}/`).replace(/\.tsx?$/, '')
    rootSlugClaims.push({
      moduleName,
      pageImport: toAlias(rootSlug.page),
      claimImport: toAlias(rootSlug.claimImport),
      claimExport: rootSlug.claimExport,
    })
  }

  // Sitemap and robots contributions — deliberately BEFORE the publicBasePath
  // check below. What a module puts in /sitemap.xml or /robots.txt has nothing
  // to do with whether it serves public pages under a prefix of its own:
  // ultimate-seo's admin-managed entries and shop-variations' per-combination
  // product URLs are both about other modules' pages. Scanned from behind that
  // `continue`, neither was ever collected, and both screens looked like they
  // worked while changing nothing at all.
  const sitemapPath = join(rootDir, 'modules', moduleName, 'lib', 'sitemap.ts')
  if (existsSync(sitemapPath)) {
    sitemapModules.push({ moduleName, importPath: `@/modules/${moduleName}/lib/sitemap` })
  }

  const robotsPath = join(rootDir, 'modules', moduleName, 'lib', 'robots.ts')
  if (existsSync(robotsPath)) {
    robotsModules.push({ moduleName, importPath: `@/modules/${moduleName}/lib/robots` })
  }

  // Public routes — only for modules that declare a publicBasePath.
  const base = manifest?.publicBasePath
  if (!base) continue

  if (publicBases.has(base)) {
    console.error(
      `[generate-module-router] publicBasePath "${base}" is declared by both "${publicBases.get(base)}" and "${moduleName}". Each publicBasePath must be unique.`
    )
    process.exit(1)
  }
  publicBases.set(base, moduleName)

  const publicDir = join(rootDir, 'modules', moduleName, 'app', 'public', base)

  const publicPageFiles = scanDir(publicDir, 'page.tsx')
  if (publicPageFiles.length > 0) {
    publicPageLoaders[base] = {}
    for (const rel of publicPageFiles) {
      const key = rel.replace(/\/?page\.tsx$/, '')
      const importPath = `@/modules/${moduleName}/app/public/${base}/${rel.replace(/\.tsx$/, '')}`
      publicPageLoaders[base][key] = importPath
    }
  }

  const publicRouteFiles = scanDir(publicDir, 'route.ts')
  if (publicRouteFiles.length > 0) {
    publicRoutes[base] = []
    for (const rel of publicRouteFiles) {
      const withoutRoute = rel.replace(/(?:\/)?route\.ts$/, '')
      const pattern = withoutRoute ? withoutRoute.split('/') : []
      const importPath = `@/modules/${moduleName}/app/public/${base}/${rel.replace(/\.ts$/, '')}`
      publicRoutes[base].push({ pattern, importPath })
    }
  }

}

// ---------------------------------------------------------------------------
// Two files, not one. Both halves used to live in lib/modules/router.ts, which
// the public page route statically imports - and a lazy `() => import(...)` is
// still an edge the bundler follows, so every admin screen behind PAGE_LOADERS
// (and everything it pulls: the Puck editor, its 118 client blocks, three.js,
// uk-bookkeeping's ledger UI) was landing in the browser bundle of every public
// page. 5.5MB of JavaScript to draw a category listing. Splitting the tables so
// the public route can only reach public loaders is the whole fix; keep it that
// way. Nothing under app/(public), app/sitemap.ts or app/robots.ts may import
// lib/modules/router.ts, and lib/modules/router.public.ts may never import it
// back - guarded by lib/modules/router-split.test.ts.
// ---------------------------------------------------------------------------

const MATCH_PATTERN = [
  `function matchPattern(pattern: string[], actual: string[]): Record<string, string> | null {`,
  `  if (pattern.length !== actual.length) return null`,
  `  const params: Record<string, string> = {}`,
  `  for (let i = 0; i < pattern.length; i++) {`,
  `    const seg = pattern[i]!`,
  `    if (seg.startsWith('[') && seg.endsWith(']')) {`,
  `      params[seg.slice(1, -1)] = actual[i]!`,
  `    } else if (seg !== actual[i]) {`,
  `      return null`,
  `    }`,
  `  }`,
  `  return params`,
  `}`,
]

const SHARED_TYPES = [
  `// eslint-disable-next-line @typescript-eslint/no-explicit-any`,
  `type ApiHandlerModule = Record<string, ((...args: any[]) => Promise<Response>) | undefined>`,
  `type ApiRouteLoader = () => Promise<ApiHandlerModule>`,
  `type PageModule = () => Promise<{ default: React.ComponentType<any>; generateMetadata?: (...args: any[]) => any }>`,
]

function banner(target) {
  return [
    `// AUTO-GENERATED by scripts/generate-module-router.mjs`,
    `// DO NOT EDIT BY HAND. Rewritten on every build and dev start.`,
    ``,
    ...target,
    ``,
  ]
}

// ---------------------------------------------------------------------------
// lib/modules/router.ts — admin pages and the module API. Reached only from
// app/cactus-admin/** and app/api/m/**, never from a public route.
// ---------------------------------------------------------------------------
const admin = banner([
  `// Admin screens and module API handlers. Imported by app/cactus-admin/m/[module]`,
  `// and app/api/m/[module] only.`,
  `//`,
  `// Loaders stay lazy: a top-level import here would put every module's API route`,
  `// and admin screen into the one function bundle. Do not "simplify" them back into`,
  `// eager imports.`,
  `//`,
  `// The PUBLIC half lives in router.public.ts. Do not move public loaders back in`,
  `// here, and do not import this file from anything under app/(public) - the public`,
  `// route would then reach every admin screen's client components again.`,
])

admin.push(...SHARED_TYPES)
admin.push(``)

admin.push(`const API_ROUTES: Record<string, Array<{ pattern: string[]; load: ApiRouteLoader }>> = {`)
for (const [mod, routes] of Object.entries(apiRoutes)) {
  admin.push(`  '${mod}': [`)
  for (const { pattern, importPath } of sortRoutesBySpecificity(routes)) {
    admin.push(`    { pattern: ${JSON.stringify(pattern)}, load: () => import('${importPath}') },`)
  }
  admin.push(`  ],`)
}
admin.push(`}`)
admin.push(``)

admin.push(`const PAGE_LOADERS: Record<string, Record<string, PageModule>> = {`)
for (const [mod, loaders] of Object.entries(pageLoaders)) {
  admin.push(`  '${mod}': {`)
  for (const key of sortPatternKeys(Object.keys(loaders))) {
    admin.push(`    '${key}': () => import('${loaders[key]}'),`)
  }
  admin.push(`  },`)
}
admin.push(`}`)
admin.push(``)
admin.push(...MATCH_PATTERN)
admin.push(``)
admin.push(`export async function dispatchModuleApi(`)
admin.push(`  method: string,`)
admin.push(`  req: Request,`)
admin.push(`  ctx: { params: Promise<{ module: string; path: string[] }> }`)
admin.push(`): Promise<Response> {`)
admin.push(`  const { module, path } = await ctx.params`)
admin.push(`  const routes = API_ROUTES[module]`)
admin.push(`  if (!routes) return new Response('Module not found', { status: 404 })`)
admin.push(``)
admin.push(`  for (const route of routes) {`)
admin.push(`    const extracted = matchPattern(route.pattern, path)`)
admin.push(`    if (extracted !== null) {`)
admin.push(`      const handler = await route.load()`)
admin.push(`      const fn = handler[method]`)
admin.push(`      if (!fn) return new Response('Method not allowed', { status: 405 })`)
admin.push(`      return fn(req, { params: Promise.resolve(extracted) })`)
admin.push(`    }`)
admin.push(`  }`)
admin.push(`  return new Response('Not found', { status: 404 })`)
admin.push(`}`)
admin.push(``)
admin.push(`export async function resolveModulePage(`)
admin.push(`  module: string,`)
admin.push(`  path: string[]`)
admin.push(`): Promise<{ Component: React.ComponentType<any>; mappedParams: Record<string, string> } | null> {`)
admin.push(`  const loaders = PAGE_LOADERS[module]`)
admin.push(`  if (!loaders) return null`)
admin.push(``)
admin.push(`  for (const [patternStr, loader] of Object.entries(loaders)) {`)
admin.push(`    const pattern = patternStr ? patternStr.split('/') : []`)
admin.push(`    const extracted = matchPattern(pattern, path)`)
admin.push(`    if (extracted !== null) {`)
admin.push(`      const mod = await loader()`)
admin.push(`      return { Component: mod.default, mappedParams: extracted }`)
admin.push(`    }`)
admin.push(`  }`)
admin.push(`  return null`)
admin.push(`}`)
admin.push(``)
// The build fact that lib/modules/live-status.ts deliberately does not answer: which
// modules' code is actually present in THIS build (i.e. cloned per modules.json).
// Needed by anything that reads routes or nav entries straight off a stored manifest,
// where there is no generated registry lookup to drop a module that isn't here yet.
// It lives on the admin side because the admin sidebar is its only reader, and it is
// a plain Set - no loaders, so no bundle weight either way.
admin.push(`// Modules whose code is present in this build, from the clone step.`)
admin.push(`export const MODULES_IN_BUILD: ReadonlySet<string> = new Set(${JSON.stringify(moduleNames)})`)

// ---------------------------------------------------------------------------
// lib/modules/router.public.ts — the public site's half. Everything reachable
// from app/(public), app/sitemap.ts and app/robots.ts, and nothing else.
// ---------------------------------------------------------------------------
const pub = banner([
  `// The public site's module routing. Imported by app/(public)/[slug], its feed`,
  `// routes, app/sitemap.ts and app/robots.ts.`,
  `//`,
  `// This file exists so those routes cannot reach PAGE_LOADERS in router.ts. A lazy`,
  `// \`() => import(...)\` is still an import edge, so when the two lived together the`,
  `// public page route pulled in every module's admin screen - and with them the Puck`,
  `// editor, its client block map and three.js. Keep the halves apart.`,
])

pub.push(...SHARED_TYPES)
pub.push(``)

pub.push(`const PUBLIC_PAGE_LOADERS: Record<string, Record<string, PageModule>> = {`)
for (const [base, loaders] of Object.entries(publicPageLoaders)) {
  pub.push(`  '${base}': {`)
  for (const key of sortPatternKeys(Object.keys(loaders))) {
    pub.push(`    '${key}': () => import('${loaders[key]}'),`)
  }
  pub.push(`  },`)
}
pub.push(`}`)
pub.push(``)

pub.push(`const PUBLIC_ROUTE_HANDLERS: Record<string, Array<{ pattern: string[]; load: ApiRouteLoader }>> = {`)
for (const [base, routes] of Object.entries(publicRoutes)) {
  pub.push(`  '${base}': [`)
  for (const { pattern, importPath } of sortRoutesBySpecificity(routes)) {
    pub.push(`    { pattern: ${JSON.stringify(pattern)}, load: () => import('${importPath}') },`)
  }
  pub.push(`  ],`)
}
pub.push(`}`)
pub.push(``)

pub.push(`const PUBLIC_BASES: string[] = ${JSON.stringify([...publicBases.keys()])}`)
pub.push(``)

pub.push(`// Modules that can claim a bare top-level slug for content of their own. Asked`)
pub.push(`// in registry order, and only once core has ruled out an info page and a module`)
pub.push(`// index at that slug, so core content always wins a collision. Both halves are`)
pub.push(`// lazy for the same reason the loaders above are.`)
pub.push(`type RootSlugClaimModule = Record<string, ((slug: string) => Promise<boolean>) | undefined>`)
pub.push(`const PUBLIC_ROOT_SLUG_CLAIMS: Array<{`)
pub.push(`  module: string`)
pub.push(`  claimExport: string`)
pub.push(`  loadClaim: () => Promise<RootSlugClaimModule>`)
pub.push(`  loadPage: PageModule`)
pub.push(`}> = [`)
for (const { moduleName, pageImport, claimImport, claimExport } of rootSlugClaims) {
  pub.push(`  { module: '${moduleName}', claimExport: '${claimExport}', loadClaim: () => import('${claimImport}'), loadPage: () => import('${pageImport}') },`)
}
pub.push(`]`)
pub.push(``)
pub.push(...MATCH_PATTERN)
pub.push(``)
pub.push(`export async function resolveModulePublicPage(`)
pub.push(`  base: string,`)
pub.push(`  path: string[]`)
pub.push(`): Promise<{ Component: React.ComponentType<any>; generateMetadata?: (...args: any[]) => any; mappedParams: Record<string, string> } | null> {`)
pub.push(`  const loaders = PUBLIC_PAGE_LOADERS[base]`)
pub.push(`  if (!loaders) return null`)
pub.push(``)
pub.push(`  for (const [patternStr, loader] of Object.entries(loaders)) {`)
pub.push(`    const pattern = patternStr ? patternStr.split('/') : []`)
pub.push(`    const extracted = matchPattern(pattern, path)`)
pub.push(`    if (extracted !== null) {`)
pub.push(`      const mod = await loader()`)
pub.push(`      return { Component: mod.default, generateMetadata: mod.generateMetadata, mappedParams: extracted }`)
pub.push(`    }`)
pub.push(`  }`)
pub.push(`  return null`)
pub.push(`}`)
pub.push(``)
pub.push(`export async function resolveModuleRootSlugPage(`)
pub.push(`  slug: string`)
pub.push(`): Promise<{ Component: React.ComponentType<any>; generateMetadata?: (...args: any[]) => any; mappedParams: Record<string, string> } | null> {`)
pub.push(`  for (const entry of PUBLIC_ROOT_SLUG_CLAIMS) {`)
pub.push(`    const claimModule = await entry.loadClaim()`)
pub.push(`    const claim = claimModule[entry.claimExport]`)
pub.push(`    if (!claim || !(await claim(slug))) continue`)
pub.push(`    const page = await entry.loadPage()`)
pub.push(`    return { Component: page.default, generateMetadata: page.generateMetadata, mappedParams: { slug } }`)
pub.push(`  }`)
pub.push(`  return null`)
pub.push(`}`)
pub.push(``)
pub.push(`export async function dispatchModulePublicRoute(`)
pub.push(`  base: string,`)
pub.push(`  path: string[],`)
pub.push(`  method: string,`)
pub.push(`  req: Request`)
pub.push(`): Promise<Response | null> {`)
pub.push(`  const routes = PUBLIC_ROUTE_HANDLERS[base]`)
pub.push(`  if (!routes) return null`)
pub.push(``)
pub.push(`  for (const route of routes) {`)
pub.push(`    const extracted = matchPattern(route.pattern, path)`)
pub.push(`    if (extracted !== null) {`)
pub.push(`      const handler = await route.load()`)
pub.push(`      const fn = handler[method]`)
pub.push(`      if (!fn) return new Response('Method not allowed', { status: 405 })`)
pub.push(`      return fn(req, { params: Promise.resolve(extracted) })`)
pub.push(`    }`)
pub.push(`  }`)
pub.push(`  return null`)
pub.push(`}`)
pub.push(``)
pub.push(`export function getModulePublicBases(): string[] {`)
pub.push(`  return PUBLIC_BASES`)
pub.push(`}`)
pub.push(``)
pub.push(`export async function collectModuleSitemapEntries(siteUrl: string) {`)
pub.push(`  // eslint-disable-next-line @typescript-eslint/no-explicit-any`)
pub.push(`  const entries: any[] = []`)
if (sitemapModules.length === 0) {
  pub.push(`  void siteUrl`)
}
for (const { moduleName, importPath } of sitemapModules) {
  pub.push(`  try {`)
  pub.push(`    const mod = await import('${importPath}')`)
  pub.push(`    entries.push(...await mod.getPublicSitemapEntries(siteUrl))`)
  pub.push(`  } catch (err) {`)
  pub.push(`    console.error('[collectModuleSitemapEntries] ${moduleName} failed:', err)`)
  pub.push(`  }`)
}
pub.push(`  return entries`)
pub.push(`}`)
pub.push(``)
pub.push(`export async function collectModuleRobotsDisallow(): Promise<string[]> {`)
pub.push(`  const paths: string[] = []`)
for (const { moduleName, importPath } of robotsModules) {
  pub.push(`  try {`)
  pub.push(`    const mod = await import('${importPath}')`)
  pub.push(`    paths.push(...await mod.getPublicRobotsDisallow())`)
  pub.push(`  } catch (err) {`)
  pub.push(`    console.error('[collectModuleRobotsDisallow] ${moduleName} failed:', err)`)
  pub.push(`  }`)
}
pub.push(`  return paths`)
pub.push(`}`)

writeFileSync(routerPath, admin.join('\n') + '\n')
writeFileSync(publicRouterPath, pub.join('\n') + '\n')
console.log(
  `[generate-module-router] router.ts + router.public.ts written (${moduleNames.length} module(s): ${moduleNames.join(', ') || 'none'}; public bases: ${[...publicBases.keys()].join(', ') || 'none'}; root-slug claims: ${rootSlugClaims.map((c) => c.moduleName).join(', ') || 'none'})`
)
