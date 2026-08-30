#!/usr/bin/env node
/**
 * Rolls the build-gate workflow out to every module checkout under /modules.
 *
 * Modules are separate repos, so the gate cannot be added once and inherited: each
 * one needs the three-line caller that invokes core's reusable workflow. This
 * writes that file, reports what changed, and stops there - committing and pushing
 * 30-odd repos is not something a script should decide to do.
 *
 *   node scripts/install-module-ci.mjs            # write into every module
 *   node scripts/install-module-ci.mjs --check    # report drift, change nothing
 *   node scripts/install-module-ci.mjs unified-inbox [more…]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const modulesDir = join(rootDir, 'modules')
const template = readFileSync(join(rootDir, 'scripts/ci/templates/build-gate.yml'), 'utf8')

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const named = args.filter((a) => !a.startsWith('--'))

const candidates = (named.length > 0 ? named : readdirSync(modulesDir))
  .filter((name) => existsSync(join(modulesDir, name, 'cactus.module.json')))

if (candidates.length === 0) {
  console.error('[install-module-ci] No module checkouts found under /modules - run a build first.')
  process.exit(1)
}

const written = []
const drifted = []
const unchanged = []

for (const name of candidates) {
  const target = join(modulesDir, name, '.github/workflows/build-gate.yml')
  const current = existsSync(target) ? readFileSync(target, 'utf8') : null

  if (current === template) {
    unchanged.push(name)
    continue
  }
  if (checkOnly) {
    drifted.push(current === null ? `${name} (missing)` : `${name} (out of date)`)
    continue
  }
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, template)
  written.push(name)
}

if (unchanged.length > 0) console.log(`[install-module-ci] up to date: ${unchanged.length}`)
if (written.length > 0) console.log(`[install-module-ci] written: ${written.join(', ')}`)
if (drifted.length > 0) {
  console.log(`[install-module-ci] needs the gate: ${drifted.join(', ')}`)
  process.exit(1)
}
if (written.length === 0 && drifted.length === 0) console.log('[install-module-ci] nothing to do.')
