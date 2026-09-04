#!/usr/bin/env node
/**
 * Keeps what Vercel saves as the build cache under Vercel's size limit.
 *
 * Vercel caches `node_modules` and `.next/cache` between deployments, and refuses
 * to keep the result once it goes over 1.5 GB:
 *
 *     Build cache size 2.04 GB exceeds limit of 1.50 GB. Invalidating cache.
 *     Cache invalidated
 *
 * That is not a warning about the next build being slightly slower. The WHOLE
 * cache goes, so the deploy after it pays a cold `npm install` (~30s), a cold
 * Turbopack compile (~180s instead of ~35s) and a full re-upload of every output
 * chunk, because none of them dedupe against a previous deployment. On this site
 * it was costing about two and a half minutes on roughly every other deploy.
 *
 * The cycle is self-sustaining and easy to read in the deployment logs: a cold
 * build writes ~1.33 GB and fits; the warm build after it merges the restored
 * Turbopack cache with its own new entries, lands somewhere between 1.7 and
 * 2.1 GB, and is thrown away; the next one is cold again.
 *
 * So this runs after a successful `next build` and gives the cache a haircut, in
 * the order that costs the least. What each stage is worth to the next deploy is
 * the whole basis of the order: a warm node_modules saves an `npm install`, about
 * 30 seconds, and a warm Turbopack cache saves up to 145 seconds of compile. So
 * node_modules is spent first and the compile cache is spent last.
 *
 *   1. Build-only packages out of node_modules. The Prisma CLI and its engines,
 *      TypeScript, ESLint, Vitest and the toolchain they drag in are needed to
 *      PRODUCE the build and never appear in it. About 200 MB, and it costs the
 *      next build only the seconds npm takes to fetch them again.
 *   2. If that is not enough: everything else in node_modules that no trace
 *      mentions. Nothing here can affect the deployed site - a package no trace
 *      names is not copied into any function, so it was never going to run - and
 *      the next build reinstalls it. This is most of an `npm install`, ~30s, paid
 *      to keep something worth five times that.
 *   3. If it is STILL over: the Turbopack cache, the last thing left and the
 *      dearest. A build that starts with node_modules warm and compiles cold
 *      still beats one that starts cold twice over.
 *
 * No stage guesses. `next build` has already written the file traces
 * (`.next/**\/*.nft.json`) that say exactly which files Vercel will copy into the
 * deployed functions, so a package is only removed when it appears in none of
 * them. Anything traced is left alone, whatever the lists below say - see draco3d
 * and @sparticuz/chromium in next.config.ts for what happens when a runtime file
 * is not where the function expects it.
 *
 * Timing matters and is the reason this is here rather than earlier: the traces
 * are only written when the build finishes, and Vercel assembles
 * `.vercel/output` from node_modules AFTER `npm run build` returns. Nothing
 * traced may be removed, and nothing may be removed before `next build` is done.
 *
 * Armed on Vercel only - a developer's node_modules is not a build cache and
 * deleting their TypeScript would be its own bug. CACTUS_PRUNE_BUILD_CACHE=1
 * arms it anywhere, =0 disarms it, and CACTUS_BUILD_CACHE_BUDGET_MB moves the
 * budget. Both are env-var-only changes, so if this ever needs taking out of the
 * picture on a live site it ships through a redeploy rather than a code change.
 *
 * Nothing in here is allowed to fail a build that has already succeeded.
 */

import { existsSync, readdirSync, readFileSync, rmSync } from 'fs'
import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const nodeModules = path.join(rootDir, 'node_modules')
const nextDir = path.join(rootDir, '.next')

const armed = process.env.CACTUS_PRUNE_BUILD_CACHE === '1'
  || (process.env.CACTUS_PRUNE_BUILD_CACHE !== '0' && process.env.VERCEL === '1')

// Vercel's limit is 1.5 GB and it is measured on everything cached together, so
// aim under it rather than at it: the measurement here is of the directories as
// they sit on disk, and what Vercel weighs is its own archive of them.
const BUDGET_MB = Number(process.env.CACTUS_BUILD_CACHE_BUDGET_MB) > 0
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
 * arrive as `../../../node_modules/foo/index.js`. The last `node_modules/` in the
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
    } catch {
      return
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
          continue
        }
        for (const file of parsed.files ?? []) {
          const at = file.lastIndexOf('node_modules/')
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

function prune() {
  if (!existsSync(nodeModules)) {
    log('No node_modules - nothing to do.')
    return
  }

  const before = sizeMb(nodeModules) + sizeMb(path.join(nextDir, 'cache'))
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

  /** Remove these packages, skipping anything traced or protected. Returns how
   *  many went. */
  const remove = (names) => {
    let gone = 0
    for (const name of names) {
      if (traced.has(name)) continue
      if (NEVER_PRUNE.some((pattern) => pattern.test(name))) continue
      try {
        rmSync(path.join(nodeModules, name), { recursive: true, force: true })
        gone++
      } catch (err) {
        log(`Could not remove ${name}: ${err.message}`)
      }
    }
    return gone
  }

  // Stage 1: the build's own toolchain, always, whether it is needed to fit or
  // not - it is nearly free to reinstall and there is no reason to carry it.
  const stage1 = remove(candidates())
  let after = footprint()
  if (!Number.isFinite(after)) {
    log('Could not measure the cache - stopping after the build-only packages.')
    return
  }
  log(
    `Stage 1: removed ${stage1} build-only packages. `
    + `Footprint ${before.toFixed(0)} MB → ${after.toFixed(0)} MB (budget ${BUDGET_MB} MB).`
  )
  if (after <= BUDGET_MB) {
    log('Under budget - Vercel will keep this cache, node_modules and compile cache both.')
    return
  }

  // Stage 2: everything else no function will ever load. Costs the next build an
  // install; saves it a compile, which is worth several times more.
  const stage2 = remove(installedPackages())
  after = footprint()
  log(
    `Stage 2: over budget, so removed ${stage2} more packages that no trace mentions. `
    + `Footprint now ${after.toFixed(0)} MB. The next build reinstalls them (~30s) and `
    + 'keeps its compile cache, which is the better half of the trade.'
  )
  if (after <= BUDGET_MB) {
    log('Under budget.')
    return
  }

  // Stage 3: the compile cache, the dearest thing here and so the last to go.
  if (!existsSync(turbopackDir)) {
    log('Still over budget and there is no Turbopack cache to drop. Vercel may invalidate this cache.')
    return
  }
  const turbopackMb = sizeMb(turbopackDir)
  try {
    rmSync(turbopackDir, { recursive: true, force: true })
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
    prune()
  } catch (err) {
    // A build that has already succeeded must not be failed by its own cleanup.
    log(`Skipped: ${err.message}`)
  }
}
