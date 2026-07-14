#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const modulesDir = join(rootDir, 'modules')
const routerPath = join(rootDir, 'lib', 'modules', 'router.ts')

function scanDir(dir, suffix) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true })
    .map(f => String(f).replace(/\\/g, '/'))
    .filter(f => f.endsWith(suffix))
    .sort()
}

function getModuleNames() {
  if (!existsSync(modulesDir)) return []
  return readdirSync(modulesDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort()
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

// Sorts pattern keys literal-first (fewest dynamic [param] segments first, then
// lexicographic) so pattern matching against a request path is deterministic —
// a literal route always wins over a same-length dynamic one.
function sortPatternKeys(keys) {
  return [...keys].sort((a, b) => {
    const aDynamic = (a.match(/\[[^\]]+\]/g) || []).length
    const bDynamic = (b.match(/\[[^\]]+\]/g) || []).length
    if (aDynamic !== bDynamic) return aDynamic - bDynamic
    return a.localeCompare(b)
  })
}

const moduleNames = getModuleNames()

if (moduleNames.length === 0) {
  console.log('[generate-module-router] No modules found — writing empty router.')
}

// Everything the router reaches for is emitted as a lazy `() => import(...)` loader,
// never a top-level `import * as`. lib/modules/router.ts is statically imported by the
// public page route (app/(public)/[slug]/page.tsx) and app/sitemap.ts, so an eager
// import here drags every module's admin API, member API, cron and public route handler
// - and everything they transitively pull in, client components included - into the
// public site's bundle. Lazy loaders keep each handler in its own async chunk, resolved
// only when a request actually matches its pattern.
const pageLoaders = {}  // moduleName → { key → importPath }
const apiRoutes = {}    // moduleName → [{ pattern, importPath }]

const publicBases = new Map() // base → moduleName
const publicPageLoaders = {}  // base → { key → importPath }
const publicRoutes = {}       // base → [{ pattern, importPath }]
const sitemapModules = []     // [{ moduleName, importPath }]

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

  // Public routes — only for modules that declare a publicBasePath.
  const manifest = readManifest(moduleName)
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

  const sitemapPath = join(rootDir, 'modules', moduleName, 'lib', 'sitemap.ts')
  if (existsSync(sitemapPath)) {
    sitemapModules.push({ moduleName, importPath: `@/modules/${moduleName}/lib/sitemap` })
  }
}

const out = []

out.push(`// AUTO-GENERATED by scripts/generate-module-router.mjs`)
out.push(`// DO NOT EDIT BY HAND. Rewritten on every build and dev start.`)
out.push(``)

out.push(`// Handlers are lazy: this file is statically imported by the public page route and`)
out.push(`// app/sitemap.ts, so a top-level import here would pull every module's API route`)
out.push(`// (and its transitive imports) into the public site bundle. Do not "simplify" the`)
out.push(`// loaders back into eager imports.`)
out.push(`// eslint-disable-next-line @typescript-eslint/no-explicit-any`)
out.push(`type ApiHandlerModule = Record<string, ((...args: any[]) => Promise<Response>) | undefined>`)
out.push(`type ApiRouteLoader = () => Promise<ApiHandlerModule>`)
out.push(`type PageModule = () => Promise<{ default: React.ComponentType<any>; generateMetadata?: (...args: any[]) => any }>`)
out.push(``)

out.push(`const API_ROUTES: Record<string, Array<{ pattern: string[]; load: ApiRouteLoader }>> = {`)
for (const [mod, routes] of Object.entries(apiRoutes)) {
  out.push(`  '${mod}': [`)
  for (const { pattern, importPath } of routes) {
    out.push(`    { pattern: ${JSON.stringify(pattern)}, load: () => import('${importPath}') },`)
  }
  out.push(`  ],`)
}
out.push(`}`)
out.push(``)

out.push(`const PAGE_LOADERS: Record<string, Record<string, PageModule>> = {`)
for (const [mod, loaders] of Object.entries(pageLoaders)) {
  out.push(`  '${mod}': {`)
  for (const [key, importPath] of Object.entries(loaders)) {
    out.push(`    '${key}': () => import('${importPath}'),`)
  }
  out.push(`  },`)
}
out.push(`}`)
out.push(``)

out.push(`const PUBLIC_PAGE_LOADERS: Record<string, Record<string, PageModule>> = {`)
for (const [base, loaders] of Object.entries(publicPageLoaders)) {
  out.push(`  '${base}': {`)
  for (const key of sortPatternKeys(Object.keys(loaders))) {
    out.push(`    '${key}': () => import('${loaders[key]}'),`)
  }
  out.push(`  },`)
}
out.push(`}`)
out.push(``)

out.push(`const PUBLIC_ROUTE_HANDLERS: Record<string, Array<{ pattern: string[]; load: ApiRouteLoader }>> = {`)
for (const [base, routes] of Object.entries(publicRoutes)) {
  out.push(`  '${base}': [`)
  for (const { pattern, importPath } of routes) {
    out.push(`    { pattern: ${JSON.stringify(pattern)}, load: () => import('${importPath}') },`)
  }
  out.push(`  ],`)
}
out.push(`}`)
out.push(``)

out.push(`const PUBLIC_BASES: string[] = ${JSON.stringify([...publicBases.keys()])}`)
out.push(``)

