#!/usr/bin/env node
/**
 * What JavaScript does a public page actually make the browser parse?
 *
 * Next.js ships a client component eagerly - as a <script> in the route's HTML,
 * parsed and compiled whether or not the page renders it - if the route's server
 * graph can reach it AT ALL. Static import, re-export, lazy `() => import(...)`:
 * all three are edges it follows. Only `import type` and a real `next/dynamic`
 * boundary are free.
 *
 * That is counter-intuitive enough that it went unnoticed for a long time, and
 * neither tsc, eslint nor `next build`'s route table says a word about it. The
 * only symptom is weight. Measured on deskwell.co.uk in August 2026, a category
 * listing pulled 5.5MB of uncompressed JavaScript, most of it admin screens for
 * modules the page never touches.
 *
 * This walks the same graph from a route entry and reports who is responsible,
 * so the next regression is a number rather than a hunch.
 *
 *   node scripts/analyse-public-bundle.mjs                       # default public routes
 *   node scripts/analyse-public-bundle.mjs 'app/(public)/page.tsx'
 *   node scripts/analyse-public-bundle.mjs --why modules/shop    # how does this get in?
 *   node scripts/analyse-public-bundle.mjs --offenders           # files to fix, by cost
 *
 * Source bytes, not built bytes - it needs no build, so it can run on any
 * checkout in a second. Treat the totals as relative, not as a bundle size.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const EXTS = ['.ts', '.tsx', '.js', '.jsx']
const SOURCE_DIRS = ['lib', 'modules', 'app', 'components', 'services']

// Same shape as scripts/check-client-graph.mjs: every edge a bundler follows,
// and only those. `import type` is erased, so it is deliberately not matched.
const IMPORT_RE =
  /(?:^|\n)\s*import\s+(?!type\b)[^'"\n]*from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|(?:^|\n)\s*export\s+(?!type\b)[^'"\n]*from\s*['"]([^'"]+)['"]/g
const DYNAMIC_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g

// The routes a visitor to the site can land on. app/(public)/[slug] is the one
// that matters most: every info page, every category, every product goes through it.
export const PUBLIC_ENTRIES = [
  'app/(public)/page.tsx',
  'app/(public)/[slug]/page.tsx',
  'app/(public)/[slug]/[...path]/page.tsx',
]

function loadSource() {
  const source = new Map()
  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name.startsWith('.git')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (EXTS.includes(path.extname(entry.name))) source.set(full, readFileSync(full, 'utf8'))
    }
  }
  for (const dir of SOURCE_DIRS) walk(path.join(ROOT, dir))
  return source
}

function makeGraph(source) {
  const resolve = (spec, from) => {
    let base
    if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2))
    else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec)
    else return null
    for (const ext of EXTS) if (source.has(base + ext)) return base + ext
    for (const ext of EXTS) if (source.has(path.join(base, `index${ext}`))) return path.join(base, `index${ext}`)
    return null
  }

  const edgeCache = new Map()
  const edges = (file) => {
    const cached = edgeCache.get(file)
    if (cached) return cached
    const text = source.get(file) ?? ''
    const dynamic = new Set([...text.matchAll(DYNAMIC_RE)].map((m) => m[1]))
    const out = []
    for (const match of text.matchAll(IMPORT_RE)) {
      const spec = match[1] ?? match[2] ?? match[3]
      if (!spec) continue
      const target = resolve(spec, file)
      if (target) out.push({ target, dynamic: dynamic.has(spec) })
    }
    edgeCache.set(file, out)
    return out
  }

  // 'use client' has to be the first statement, so only the head can carry it.
  const clientCache = new Map()
  const isClient = (file) => {
    if (!clientCache.has(file)) {
      clientCache.set(file, /^\s*['"]use client['"]/m.test((source.get(file) ?? '').slice(0, 400)))
    }
    return clientCache.get(file)
  }

  return { resolve, edges, isClient }
}

/**
 * Every client component the route's SERVER graph can reach - i.e. every client
 * chunk Next.js will attach to the route. Stops at each client boundary: what a
 * client component imports is that component's own subtree, counted separately.
 *
 * @returns {Map<string, boolean>} client file -> true if every route to it went
 *   through a dynamic import (still shipped, just easier to argue about)
 */
export function clientEntryPoints(entryRel, { source, graph } = {}) {
  source ??= loadSource()
  graph ??= makeGraph(source)
  const entry = path.join(ROOT, entryRel)
  if (!source.has(entry)) throw new Error(`no such entry: ${entryRel}`)

  const reached = new Map([[entry, false]])
  const queue = [{ file: entry, viaDynamic: false }]
  while (queue.length) {
    const { file, viaDynamic } = queue.shift()
    // Crossing into a client component ends the server walk down this branch.
    if (graph.isClient(file) && file !== entry) continue
    for (const { target, dynamic } of graph.edges(file)) {
      const next = viaDynamic || dynamic
      // Revisit only if we found a route that is MORE eager than the one we had.
      if (reached.has(target) && reached.get(target) <= next) continue
      reached.set(target, next)
      queue.push({ file: target, viaDynamic: next })
    }
  }

  const clients = new Map()
  for (const [file, viaDynamic] of reached) {
    if (graph.isClient(file) && file !== entry) clients.set(file, viaDynamic)
  }
  return clients
}

// Bytes of source behind one client entry point, minus anything already counted
// for this report - shared code belongs to whoever pulled it in first.
function subtreeBytes(entry, seen, graph) {
  const local = new Set([entry])
  const queue = [entry]
  let bytes = 0
  while (queue.length) {
    const file = queue.shift()
    if (!seen.has(file)) {
      seen.add(file)
      bytes += statSync(file).size
    }
    for (const { target } of graph.edges(file)) {
      if (!local.has(target)) {
        local.add(target)
        queue.push(target)
      }
    }
  }
  return bytes
}

