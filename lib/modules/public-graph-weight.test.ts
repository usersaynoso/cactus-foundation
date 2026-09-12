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
 * Static imports only. `import type` erases at compile time and `await import()`
 * is a lazy edge - both are fine, and both are exactly what the fix uses.
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
  return out
}

type Offence = { library: string; chain: string[] }

function heavyLibrariesInThePublicGraph(): Offence[] {
  const entry = path.join(ROOT, 'app', '(public)', 'layout.tsx')
  if (!existsSync(entry)) return []

  const seen = new Set<string>([entry])
  const parent = new Map<string, string>()
  const queue: string[] = [entry]
  const offences: Offence[] = []

  while (queue.length) {
    const file = queue.shift()!
    let source: string
    try {
      source = withoutComments(readFileSync(file, 'utf8'))
    } catch {
      continue
    }
    // A file reached statically that loads a heavy library at runtime is the
    // defect: the lazy edge is real, but the bundler can still fold it into the
    // chunks this always-loaded graph needs.
    const lazy = lazilyLoadsHeavy(source)
    if (lazy && file !== entry) {
      const chain: string[] = []
      let at: string | undefined = file
      while (at) {
        chain.unshift(path.relative(ROOT, at))
        at = parent.get(at)
      }
      offences.push({ library: lazy, chain })
    }
    for (const spec of staticImports(source)) {
      const next = resolveSpec(spec, file)
      if (!next || seen.has(next)) continue
      seen.add(next)
      parent.set(next, file)
      queue.push(next)
    }
  }
  return offences
}

describe('the public client graph carries no heavy library', () => {
  it('no page-global import chain reaches a 3D or charting engine', () => {
    const offences = heavyLibrariesInThePublicGraph()
    const report = offences
      .map((o) => `${o.library} via\n    ${o.chain.join('\n    -> ')}`)
      .join('\n\n  ')
    expect(
      offences,
      `A heavy library is statically reachable from app/(public)/layout.tsx, so it\n` +
        `lands in the client graph of EVERY public page - the contact page and the\n` +
        `login page included - and the bundler is free to merge it into chunks those\n` +
        `pages genuinely need. Register the component through a small 'use client'\n` +
        `module that wraps it in next/dynamic instead:\n\n  ` +
        report +
        '\n',
    ).toEqual([])
  })
})
