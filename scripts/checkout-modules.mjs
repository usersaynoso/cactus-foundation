#!/usr/bin/env node
/**
 * Clones all modules listed in modules.json into the /modules directory, pinned to the
 * tag recorded in each entry's `version` field (falls back to the repo's default branch
 * HEAD if an entry has no version, e.g. a hand-edited registry).
 *
 * On Vercel: always does a fresh --depth=1 clone at that tag, so the build always gets
 *            exactly the module code the registry says it should - never silently ahead
 *            of it.
 * Locally: tries `git -C <moduleDir> checkout HEAD -- .` first (fast path, no network).
 *          Falls back to a fresh shallow clone at the pinned tag if that fails.
 */

import { readFileSync, mkdirSync, readdirSync, existsSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const modulesDir = join(rootDir, 'modules')

const registryPath = join(rootDir, 'modules.json')
if (!existsSync(registryPath)) {
  console.log('[checkout-modules] No modules.json found — nothing to do.')
  process.exit(0)
}

const registry = JSON.parse(readFileSync(registryPath, 'utf8'))
const entries = registry.modules ?? []

if (entries.length === 0) {
  console.log('[checkout-modules] No modules registered in modules.json.')
  process.exit(0)
}

const isVercel = process.env.VERCEL === '1'

// Clones `repoUrl` into `moduleDir` at `version` (a tag) if given, falling back to the
// default branch HEAD if the pinned clone fails (e.g. the tag was deleted upstream) or
// no version was recorded. Returns true on success.
function cloneModule(name, repoUrl, moduleDir, version) {
  try { rmSync(moduleDir, { recursive: true, force: true }) } catch {}
  mkdirSync(modulesDir, { recursive: true })

  if (version) {
    console.log(`[checkout-modules] ${name}: cloning ${repoUrl} at ${version}…`)
    const pinned = spawnSync('git', ['clone', '--depth=1', '--branch', version, repoUrl, moduleDir], {
      stdio: 'inherit', shell: false,
    })
    if (pinned.status === 0) return true
    console.warn(`[checkout-modules] ${name}: pinned clone at ${version} failed — falling back to HEAD`)
    try { rmSync(moduleDir, { recursive: true, force: true }) } catch {}
  } else {
    console.log(`[checkout-modules] ${name}: no version recorded — cloning ${repoUrl} at HEAD…`)
  }

  const fallback = spawnSync('git', ['clone', '--depth=1', repoUrl, moduleDir], {
    stdio: 'inherit', shell: false,
  })
  return fallback.status === 0
}

for (const { name, repoUrl, version } of entries) {
  if (!name || !repoUrl) {
    console.warn('[checkout-modules] Skipping entry with missing name or repoUrl:', { name, repoUrl })
    continue
  }

  const moduleDir = join(modulesDir, name)

  if (isVercel) {
    if (cloneModule(name, repoUrl, moduleDir, version)) {
      console.log(`[checkout-modules] ${name}: done`)
    } else {
      console.error(`[checkout-modules] ${name}: clone failed — module pages will be missing`)
    }
    continue
  }

  // Local fast path: restore tracked files to HEAD without a network call. This doesn't
  // check the recorded version against what's on disk - it's a no-network convenience
  // for local dev, not the guarantee the pinned clone below provides.
  if (existsSync(moduleDir)) {
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
  }

  if (cloneModule(name, repoUrl, moduleDir, version)) {
    console.log(`[checkout-modules] ${name}: done`)
  } else {
    console.error(`[checkout-modules] ${name}: clone failed — module pages will be missing`)
  }
}