const ownerOf = (file) => {
  const rel = path.relative(ROOT, file)
  const parts = rel.split(path.sep)
  return parts[0] === 'modules' ? `modules/${parts[1]}` : parts[0]
}

// An admin screen has no business in a public page's bundle. Modules keep theirs
// under components/admin/ or app/cactus-admin/ by convention.
export const isAdminComponent = (file) =>
  /\/components\/admin\//.test(file) || /\/app\/cactus-admin\//.test(file)

export function report(entryRel, ctx) {
  const clients = clientEntryPoints(entryRel, ctx)
  const seen = new Set()
  const rows = new Map()
  // Static first, so shared code is charged to the eager route that really pays.
  const ordered = [...clients].sort((a, b) => Number(a[1]) - Number(b[1]))
  let admin = 0
  for (const [file, viaDynamic] of ordered) {
    const bytes = subtreeBytes(file, seen, ctx.graph)
    if (isAdminComponent(file)) admin += bytes
    const key = ownerOf(file) + (viaDynamic ? '  [dynamic-only]' : '')
    const row = rows.get(key) ?? { bytes: 0, count: 0 }
    row.bytes += bytes
    row.count += 1
    rows.set(key, row)
  }
  const total = [...rows.values()].reduce((sum, r) => sum + r.bytes, 0)
  return { entryRel, rows: [...rows].sort((a, b) => b[1].bytes - a[1].bytes), total, admin, clients }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = loadSource()
  const graph = makeGraph(source)
  const ctx = { source, graph }
  const args = process.argv.slice(2)

  const whyAt = args.indexOf('--why')
  if (whyAt !== -1) {
    const needle = args[whyAt + 1]
    const entry = args.find((a) => a !== '--why' && a !== needle) ?? PUBLIC_ENTRIES[1]
    const start = path.join(ROOT, entry)
    const seen = new Set([start])
    const queue = [[start, [{ file: start, dynamic: false }]]]
    let printed = 0
    while (queue.length && printed < 3) {
      const [file, trail] = queue.shift()
      if (graph.isClient(file) && file !== start) continue
      for (const { target, dynamic } of graph.edges(file)) {
        if (seen.has(target)) continue
        seen.add(target)
        const next = [...trail, { file: target, dynamic }]
        if (graph.isClient(target) && path.relative(ROOT, target).includes(needle)) {
          console.log(next.map((s) => (s.dynamic ? '  --dynamic--> ' : '  ') + path.relative(ROOT, s.file)).join('\n'))
          console.log('---')
          if (++printed >= 3) break
        }
        queue.push([target, next])
      }
    }
    if (printed === 0) console.log(`${needle} is not reachable from ${entry}`)
    process.exit(0)
  }

  if (args.includes('--offenders')) {
    // The remaining weight is nearly all one shape: a file a public request can
    // reach importing lib/modules/extension-points, the FULL map. That map is one
    // flat object holding every point's implementation, admin screens included, so
    // reading a single point from a public path drags all of them in.
    //
    // extension-points.public.ts is the same map with the admin entries withheld
    // and is a drop-in swap. Core's own files are held to it by
    // lib/modules/router-split.test.ts; a module's are its own repo's to change,
    // which is why this reports rather than fails.
    const reachable = new Set()
    for (const entryRel of PUBLIC_ENTRIES) {
      if (!existsSync(path.join(ROOT, entryRel))) continue
      const entry = path.join(ROOT, entryRel)
      const seen = new Set([entry])
      const queue = [entry]
      while (queue.length) {
        const file = queue.shift()
        reachable.add(file)
        if (graph.isClient(file) && file !== entry) continue
        for (const { target } of graph.edges(file)) {
          if (seen.has(target)) continue
          seen.add(target)
          queue.push(target)
        }
      }
    }
    const offenders = [...reachable]
      .filter((f) => /from '@\/lib\/modules\/extension-points'/.test(source.get(f) ?? ''))
      .map((f) => path.relative(ROOT, f))
      .sort()
    if (offenders.length === 0) {
      console.log('every public-path file already uses extension-points.public')
      process.exit(0)
    }
    console.log(
      `${offenders.length} file(s) a public request can reach import the FULL extension-point map.\n` +
        `Each one puts every module's admin screens into every public page's bundle.\n` +
        `Swap to: import { modulePublicExtensionPointComponents as moduleExtensionPointComponents } from '@/lib/modules/extension-points.public'\n`,
    )
    for (const rel of offenders) console.log(`  ${rel}`)
    const modules = [...new Set(offenders.filter((r) => r.startsWith('modules/')).map((r) => r.split('/')[1]))]
    if (modules.length > 0) {
      console.log(`\nmodules needing a release for this: ${modules.join(', ')}`)
    }
    process.exit(0)
  }

  const entries = args.length > 0 ? args : PUBLIC_ENTRIES
  for (const entryRel of entries) {
    if (!existsSync(path.join(ROOT, entryRel))) {
      console.error(`skipping ${entryRel} - no such file`)
      continue
    }
    const { rows, total, admin } = report(entryRel, ctx)
    console.log(`\n${entryRel}`)
    for (const [owner, row] of rows) {
      if (row.bytes < 8 * 1024) continue
      console.log(`  ${(row.bytes / 1024).toFixed(0).padStart(7)} KB  ${String(row.count).padStart(3)} comps  ${owner}`)
    }
    console.log(`  ${(total / 1024).toFixed(0).padStart(7)} KB  total client source reachable`)
    if (admin > 0) {
      console.log(`  ${(admin / 1024).toFixed(0).padStart(7)} KB  of that is ADMIN components - see --why`)
    }
  }
}
