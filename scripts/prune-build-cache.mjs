#!/usr/bin/env node
/**
 * Keep Vercel's cached dependencies and compilation work within a measured budget.
 * Leave both alone if they fit. Otherwise pack the complete compiler database,
 * then remove only enough untraced packages to fit, tooling first. Drop the whole
 * compiler cache only as a last resort. Never trim its internal database files.
 *
 * Runs after a successful Next build, before Vercel assembles functions from the
 * file traces. Traced packages and Next's adapter dependencies must survive.
 * Armed on Vercel only, or CACTUS_PRUNE_BUILD_CACHE=1; =0 disables pruning.
 * CACTUS_BUILD_CACHE_BUDGET_MB overrides the 1400 MB safety budget. Cleanup cannot
 * fail a successful build. Packed caches are restored by next-build.mjs.
 */

import { existsSync, readdirSync, readFileSync, rmSync } from 'fs'
import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { PACKED_CACHE, packBuildCache, discardBuildCache } from './lib/build-cache.mjs'

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const nodeModules = path.join(rootDir, 'node_modules')
const nextDir = path.join(rootDir, '.next')

const armed = process.env.CACTUS_PRUNE_BUILD_CACHE === '1'
  || (process.env.CACTUS_PRUNE_BUILD_CACHE !== '0' && process.env.VERCEL === '1')

// Vercel's limit is 1.5 GB and it is measured on everything cached together, so
// aim under it rather than at it: the measurement here is of the directories as
// they sit on disk, and what Vercel weighs is its own archive of them.
const BUDGET_MB = Number.isFinite(Number(process.env.CACTUS_BUILD_CACHE_BUDGET_MB)) && Number(process.env.CACTUS_BUILD_CACHE_BUDGET_MB) > 0
  ? Number(process.env.CACTUS_BUILD_CACHE_BUDGET_MB)
  : 1400

/**
 * Scopes whose every member is build-time tooling. Listing the scope rather than
 * its packages keeps this honest as transitive versions come and go - the trace
 * check below is what actually decides, so a scope that turns out to ship
 * something a function needs simply survives.
 */
const BUILD_ONLY_SCOPES = [
  '@types',
  '@typescript-eslint',
  '@eslint',
  '@eslint-community',
  '@vitest',
  '@vitejs',
  '@esbuild',
  '@rollup',
  '@babel',
]

/**
 * Never removed at any stage, whatever the traces say. `next` and its platform
 * binary are the one thing still read after `npm run build` returns: Vercel's Next
 * builder turns `.next` into `.vercel/output` afterwards, and resolves the
 * installed Next to do it. Everything else untraced is fair game at stage 2.
 */
const NEVER_PRUNE = [/^next$/, /^@next\//]

/**
 * Named build-time packages. The Prisma CLI and @prisma/engines are the two big
 * ones: prebuild runs the migration chain through them and nothing at runtime
 * ever loads them - @prisma/client carries its own engine, generated into
 * node_modules/.prisma/client, which is traced and therefore untouchable here.
 */
const BUILD_ONLY_PACKAGES = [
  'prisma',
  '@prisma/engines',
  '@prisma/engines-version',
  '@prisma/fetch-engine',
  '@prisma/get-platform',
  '@prisma/config',
  '@prisma/debug',
  'typescript',
  'eslint',
  'eslint-config-next',
  'vitest',
  'vite',
  'esbuild',
  'rollup',
]

function log(line) {
  console.log(`[prune-build-cache] ${line}`)
}

/** Size of a directory in MB. `du` is a great deal faster than walking 100k files
 *  in Node, and this runs on Linux; anything else just declines to measure. */
function sizeMb(dir) {
  if (!existsSync(dir)) return 0
  const out = spawnSync('du', ['-sk', dir], { encoding: 'utf8' })
  if (out.status !== 0 || !out.stdout) return NaN
  const kb = Number(out.stdout.split('\t')[0])
  return Number.isFinite(kb) ? kb / 1024 : NaN
}

/**
 * Every package named by a file trace, as `name` or `@scope/name`.
 *
 * Trace entries are paths relative to the .nft.json that holds them, so they
 * arrive as `../../../node_modules/foo/index.js`. The first `node_modules/` in the
 * path is the one that matters - a nested copy belongs to whatever package
 * contains it, and that outer package is what gets kept.
 */
function tracedPackages() {
  const traced = new Set()
  let traceFiles = 0

  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch (err) {
      throw new Error(`Cannot inspect file traces: ${err.message}`)
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        // The cache is enormous and holds no traces.
        if (entry.name === 'cache') continue
        walk(full)
      } else if (entry.name.endsWith('.nft.json')) {
        traceFiles++
        let parsed
        try {
          parsed = JSON.parse(readFileSync(full, 'utf8'))
        } catch {
          throw new Error(`Unreadable file trace: ${full}`)
        }
        if (!Array.isArray(parsed.files) || parsed.files.some((file) => typeof file !== 'string')) {
          throw new Error(`Invalid file trace: ${full}`)
        }
        for (const file of parsed.files) {
          const at = file.indexOf('node_modules/')
          if (at < 0) continue
          const rest = file.slice(at + 'node_modules/'.length).split('/')
          traced.add(rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0])
        }
      }
    }
  }
  walk(nextDir)

  return { traced, traceFiles }
}

