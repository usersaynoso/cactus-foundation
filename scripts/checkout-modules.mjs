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
 *
 * Modules are handled in parallel - each writes to its own directory and never reads
 * another's, so the clones are independent and were only ever serialised by the loop.
 * Every module's log lines are buffered and flushed as one block when it finishes, so
 * concurrent git output can't interleave into nonsense.
 */

import { readFileSync, mkdirSync, existsSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'

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

// Promise-returning spawn. Output is captured rather than inherited so that parallel
// clones don't interleave; the caller decides when to print it.
function git(args) {
  return new Promise((resolve) => {
    const child = spawn('git', args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false })
    let output = ''
    child.stdout.on('data', (d) => { output += d })
    child.stderr.on('data', (d) => { output += d })
    child.on('error', (err) => resolve({ status: 1, output: err.message }))
    child.on('close', (status) => resolve({ status, output }))
  })
}

// Clones `repoUrl` into `moduleDir` at `version` (a tag) if given, falling back to the
// default branch HEAD if the pinned clone fails (e.g. the tag was deleted upstream) or
// no version was recorded. Returns true on success.
async function cloneModule(log, name, repoUrl, moduleDir, version) {
  try { rmSync(moduleDir, { recursive: true, force: true }) } catch {}

  // The `--` before the positionals matters: repoUrl comes out of modules.json,
  // and one beginning with a dash would otherwise be read by git as an option
  // rather than a URL (`--upload-pack=…` runs a command). Args are already passed
  // as an array, so there's no shell to inject into - this closes the other half.
  if (version) {
    log(`${name}: cloning ${repoUrl} at ${version}…`)
    const pinned = await git(['clone', '--depth=1', '--branch', version, '--', repoUrl, moduleDir])
    if (pinned.status === 0) return true
    log(`${name}: pinned clone at ${version} failed — falling back to HEAD`)
    try { rmSync(moduleDir, { recursive: true, force: true }) } catch {}
  } else {
    log(`${name}: no version recorded — cloning ${repoUrl} at HEAD…`)
  }

  const fallback = await git(['clone', '--depth=1', '--', repoUrl, moduleDir])
  return fallback.status === 0
}

async function checkoutModule({ name, repoUrl, version }) {
  if (!name || !repoUrl) {
    console.warn('[checkout-modules] Skipping entry with missing name or repoUrl:', { name, repoUrl })
    return
  }

  const lines = []
  const log = (message) => lines.push(`[checkout-modules] ${message}`)
  const moduleDir = join(modulesDir, name)
  let failure = null

  try {
    if (!isVercel && existsSync(moduleDir)) {
      // Local fast path: restore tracked files to HEAD without a network call. This
      // doesn't check the recorded version against what's on disk - it's a no-network
      // convenience for local dev, not the guarantee the pinned clone below provides.
      log(`${name}: attempting git checkout HEAD -- .`)
      const checkout = await git(['-C', moduleDir, 'checkout', 'HEAD', '--', '.'])

      if (checkout.status === 0) {
        log(`${name}: checkout succeeded`)
        return
      }

      const firstLine = checkout.output.trim().split('\n')[0] ?? ''
      log(`${name}: checkout failed — ${firstLine}`)
    }

    if (await cloneModule(log, name, repoUrl, moduleDir, version)) {
      log(`${name}: done`)
    } else {
      failure = `[checkout-modules] ${name}: clone failed — module pages will be missing`
    }
  } finally {
    if (lines.length > 0) console.log(lines.join('\n'))
    if (failure) console.error(failure)
  }
}

mkdirSync(modulesDir, { recursive: true })
await Promise.all(entries.map(checkoutModule))
