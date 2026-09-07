#!/usr/bin/env node
/**
 * Fails the build if a generated registry and the module code it imports form a
 * static import cycle.
 *
 * WHAT THIS CATCHES, AND WHY NOTHING ELSE DOES. `extension-points.public.ts` is
 * generated: it statically imports every component every installed module
 * contributes - well over a hundred files - and hands them back as one map. A
 * module file that consumes that map with a plain `import` closes a loop:
 * registry -> the module's contributed component -> ... -> the consumer -> back
 * to the registry.
 *
 * A cycle is legal JavaScript and usually harmless. It stops being harmless
 * under Turbopack, which merges the modules in a cycle into a single scope: a
 * `const` read while that scope is still evaluating throws "Cannot access 'x'
 * before initialization", and the build dies collecting page data. Whether it
 * throws depends on the order the graph happens to be entered in, which depends
 * on which modules are installed - so the same code builds on one site and
 * fails on another.
 *
 * `tsc` is happy (the types are fine), `eslint` is happy (the imports resolve),
 * and the whole test suite is happy (nothing evaluates the merged bundle). It
 * cost a red module build gate on 2026-09-07: core v0.5.1550 added
 * /api/admin/message-destinations, the first route to evaluate the public
 * registry at build time, and filters-for-shop's gate - a module with one line
 * of CSS changed - went red on a cycle inside shop.
 *
 * THE FIX AT EACH SITE is to reach the registry through `await import(...)`
 * inside the consuming function instead of a static import at the top of the
 * file. That is still an edge the bundler follows, so it hides nothing from
 * check-client-graph; it only defers evaluation past the cycle.
 *
 * Dynamic `import()` is deliberately NOT counted as an edge here, which is the
 * one place this script differs from check-client-graph. That script asks "can
 * the bundler reach server code from the browser", where a deferred edge still
 * counts. This one asks "can evaluation re-enter a half-evaluated module",
 * where a deferred edge is exactly the cure. `import type` is erased and counts
 * for neither.
 */

import { readdirSync, readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const SOURCE_DIRS = ['lib', 'modules', 'app']
const EXTS = ['.ts', '.tsx', '.js', '.jsx']

// The generated barrels that import module code. Each is checked for cycles
// against everything it pulls in. A registry that has not been generated yet is
// skipped rather than guessed at - the caller decides whether that is a failure.
const REGISTRIES = [
  'lib/modules/extension-points.public.ts',
  'lib/modules/extension-points.ts',
  'lib/puck/module-rsc-components.ts',
]

/**
 * Cycles that are known, accepted and not yet fixed. Each entry is the closing
 * edge: the file whose static import of a registry completes a loop.
 *
 * The cure everywhere else was to reach the registry through `await import()`
 * inside the consuming function. That needs the function to be async, and these
 * two are not:
 *
 *   payments/registry.ts     `moduleProviders()` is synchronous and feeds ten
 *                            synchronous exports, several of them read straight
 *                            from render. Making it async is a change to shop's
 *                            payment API and every caller of it.
 *   checkout-address-lookup  `resolveCheckoutAddressLookup()` hands a component
 *                            to a client island from four call sites, one of
 *                            which is a Puck RSC block that is not async. Three
 *                            of the four would take an `await` happily; the
 *                            block is the one that wants checking against a real
 *                            render first.
 *
 * Both are recorded rather than ignored: this guard still fails on any cycle
 * NOT on the list, so the count can only go down. It went 27 -> 2 on
 * 2026-09-07.
 *
 * A stale allowance is how a list like this quietly stops meaning anything, so
 * an entry that no longer cycles is still reported - but as a WARNING at
 * prebuild, and as a failure only in the platform tree's own suite. Whether an
 * entry cycles at all depends on which modules an install has: the edge that
 * closes the loop here may be in a module that site never installed. An install
 * must never have its build refused over somebody else's tidying.
 */
const KNOWN = [
  'modules/shop/lib/payments/registry.ts',
  'modules/shop/lib/checkout-address-lookup.ts',
]

// Static edges only: `import ... from` and `export ... from`. `import type` is
// erased by the compiler, and a dynamic import() defers evaluation, so neither
// can put a module in the temporal dead zone.
const STATIC_IMPORT_RE =
  /(?:^|\n)\s*import\s+(?!type\b)[^'"\n]*from\s*['"]([^'"]+)['"]|(?:^|\n)\s*export\s+(?!type\b)[^'"\n]*from\s*['"]([^'"]+)['"]/g

function collectFiles(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name.startsWith('.git')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collectFiles(full, out)
    else if (EXTS.includes(path.extname(entry.name))) out.push(full)
  }
  return out
}

/**
 * @param {string} rootDir
 * @returns {{ cycles: string[], unexpected: string[], stale: string[], checked: string[] }}
 *   `cycles` is every cycle found, formatted as a trail; `unexpected` is the
 *   subset not on the KNOWN list; `stale` names KNOWN entries that no longer
 *   cycle; `checked` names the registries that actually existed.
 */
export function findRegistryImportCycles(rootDir) {
  const source = new Map()
  for (const dir of SOURCE_DIRS) {
    for (const file of collectFiles(path.join(rootDir, dir))) {
      source.set(file, readFileSync(file, 'utf8'))
    }
  }

  const resolveSpecifier = (spec, from) => {
    let base
    if (spec.startsWith('@/')) base = path.join(rootDir, spec.slice(2))
    else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec)
    else return null
    for (const ext of EXTS) if (source.has(base + ext)) return base + ext
    for (const ext of EXTS) if (source.has(path.join(base, `index${ext}`))) return path.join(base, `index${ext}`)
    return null
  }

  const edges = new Map()
  for (const [file, text] of source) {
    const out = []
    for (const match of text.matchAll(STATIC_IMPORT_RE)) {
      const spec = match[1] ?? match[2]
      if (!spec) continue
      const resolved = resolveSpecifier(spec, file)
      if (resolved) out.push(resolved)
    }
    edges.set(file, out)
  }

  const rel = (file) => file.replace(`${rootDir}/`, '')
  const cycles = []
  const closers = new Set()
  const checked = []

  for (const registryPath of REGISTRIES) {
    const registry = path.join(rootDir, registryPath)
    if (!existsSync(registry) || !source.has(registry)) continue
    checked.push(registryPath)

    // Breadth-first from each file the registry imports, back to the registry.
    // Shortest route first, because the last hop on it is the edge to make lazy.
    const traceBack = (entry) => {
      const seen = new Set([entry])
      const queue = [[entry, [entry]]]
      while (queue.length) {
        const [file, trail] = queue.shift()
        for (const next of edges.get(file) ?? []) {
          if (next === registry) return [...trail, registry]
          if (!seen.has(next)) {
            seen.add(next)
            queue.push([next, [...trail, next]])
          }
        }
      }
      return null
    }

    for (const entry of edges.get(registry) ?? []) {
      const trail = traceBack(entry)
      if (!trail) continue
      closers.add(rel(trail[trail.length - 2]))
      cycles.push([registryPath, ...trail.map(rel)].join('\n    -> '))
    }
  }

  const unexpected = cycles.filter((trail) => {
    const steps = trail.split('\n    -> ')
    // The closing edge is the step just before the registry the trail ends on.
    return !KNOWN.includes(steps[steps.length - 2])
  })
  const stale = KNOWN.filter((entry) => !closers.has(entry))

  return { cycles, unexpected, stale, checked }
}

