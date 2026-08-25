import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import path from 'path'

// The import edge this whole split exists to prevent.
//
// lib/puck/module-components.ts statically imports all 118 module block CLIENT
// components. lib/puck/config.rsc.tsx is what every public page renders through
// (app/(public)/layout.tsx, lib/puck/renderInfoPage.tsx). While config.rsc
// imported lib/puck/config.tsx - which held the module map - every visitor to
// every page downloaded every installed module's client code: 3D viewers,
// abandoned-cart trackers, product checks, quote forms. 690KB of compressed
// JavaScript on a homepage showing eleven images.
//
// None of it was ever used there. All 118 blocks ship an RSC half and
// config.rsc.tsx overrides every one, so the client components were dead weight
// held alive purely by the import.
//
// tsc and eslint cannot see this: the types line up, the lint is clean, and the
// only symptom is a slow site. Hence a test. Same reasoning as
// scripts/check-client-graph.mjs, which guards the mirror-image leak.

const ROOT = path.join(__dirname, '..', '..')
const MODULE_MAP = path.join(ROOT, 'lib', 'puck', 'module-components.ts')

const EXTS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx']

function resolveSpecifier(spec: string, fromFile: string): string | null {
  // Only first-party code. A bare package name is somebody else's problem.
  let base: string
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2))
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec)
  else return null

  for (const ext of EXTS) {
    if (existsSync(base + ext)) return base + ext
  }
  if (existsSync(base) && !existsSync(base + '.ts')) {
    for (const ext of EXTS) {
      const idx = path.join(base, 'index' + ext)
      if (existsSync(idx)) return idx
    }
  }
  return existsSync(base) ? base : null
}

// Static imports, re-exports and dynamic import() alike - the bundler follows
// all three. `import type` is erased at compile time, so it is the one edge that
// genuinely costs nothing and is deliberately not followed here.
function specifiersIn(source: string): string[] {
  const out: string[] = []
  const statement = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?[^;\n]*?from\s*['"]([^'"]+)['"]/g
  for (const m of source.matchAll(statement)) {
    if (m[1]) continue
    if (m[2]) out.push(m[2])
  }
  for (const m of source.matchAll(/(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g)) if (m[1]) out.push(m[1])
  for (const m of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) if (m[1]) out.push(m[1])
  return out
}

function reaches(entry: string, target: string): string[] | null {
  const seen = new Set<string>()
  const stack: Array<{ file: string; trail: string[] }> = [{ file: entry, trail: [entry] }]

  while (stack.length > 0) {
    const { file, trail } = stack.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    if (file === target) return trail
    if (!existsSync(file) || file.includes('node_modules')) continue

    let source: string
    try {
      source = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const spec of specifiersIn(source)) {
      const resolved = resolveSpecifier(spec, file)
      if (resolved && !seen.has(resolved)) stack.push({ file: resolved, trail: [...trail, resolved] })
    }
  }
  return null
}

const rel = (p: string) => path.relative(ROOT, p)

describe('the published render path does not drag in the module block client map', () => {
  it('config.rsc.tsx cannot reach module-components.ts', () => {
    const trail = reaches(path.join(ROOT, 'lib', 'puck', 'config.rsc.tsx'), MODULE_MAP)
    expect(trail === null ? null : trail.map(rel).join('\n  -> ')).toBeNull()
  })

  it('the public layout cannot reach module-components.ts', () => {
    const layout = path.join(ROOT, 'app', '(public)', 'layout.tsx')
    expect(existsSync(layout)).toBe(true)
    const trail = reaches(layout, MODULE_MAP)
    expect(trail === null ? null : trail.map(rel).join('\n  -> ')).toBeNull()
  })

  it('renderInfoPage cannot reach module-components.ts', () => {
    const entry = path.join(ROOT, 'lib', 'puck', 'renderInfoPage.tsx')
    expect(existsSync(entry)).toBe(true)
    expect(reaches(entry, MODULE_MAP)).toBeNull()
  })

  // Guards the guard. If the walker stopped resolving anything - a changed alias,
  // a rename, a broken regex - every assertion above would pass while proving
  // nothing at all. The editor genuinely does need all 118 blocks, so this edge
  // must exist, and finding it is what shows the walker still works.
  it('still finds the edge where it is supposed to be (config.tsx, the editor)', () => {
    const trail = reaches(path.join(ROOT, 'lib', 'puck', 'config.tsx'), MODULE_MAP)
    expect(trail).not.toBeNull()
  })
})
