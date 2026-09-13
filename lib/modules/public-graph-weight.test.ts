import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import path from 'path'

// Why this is a test and not a code review note:
//
// Every public page on the site shares one client graph. It starts at
// app/(public)/layout.tsx, runs through lib/puck/config.rsc.tsx and
// lib/puck/mobile-bar-items.ts, and reaches lib/modules/extension-points.public.ts
// - the registry every module contributes to. Anything a module statically
// imports from there is in the graph of the contact page, the login page and the
// members list, whether or not those pages could ever render it.
//
// WHAT THAT COST, measured on the live site. product-3d-views registers a gallery
// provider, and that provider statically imported the gallery's client components,
// which statically imported the module's three.js helpers. The module was doing
// everything right - three itself is only ever `await import('three')` - but a
// dynamic import inside a module that is statically in the graph still gives the
// bundler something to merge, and Turbopack merged it into chunks carrying the
// header menu and the variation swatches. Result: 224 KB brotli of a 3D engine
// downloaded and executed as `<script async>` on EVERY page, which Lighthouse
// reported as ~100% unused.
//
// Nothing else catches this. It typechecks, it lints, the client-graph guard is
// happy (no server code in a client component), every test passes, and the only
// symptom is a slow page on somebody else's machine. So the rule is written down:
// a heavy library may be reachable from the public registry only through a lazy
// edge.
//
// The fix shape, when this fails: put the component behind `next/dynamic` in a
// small 'use client' module of its own and register THAT - see
// modules/product-3d-views-for-shop/components/public/Gallery3dLazy.tsx. A
// `dynamic()` cannot live in the provider itself when the provider is server-only
// and hands the component across the RSC boundary as a prop.
//
// THE SECOND WAY IN, which this guard could not see for a month. On the SERVER
// side of the graph a lazy `() => import(...)` is not lazy at all as far as the
// client bundle is concerned: Next follows it when it collects the client
// components a layout or page can render, exactly as lib/modules/router-split.test.ts
// describes. So when app/(public)/layout.tsx imported lib/modules/router.public.ts
// for one small head collector, it reached that file's loader for every module's
// public page, and with them:
//
//   router.public.ts -> import() space-planner render page -> RenderFrame.tsx
//     -> lib/three/planner-scene.ts -> `import { ... } from 'three'`
//
// A STATIC three import, inside a client component, reached through a server-side
// loader. The walk below used to follow static edges only, so it passed while
// three.js shipped on every page - measured on deskwell.co.uk in September 2026,
// alongside the planner UI, the cart and checkout pages' clients and the purchase
// order portal. It now follows `import()` wherever the importing file is server
// code, stops following it once inside a client component (there, a dynamic import
// really is a separate chunk), and flags a heavy library imported statically by
// anything client-side it reaches. It also walks from the public page routes, not
// just the layout, because the catch-all reaches every module page by design.

const ROOT = path.join(__dirname, '..', '..')

/**
 * Libraries big enough that pulling them into every page is a defect rather than
 * a trade-off.
 *
 * MATCHED ON THE LAZY IMPORT, NOT THE STATIC ONE, and that distinction is the
 * whole test. Nothing in this repo statically imports `three` - the 3D module has
 * always done `await import('three')`, correctly. The defect was that a module
 * CONTAINING that lazy import sat statically in the public graph, which is what
 * let the bundler merge the lazy chunk into chunks every page needs. A guard
 * looking for `from 'three'` would have found nothing and passed happily while
 * 224 KB shipped to every page - it was written that way first, and it did.
 */
const HEAVY = ['three', 'maplibre-gl', '@react-three/fiber', '@react-three/drei', 'chart.js']

/** Does this file pull a heavy library in at runtime? */
function lazilyLoadsHeavy(source: string): string | null {
  for (const lib of HEAVY) {
    const re = new RegExp(`import\\(\\s*['"]${lib.replace(/[/@-]/g, '\\$&')}(?:/[^'"]*)?['"]\\s*\\)`)
    if (re.test(source)) return lib
  }
  return null
}

/**
 * A file's code with its comments removed.
 *
 * Every scan below runs on this rather than the raw text, because the files that
 * EXPLAIN this defect naturally quote the thing being banned - Gallery3dLazy's own
 * header says `await import('three')` in prose - and a guard that reads its own
 * documentation as an offence fails on a correct tree. That happened three times
 * in one afternoon across three different guards; it is stripped once, here.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => (line.trimStart().startsWith('//') ? '' : line))
    .join('\n')
}

function resolveSpec(spec: string, from: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2))
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec)
  else return null
  for (const c of [base + '.tsx', base + '.ts', path.join(base, 'index.tsx'), path.join(base, 'index.ts')]) {
    if (existsSync(c)) return c
  }
  return null
}

/**
 * Static imports and re-exports - the edges a bundler follows on either side of
 * the client boundary. `import type` erases at compile time, so it is skipped.
 */
function staticImports(source: string): string[] {
  const out: string[] = []
  const re = /^import\s+(?!type\s)([\s\S]*?)from\s+['"]([^'"]+)['"]/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) {
    const clause = m[1] ?? ''
    // `import { type A } from` with nothing else is type-only in practice.
    if (/^\s*\{\s*type\s/.test(clause) && !clause.includes(',')) continue
    const spec = m[2]
    if (spec) out.push(spec)
  }
  // `export { x } from` pulls the module in as surely as an import does, and a
  // side-effect `import 'x'` has no clause to match above.
  const reExport = /^export\s+(?!type\s)[^'";]*?from\s+['"]([^'"]+)['"]/gm
  while ((m = reExport.exec(source))) if (m[1]) out.push(m[1])
  const bare = /^import\s+['"]([^'"]+)['"]/gm
  while ((m = bare.exec(source))) if (m[1]) out.push(m[1])
  return out
}

