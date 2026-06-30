#!/usr/bin/env node
/**
 * Ensures all git submodule working trees have their files populated.
 *
 * Vercel creates the module directory tree (directories exist) but does not
 * fully initialise git submodules, so blob objects (files) are absent.
 * readdirSync shows directories but no files, leaving the router generator
 * with 0 pages.
 *
 * Strategy per module:
 *   On Vercel (VERCEL=1): always do a fresh --depth=1 clone from .gitmodules
 *     so the build always gets the latest committed module code.
 *   Locally: try `git -C <moduleDir> checkout HEAD -- .` (fast path).
 *     If that fails, fall back to a fresh shallow clone from .gitmodules.
 */

import { readFileSync, readdirSync, existsSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const modulesDir = join(rootDir, 'modules')

if (!existsSync(modulesDir)) {
  console.log('[checkout-modules] No modules/ directory — nothing to do.')
  process.exit(0)
}

const moduleNames = readdirSync(modulesDir, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => e.name)

if (moduleNames.length === 0) {
  console.log('[checkout-modules] No module directories found.')
  process.exit(0)
}

function parseGitmodules() {
  const path = join(rootDir, '.gitmodules')
  if (!existsSync(path)) return {}
  const content = readFileSync(path, 'utf8')
  const map = {}
  const re = /\[submodule "([^"]+)"\][^\[]*url\s*=\s*(.+)/g
  let m
  while ((m = re.exec(content)) !== null) {
    map[m[1]] = m[2].trim()
  }
  return map
}

const urlMap = parseGitmodules()
const isVercel = process.env.VERCEL === '1'

for (const name of moduleNames) {
  const moduleDir = join(modulesDir, name)
  const submodulePath = `modules/${name}`
  const url = urlMap[submodulePath]

  if (isVercel && url) {
    // On Vercel, always clone fresh so we get the latest published module code.
    console.log(`[checkout-modules] ${name}: Vercel build — cloning ${url}…`)
    try { rmSync(moduleDir, { recursive: true, force: true }) } catch {}

    const clone = spawnSync('git', ['clone', '--depth=1', url, moduleDir], {
      stdio: 'inherit', shell: false,
    })

    if (clone.status !== 0) {
      console.error(`[checkout-modules] ${name}: clone failed — module pages will be missing`)
    } else {
      console.log(`[checkout-modules] ${name}: done`)
    }
    continue
  }

  // Local fast path: restore tracked files to HEAD without a network call.
  console.log(`[checkout-modules] ${name}: attempting git checkout HEAD -- .`)
  const checkout = spawnSync('git', ['-C', moduleDir, 'checkout', 'HEAD', '--', '.'], {
    stdio: 'pipe', shell: false,
  })

  if (checkout.status === 0) {
    console.log(`[checkout-modules] ${name}: checkout succeeded`)
    continue
  }

  const stderr = checkout.stderr?.toString().trim().split('\n')[0] ?? ''
  console.log(`[checkout-modules] ${name}: checkout failed — ${stderr}`)

  if (!url) {
    console.error(`[checkout-modules] ${name}: no URL in .gitmodules — skipping`)
    continue
  }

  console.log(`[checkout-modules] ${name}: falling back to fresh clone`)
  try { rmSync(moduleDir, { recursive: true, force: true }) } catch {}

  const clone = spawnSync('git', ['clone', '--depth=1', url, moduleDir], {
    stdio: 'inherit', shell: false,
  })

  if (clone.status !== 0) {
    console.error(`[checkout-modules] ${name}: clone failed — module pages will be missing`)
    continue
  }

  console.log(`[checkout-modules] ${name}: done`)
}
