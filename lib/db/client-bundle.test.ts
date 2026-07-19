import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, dirname, resolve } from 'path'

// ---------------------------------------------------------------------------
// Prisma must never reach the browser bundle.
//
// lib/db/prisma.ts calls Prisma.defineExtension() at module scope. In a browser
// that throws immediately - "Extensions.defineExtension is unable to run in this
// browser environment" - and because it fails at module-evaluation time it takes
// down the entire page, not merely the component that pulled it in.
//
// It only takes one `'use client'` file with a *value* import of a server module
// to do it. Type-only imports are erased by the compiler and are always fine;
// the trap is importing something real (a constant, a schema, a helper) from a
// file that happens to import prisma several hops further down. Both incidents
// so far were exactly that shape:
//
//   - product-3d-views-for-shop's settings tab imported P3D_CONFIG_DEFAULTS from
//     a prisma-importing config module, which killed /cactus-admin/config.
//   - boards' SubBoardList Puck block had no separate .rsc file, so the editor
//     registry imported the database-backed render straight into the page
//     builder's client bundle.
//
// Neither is caught by tsc, eslint or the build - they are all perfectly valid
// code. This test walks the real import graph instead, so the next one fails
// here rather than on a live site.
// ---------------------------------------------------------------------------

const ROOT = resolve(__dirname, '..', '..')
const PRISMA_MODULE = join(ROOT, 'lib/db/prisma.ts')

// Scanned roots. `modules/` is gitignored and cloned at build time, so it is
// simply absent on a fresh checkout - missing directories are skipped rather
// than failed, which keeps this honest about what it could actually see.
const SCAN_DIRS = ['app', 'components', 'lib', 'modules']
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.vercel', '.claude', 'dist'])

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

function resolveSpecifier(spec: string, importer: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = join(ROOT, spec.slice(2))
  else if (spec.startsWith('.')) base = resolve(dirname(importer), spec)
  else return null // bare package - not our source tree
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const candidate = base + ext
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return existsSync(base) && statSync(base).isFile() ? base : null
}

/**
 * Specifiers this file pulls in at runtime. Deliberately excludes anything the
 * compiler erases: `import type ... from`, `export type ... from`, and named
 * clauses where every specifier carries its own `type` keyword.
 *
 * `import` is anchored to the start of a line and the clause may not contain a
 * quote, which is what stops the matcher pairing one statement's `import` with a
 * later statement's `from` and inventing edges that do not exist.
 */
function runtimeImports(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  const specs: string[] = []

  const withClause = /^[ \t]*(?:import|export)[ \t]+(type[ \t]+)?([^'"]*?)[ \t\n\r]*from[ \t]*['"]([^'"]+)['"]/gm
  let m: RegExpExecArray | null
  while ((m = withClause.exec(src))) {
    if (m[1]) continue // `import type X from` / `export type { X } from`
    const clause = (m[2] ?? '').trim()
    const named = clause.match(/^\{([\s\S]*)\}$/)
    if (named) {
      const parts = (named[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      // `import { type A, type B } from '...'` is fully erased too.
      if (parts.length > 0 && parts.every((p) => /^type\s/.test(p))) continue
    }
    if (m[3]) specs.push(m[3])
  }

  // Bare side-effect imports: `import './thing'`.
  const sideEffect = /^[ \t]*import[ \t]*['"]([^'"]+)['"]/gm
  while ((m = sideEffect.exec(src))) {
    if (m[1]) specs.push(m[1])
  }

  return specs
}

/** Shortest import chain from `file` to prisma, or null if it cannot reach it. */
function chainToPrisma(file: string, seen = new Set<string>(), trail: string[] = []): string[] | null {
  if (file === PRISMA_MODULE) return [...trail, file]
  if (seen.has(file)) return null
  seen.add(file)
  for (const spec of runtimeImports(file)) {
    const target = resolveSpecifier(spec, file)
    if (!target) continue
    const found = chainToPrisma(target, seen, [...trail, file])
    if (found) return found
  }
  return null
}

function isClientComponent(file: string): boolean {
  // The directive must be the first statement, so only the opening lines matter.
  const head = readFileSync(file, 'utf8').split('\n').slice(0, 5).join('\n')
  return /^\s*['"]use client['"]/m.test(head)
}

const rel = (p: string) => p.replace(`${ROOT}/`, '')

describe('client bundle', () => {
  it('has no client component that can reach lib/db/prisma', () => {
    const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))
    // A guard that silently scanned nothing would pass forever.
    expect(files.length).toBeGreaterThan(0)

    const offenders: string[] = []
    for (const file of files) {
      if (!isClientComponent(file)) continue
      const chain = chainToPrisma(file)
      if (chain) offenders.push(chain.map(rel).join('\n     -> '))
    }

    expect(
      offenders,
      offenders.length === 0
        ? ''
        : `Prisma is reachable from ${offenders.length} client component(s). ` +
          'Split the value import out into a database-free module (or make it `import type`):\n\n  ' +
          offenders.join('\n\n  ') +
          '\n'
    ).toEqual([])
  })
})
