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
 *   1. Try `git -C <moduleDir> checkout HEAD -- .` (fast path for normal envs).
 *   2. If that fails (no valid git repo at moduleDir), fall back to a fresh
 *      shallow clone of the module URL from .gitmodules.
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

for (const name of moduleNames) {
  const moduleDir = join(modulesDir, name)
  const submodulePath = `modules/${name}`

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
  console.log(`[checkout-modules] ${name}: falling back to fresh clone`)

  const url = urlMap[submodulePath]
  if (!url) {
    console.error(`[checkout-modules] ${name}: no URL in .gitmodules — skipping`)
    continue
  }

  console.log(`[checkout-modules] ${name}: cloning ${url}…`)
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