/** Every installed package, as `name` or `@scope/name`. Dot-directories (.bin,
 *  .prisma, .package-lock.json) are npm's own bookkeeping and are not packages. */
function installedPackages() {
  const names = []
  let entries
  try {
    entries = readdirSync(nodeModules, { withFileTypes: true })
  } catch {
    return names
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    if (!entry.name.startsWith('@')) {
      names.push(entry.name)
      continue
    }
    let members
    try {
      members = readdirSync(path.join(nodeModules, entry.name))
    } catch {
      continue
    }
    for (const member of members) names.push(`${entry.name}/${member}`)
  }
  return names
}

/** Every candidate that exists on disk, scopes expanded to their members. */
function candidates() {
  const found = []
  const add = (name) => {
    if (existsSync(path.join(nodeModules, name))) found.push(name)
  }

  for (const name of BUILD_ONLY_PACKAGES) add(name)

  for (const scope of BUILD_ONLY_SCOPES) {
    const scopeDir = path.join(nodeModules, scope)
    if (!existsSync(scopeDir)) continue
    let members
    try {
      members = readdirSync(scopeDir)
    } catch {
      continue
    }
    for (const member of members) add(`${scope}/${member}`)
  }

  return found
}

async function prune() {
  if (!existsSync(nodeModules)) {
    log('No node_modules - nothing to do.')
    return
  }

  const before = sizeMb(nodeModules) + sizeMb(path.join(nextDir, 'cache'))
  if (!Number.isFinite(before)) {
    log('Could not measure the cache - leaving it alone.')
    return
  }
  if (before <= BUDGET_MB) {
    log(`Footprint ${before.toFixed(0)} MB is under budget ${BUDGET_MB} MB - keeping dependencies and compilation cache.`)
    return
  }
  // Preserve the WHOLE compiler database. Compression is reversible and can
  // avoid both a cold compile and the dependency reinstall the old policy caused.
  try {
    await packBuildCache(rootDir, log)
  } catch (err) {
    log(`Could not pack compilation cache: ${err.message}; continuing with the measured cleanup policy.`)
  }
  let after = sizeMb(nodeModules) + sizeMb(path.join(nextDir, 'cache'))
  if (!Number.isFinite(after) || after <= BUDGET_MB) {
    log(`Keeping dependencies; footprint after packing ${after.toFixed(0)} MB.`)
    return
  }
  const { traced, traceFiles } = tracedPackages()

  // No traces means the build produced no file traces to check against, which is
  // not a licence to delete things on a guess.
  if (traceFiles === 0 || traced.size === 0) {
    log('No file traces found - leaving node_modules alone.')
    return
  }

  log(`${traced.size} packages traced into the deployed functions across ${traceFiles} trace files.`)

  const cacheDir = path.join(nextDir, 'cache')
  const turbopackDir = path.join(cacheDir, 'turbopack')
  const footprint = () => sizeMb(nodeModules) + sizeMb(cacheDir)

  // If even removing every eligible dependency cannot retain the compiler,
  // discard it BEFORE sacrificing the dependencies as well. This is the old
  // policy's worst case: a cold install followed by a cold compile, every time.
  const removable = installedPackages().filter((name) =>
    !traced.has(name) && !NEVER_PRUNE.some((pattern) => pattern.test(name)))
  const reclaimable = removable.reduce((total, name) => total + sizeMb(path.join(nodeModules, name)), 0)
  const compilerMb = sizeMb(turbopackDir) + sizeMb(path.join(cacheDir, PACKED_CACHE))
  if (Number.isFinite(reclaimable) && after - reclaimable > BUDGET_MB && compilerMb > 0) {
    await discardBuildCache(rootDir)
    after = footprint()
    log(`Even the packed compiler cannot fit beside required packages - discarded it before pruning dependencies. Footprint ${after.toFixed(0)} MB.`)
    if (!Number.isFinite(after) || after <= BUDGET_MB) return
  }

  /** Remove these packages, skipping anything traced or protected. Returns how
   *  many went. */
  const remove = (names) => {
    let gone = 0
    let remaining = footprint()
    for (const name of names) {
      if (!Number.isFinite(remaining) || remaining <= BUDGET_MB) break
      if (traced.has(name)) continue
      if (NEVER_PRUNE.some((pattern) => pattern.test(name))) continue
      try {
        const mb = sizeMb(path.join(nodeModules, name))
        if (!Number.isFinite(mb)) break
        rmSync(path.join(nodeModules, name), { recursive: true, force: true })
        remaining -= mb
        gone++
      } catch (err) {
        log(`Could not remove ${name}: ${err.message}`)
      }
    }
    return gone
  }

  // Stages 1 and 2 stop as soon as the budget is met.
  const stage1 = remove(candidates())
  after = footprint()
  if (!Number.isFinite(after)) {
    log('Could not measure the cache - stopping after the build-only packages.')
    return
  }
  log(
    `Stage 1: removed ${stage1} build-only packages. `
    + `Footprint ${before.toFixed(0)} MB → ${after.toFixed(0)} MB (budget ${BUDGET_MB} MB).`
  )
  if (after <= BUDGET_MB) {
    log('Under budget - keeping the remaining dependencies and compilation cache.')
    return
  }

  // Stage 2: other untraced packages, stopping as soon as the budget is met.
  const stage2 = remove(installedPackages())
  after = footprint()
  log(
    `Stage 2: over budget, so removed ${stage2} more packages that no trace mentions. `
    + `Footprint now ${after.toFixed(0)} MB. The next build reinstalls the removed packages.`
  )
  if (after <= BUDGET_MB) {
    log('Under budget.')
    return
  }

  // Stage 3: the compile cache, the dearest thing here and so the last to go.
  if (!existsSync(turbopackDir) && !existsSync(path.join(cacheDir, PACKED_CACHE))) {
    log('Still over budget and there is no Turbopack cache to drop. Vercel may invalidate this cache.')
    return
  }
  const turbopackMb = sizeMb(turbopackDir) + sizeMb(path.join(cacheDir, PACKED_CACHE))
  try {
    await discardBuildCache(rootDir)
  } catch (err) {
    log(`Still over budget and could not drop the Turbopack cache: ${err.message}`)
    return
  }
  log(
    `Stage 3: still over by ${(after - BUDGET_MB).toFixed(0)} MB - dropped the Turbopack cache `
    + `(${turbopackMb.toFixed(0)} MB). The next build compiles from cold, but the cache it `
    + 'restores is a kept one rather than an invalidated one.'
  )
}

if (!armed) {
  log('Not armed (not Vercel) - leaving node_modules and .next/cache alone.')
} else {
  try {
    await prune()
  } catch (err) {
    // A build that has already succeeded must not be failed by its own cleanup.
    log(`Skipped: ${err.message}`)
  }
}