/** `import('...')` specifiers - lazy in a client file, an ordinary edge in a server one. */
function dynamicImports(source: string): string[] {
  const out: string[] = []
  const re = /import\(\s*['"]([^'"]+)['"]\s*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) if (m[1]) out.push(m[1])
  return out
}

/**
 * Node built-ins a browser bundle can only satisfy with a polyfill, and a big one.
 *
 * Checked in CLIENT code only, and only as a static import. Server code imports
 * these all the time, lazily or not, and that is fine - they are Node's own and
 * cost nothing there. The trouble is purely a client component reaching one:
 * quote-for-shop's Retrieve Quote button imported a helper file that also did
 * `import { randomInt } from 'crypto'` for the code generator, and the browser
 * got about 121 KB gzip of stream, buffer and hashing polyfill on every page of
 * the shop (deskwell.co.uk, September 2026) for a button that only formats a code.
 */
const POLYFILLED_NODE_BUILTINS = ['crypto', 'node:crypto', 'stream', 'node:stream', 'buffer', 'node:buffer']

/** Does this file import a heavy library statically, i.e. into its own chunk? */
function staticallyImportsHeavy(specs: string[]): string | null {
  for (const lib of HEAVY) {
    if (specs.some((spec) => spec === lib || spec.startsWith(`${lib}/`))) return lib
  }
  for (const builtin of POLYFILLED_NODE_BUILTINS) {
    if (specs.includes(builtin)) return builtin
  }
  return null
}

/**
 * The routes every public visit renders through. The layout wraps them all; the
 * catch-all pair carries every module's public pages by design, which is exactly
 * why whatever those pages import matters as much as what the layout does.
 */
const PUBLIC_ENTRIES = [
  path.join('app', '(public)', 'layout.tsx'),
  path.join('app', '(public)', 'page.tsx'),
  path.join('app', '(public)', '[slug]', 'page.tsx'),
  path.join('app', '(public)', '[slug]', '[...path]', 'page.tsx'),
]

type Offence = { library: string; how: 'lazy import in an eager file' | 'static import in client code'; chain: string[] }

/**
 * One step of the walk. `client` is true once the path has passed through a
 * 'use client' file: from there on everything is browser code, and a dynamic
 * import is a genuine split rather than an edge into the same chunk group.
 */
type Visit = { file: string; client: boolean }

function heavyLibrariesInThePublicGraph(): Offence[] {
  const offences: Offence[] = []
  const reported = new Set<string>()

  for (const entryRel of PUBLIC_ENTRIES) {
    const entry = path.join(ROOT, entryRel)
    if (!existsSync(entry)) continue

    const key = (v: Visit) => `${v.client ? 'client' : 'server'}:${v.file}`
    const start: Visit = { file: entry, client: false }
    const seen = new Set<string>([key(start)])
    const parent = new Map<string, Visit>()
    const queue: Visit[] = [start]

    const chainTo = (v: Visit): string[] => {
      const chain: string[] = []
      let at: Visit | undefined = v
      while (at) {
        chain.unshift(path.relative(ROOT, at.file))
        at = parent.get(key(at))
      }
      return chain
    }
    const report = (library: string, how: Offence['how'], v: Visit) => {
      const id = `${library}|${how}|${v.file}`
      if (reported.has(id)) return
      reported.add(id)
      offences.push({ library, how, chain: chainTo(v) })
    }

    while (queue.length) {
      const visit = queue.shift()!
      let source: string
      try {
        source = withoutComments(readFileSync(visit.file, 'utf8'))
      } catch {
        continue
      }
      const client = visit.client || /^\s*['"]use client['"]/.test(source)
      const specs = staticImports(source)

      // A file reached eagerly that loads a heavy library at runtime: the lazy
      // edge is real, but the bundler can still fold it into chunks this
      // always-loaded graph needs.
      const lazy = lazilyLoadsHeavy(source)
      if (lazy && visit.file !== entry) report(lazy, 'lazy import in an eager file', visit)

      // Client code importing a heavy library outright puts it in the chunk group.
      const eager = client ? staticallyImportsHeavy(specs) : null
      if (eager) report(eager, 'static import in client code', visit)

      const next = client ? specs : [...specs, ...dynamicImports(source)]
      for (const spec of next) {
        const file = resolveSpec(spec, visit.file)
        if (!file) continue
        const step: Visit = { file, client }
        if (seen.has(key(step))) continue
        seen.add(key(step))
        parent.set(key(step), visit)
        queue.push(step)
      }
    }
  }
  return offences
}

describe('the public client graph carries no heavy library', () => {
  it('no page-global import chain reaches a 3D or charting engine', () => {
    const offences = heavyLibrariesInThePublicGraph()
    const report = offences
      .map((o) => `${o.library} (${o.how}) via\n    ${o.chain.join('\n    -> ')}`)
      .join('\n\n  ')
    expect(
      offences,
      `A heavy library is reachable from a public route's eager graph, so it lands\n` +
        `in the client JavaScript of every page that route serves - the contact page\n` +
        `and the login page included - whether or not the page renders it. Server-side\n` +
        `\`import()\` counts as an edge here: Next follows it when collecting client\n` +
        `components. Put the client component that pulls the library in behind\n` +
        `next/dynamic in a small 'use client' module of its own, and import that:\n\n  ` +
        report +
        '\n',
    ).toEqual([])
  })

  it('walks from routes that exist (the guard is worthless if the paths break)', () => {
    for (const entryRel of PUBLIC_ENTRIES) expect(existsSync(path.join(ROOT, entryRel)), entryRel).toBe(true)
  })
})