// CLI: node scripts/check-import-cycles.mjs
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const { cycles, unexpected, stale, checked } = findRegistryImportCycles(rootDir)

  if (checked.length === 0) {
    console.error(
      '[check-import-cycles] none of the generated registries exist yet. This check runs ' +
        'after the generators - if you are seeing this at prebuild, the generate step did not run.',
    )
    process.exit(1)
  }

  // WARNING, NEVER A FAILURE. Which cycles exist depends on which modules this
  // install has, so an entry that closes a loop in the platform tree may close
  // nothing on a site with a different set - or belong to a module that site
  // does not install at all. Failing on that turns one person's untidied list
  // into a refused build on somebody else's site, which is exactly what core
  // v0.5.1552 did to the filters-for-shop gate: shop's payment registry does
  // not cycle in that composition, and the build was aborted over it. Pruning
  // is a platform-tree job, and lib/modules/import-cycles.test.ts still fails
  // there, where the whole module set is the one the list was written against.
  if (stale.length > 0) {
    console.warn(
      `[check-import-cycles] ${stale.length} entr(y/ies) on the KNOWN list do not cycle in this ` +
        'module set. Nothing to do here - they are pruned in the platform tree, if they no longer ' +
        'cycle there either:\n',
    )
    for (const entry of stale) console.warn(`  ${entry}`)
  }

  if (unexpected.length === 0) {
    console.log(
      `[check-import-cycles] no new registry import cycles across ${checked.length} registr(y/ies) ` +
        `(${cycles.length} known, on the allowed list)`,
    )
    process.exit(0)
  }

  console.error(
    `[check-import-cycles] ${unexpected.length} new import cycle(s) between a generated registry and module code. ` +
      'Turbopack merges a cycle into one scope, where this fails a production build with "Cannot access \'x\' ' +
      'before initialization" - on some module sets and not others. Reach the registry through ' +
      '`await import(...)` inside the consuming function instead of importing it at the top of the file:\n',
  )
  for (const trail of unexpected) console.error(`  ${trail}\n`)
  process.exit(1)
}
