#!/usr/bin/env node
/**
 * Ensures all git submodule working trees have their files populated.
 *
 * Vercel creates the module directory tree (directories exist) but does not
 * fully initialise git submodules, so blob objects (files) are absent.
 * readdirSync shows directories but not files, leaving the router generator
 * with 0 pages.
 *
 * Strategy per module:
 *   1. Try `git -C <moduleDir> checkout HEAD -- .` (fast path for normal envs).
 *   2. If that fails (no valid git repo), fall back to a fresh shallow clone
 *      at the pinned commit SHA from the parent repo's index.
 */

import { readFileSync, readdirSync, existsSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync, execFileSync } from 'child_process'

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

function getPinnedSha(submodulePath) {
  try {
    const out = execFileSync('git', ['ls-tree', 'HEAD', submodulePath], {
      cwd: rootDir, encoding: 'utf8',
    })
    const match = out.match(/160000 commit ([0-9a-f]+)/)
    return match ? match[1] : null
  } catch {
    return null
  }
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

  const stderr = checkout.stderr?.toString().trim()
  console.log(`[checkout-modules] ${name}: checkout failed (${checkout.status})${stderr ? ': ' + stderr : ''} — falling back to fresh clone`)

  const url = urlMap[submodulePath]
  const sha = getPinnedSha(submodulePath)

  if (!url) { console.error(`[checkout-modules] ${name}: no URL in .gitmodules — skipping`); continue }
  if (!sha) { console.error(`[checkout-modules] ${name}: could not read pinned SHA — skipping`); continue }

  console.log(`[checkout-modules] ${name}: cloning ${url} at ${sha.slice(0, 10)}…`)

  try { rmSync(moduleDir, { recursive: true, force: true }) } catch {}

  const clone = spawnSync('git', ['clone', '--no-single-branch', url, moduleDir], {
    stdio: 'inherit', shell: false,
  })
  if (clone.status !== 0) {
    console.error(`[checkout-modules] ${name}: clone failed — module pages will be missing`)
    continue
  }

  const co = spawnSync('git', ['-C', moduleDir, 'checkout', sha], {
    stdio: 'inherit', shell: false,
  })
  if (co.status !== 0) {
    console.log(`[checkout-modules] ${name}: detached checkout failed — trying fetch`)
    spawnSync('git', ['-C', moduleDir, 'fetch', 'origin', sha], { stdio: 'inherit', shell: false })
    spawnSync('git', ['-C', moduleDir, 'checkout', sha], { stdio: 'inherit', shell: false })
  }

  console.log(`[checkout-modules] ${name}: done`)
}