out.push(`function matchPattern(pattern: string[], actual: string[]): Record<string, string> | null {`)
out.push(`  if (pattern.length !== actual.length) return null`)
out.push(`  const params: Record<string, string> = {}`)
out.push(`  for (let i = 0; i < pattern.length; i++) {`)
out.push(`    const seg = pattern[i]!`)
out.push(`    if (seg.startsWith('[') && seg.endsWith(']')) {`)
out.push(`      params[seg.slice(1, -1)] = actual[i]!`)
out.push(`    } else if (seg !== actual[i]) {`)
out.push(`      return null`)
out.push(`    }`)
out.push(`  }`)
out.push(`  return params`)
out.push(`}`)
out.push(``)
out.push(`export async function dispatchModuleApi(`)
out.push(`  method: string,`)
out.push(`  req: Request,`)
out.push(`  ctx: { params: Promise<{ module: string; path: string[] }> }`)
out.push(`): Promise<Response> {`)
out.push(`  const { module, path } = await ctx.params`)
out.push(`  const routes = API_ROUTES[module]`)
out.push(`  if (!routes) return new Response('Module not found', { status: 404 })`)
out.push(``)
out.push(`  for (const route of routes) {`)
out.push(`    const extracted = matchPattern(route.pattern, path)`)
out.push(`    if (extracted !== null) {`)
out.push(`      const handler = await route.load()`)
out.push(`      const fn = handler[method]`)
out.push(`      if (!fn) return new Response('Method not allowed', { status: 405 })`)
out.push(`      return fn(req, { params: Promise.resolve(extracted) })`)
out.push(`    }`)
out.push(`  }`)
out.push(`  return new Response('Not found', { status: 404 })`)
out.push(`}`)
out.push(``)
out.push(`export async function resolveModulePage(`)
out.push(`  module: string,`)
out.push(`  path: string[]`)
out.push(`): Promise<{ Component: React.ComponentType<any>; mappedParams: Record<string, string> } | null> {`)
out.push(`  const loaders = PAGE_LOADERS[module]`)
out.push(`  if (!loaders) return null`)
out.push(``)
out.push(`  for (const [patternStr, loader] of Object.entries(loaders)) {`)
out.push(`    const pattern = patternStr ? patternStr.split('/') : []`)
out.push(`    const extracted = matchPattern(pattern, path)`)
out.push(`    if (extracted !== null) {`)
out.push(`      const mod = await loader()`)
out.push(`      return { Component: mod.default, mappedParams: extracted }`)
out.push(`    }`)
out.push(`  }`)
out.push(`  return null`)
out.push(`}`)
out.push(``)
out.push(`export async function resolveModulePublicPage(`)
out.push(`  base: string,`)
out.push(`  path: string[]`)
out.push(`): Promise<{ Component: React.ComponentType<any>; generateMetadata?: (...args: any[]) => any; mappedParams: Record<string, string> } | null> {`)
out.push(`  const loaders = PUBLIC_PAGE_LOADERS[base]`)
out.push(`  if (!loaders) return null`)
out.push(``)
out.push(`  for (const [patternStr, loader] of Object.entries(loaders)) {`)
out.push(`    const pattern = patternStr ? patternStr.split('/') : []`)
out.push(`    const extracted = matchPattern(pattern, path)`)
out.push(`    if (extracted !== null) {`)
out.push(`      const mod = await loader()`)
out.push(`      return { Component: mod.default, generateMetadata: mod.generateMetadata, mappedParams: extracted }`)
out.push(`    }`)
out.push(`  }`)
out.push(`  return null`)
out.push(`}`)
out.push(``)
out.push(`export async function dispatchModulePublicRoute(`)
out.push(`  base: string,`)
out.push(`  path: string[],`)
out.push(`  method: string,`)
out.push(`  req: Request`)
out.push(`): Promise<Response | null> {`)
out.push(`  const routes = PUBLIC_ROUTE_HANDLERS[base]`)
out.push(`  if (!routes) return null`)
out.push(``)
out.push(`  for (const route of routes) {`)
out.push(`    const extracted = matchPattern(route.pattern, path)`)
out.push(`    if (extracted !== null) {`)
out.push(`      const handler = await route.load()`)
out.push(`      const fn = handler[method]`)
out.push(`      if (!fn) return new Response('Method not allowed', { status: 405 })`)
out.push(`      return fn(req, { params: Promise.resolve(extracted) })`)
out.push(`    }`)
out.push(`  }`)
out.push(`  return null`)
out.push(`}`)
out.push(``)
out.push(`export function getModulePublicBases(): string[] {`)
out.push(`  return PUBLIC_BASES`)
out.push(`}`)
out.push(``)
out.push(`export async function collectModuleSitemapEntries(siteUrl: string) {`)
out.push(`  // eslint-disable-next-line @typescript-eslint/no-explicit-any`)
out.push(`  const entries: any[] = []`)
if (sitemapModules.length === 0) {
  out.push(`  void siteUrl`)
}
for (const { moduleName, importPath } of sitemapModules) {
  out.push(`  try {`)
  out.push(`    const mod = await import('${importPath}')`)
  out.push(`    entries.push(...await mod.getPublicSitemapEntries(siteUrl))`)
  out.push(`  } catch (err) {`)
  out.push(`    console.error('[collectModuleSitemapEntries] ${moduleName} failed:', err)`)
  out.push(`  }`)
}
out.push(`  return entries`)
out.push(`}`)

writeFileSync(routerPath, out.join('\n') + '\n')
console.log(
  `[generate-module-router] router.ts written (${moduleNames.length} module(s): ${moduleNames.join(', ') || 'none'}; public bases: ${[...publicBases.keys()].join(', ') || 'none'})`
)
