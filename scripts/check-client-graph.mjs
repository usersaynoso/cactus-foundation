#!/usr/bin/env node
/**
 * Fails the build if any 'use client' file can reach server-only code through
 * its import graph — static imports, re-exports and dynamic `import()` alike,
 * because the bundler follows all three. `import type` is erased, so it is the
 * one edge that genuinely costs nothing.
 *
 * This runs at prebuild, after checkout-modules and the generators, because
 * that is the only moment the real thing exists: THIS install's pinned module
 * versions, assembled together, plus the generated files that wire them up.
 * Core's own test suite can only ever check the module checkouts sitting on one
 * developer's disk.
 *
 * It exists because the failure it catches is invisible to `tsc` and `eslint`:
 * the types line up, the lint is clean, and the first sign of trouble is a
 * production build dying with two dozen "Module not found: Can't resolve 'fs'"
 * errors on a customer's install. That happened on 2026-08-19 — a client
 * component imported `productHref` from shop's product-url, that file held a
 * dynamic import of the shop config, config reaches the payment registry, the
 * registry reaches every module's extension points, and sharp, nodemailer,
 * cloudinary and next/headers all landed in the browser bundle. One import
 * edge, twenty-seven build errors, a live site stuck on the old version.
 *
 * Failing here costs seconds and names the exact edge; failing in Turbopack
 * costs a minute and names twenty-seven symptoms.
 */

import { readdirSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const SOURCE_DIRS = ['lib', 'modules', 'app']
const EXTS = ['.ts', '.tsx', '.js', '.jsx']

// Things that can only ever run on a server. Reaching any of them from a client
// file is the defect, whichever one the bundler happens to complain about.
const SERVER_ONLY = [
  '@/lib/db/prisma',
  '@/lib/modules/extension-points',
  'sharp',
  'nodemailer',
  'cloudinary',
  'next/headers',
  'server-only',
]

const IMPORT_RE =
  /(?:^|\n)\s*import\s+(?!type\b)[^'"\n]*from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|(?:^|\n)\s*export\s+(?!type\b)[^'"\n]*from\s*['"]([^'"]+)['"]/g

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
 * @returns {string[]} one formatted trail per leaking client file, shortest route first
 */
export function findClientGraphLeaks(rootDir) {
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

  const specifiersIn = (file) => {
    const text = source.get(file) ?? ''
    const out = []
    for (const match of text.matchAll(IMPORT_RE)) {
      const spec = match[1] ?? match[2] ?? match[3]
      if (spec) out.push(spec)
    }
    return out
  }

  // Breadth-first, so the trail reported is the shortest route to the sink —
  // which is the edge actually worth deleting.
  const traceToServerOnly = (entry) => {
    const seen = new Set([entry])
    const queue = [[entry, [entry]]]
    while (queue.length) {
      const [file, trail] = queue.shift()
      for (const spec of specifiersIn(file)) {
        if (SERVER_ONLY.includes(spec)) return [...trail, spec]
        const resolved = resolveSpecifier(spec, file)
        if (resolved && !seen.has(resolved)) {
          seen.add(resolved)
          queue.push([resolved, [...trail, resolved]])
        }
      }
    }
    return null
  }

  const leaks = []
  for (const [file, text] of source) {
    if (!/^\s*['"]use client['"]/m.test(text.slice(0, 400))) continue
    const trail = traceToServerOnly(file)
    if (trail) leaks.push(trail.map((step) => step.replace(`${rootDir}/`, '')).join('\n    -> '))
  }
  return leaks
}

// CLI: node scripts/check-client-graph.mjs
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const leaks = findClientGraphLeaks(rootDir)
  if (leaks.length === 0) {
    console.log('[check-client-graph] no client component reaches server-only code')
    process.exit(0)
  }
  console.error(
    `[check-client-graph] ${leaks.length} client file(s) reach server-only code. ` +
      'Every step below is an edge the bundler follows - a dynamic import() counts, only `import type` does not:\n',
  )
  for (const leak of leaks) console.error(`  ${leak}\n`)
  process.exit(1)
}
