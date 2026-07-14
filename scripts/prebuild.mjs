#!/usr/bin/env node
/**
 * Prebuild orchestrator — everything that has to happen before `next build`.
 *
 * These steps used to be a serial `&&` chain in package.json, which is only half
 * the story: the real dependency graph is a fan-out, not a line. Module code must
 * land on disk first (everything downstream reads it), but after that the three
 * branches never touch each other's inputs or outputs:
 *
 *   checkout-modules
 *        ├── prisma generate                     (writes node_modules/@prisma/client)
 *        ├── build-migrate → sync-module-manifests  (talks to the database)
 *        └── generate-all                        (writes the gitignored lib/ files)
 *
 * `prisma generate` does not need the database; the migration chain does not need
 * a generated client; the generators need neither. Running them concurrently takes
 * the prebuild from the sum of the three to the slowest of the three.
 *
 * Output from each branch is buffered and flushed as one block when it finishes,
 * so concurrent logs can't interleave into nonsense. Any non-zero exit fails the
 * whole prebuild with that step's status, exactly as the `&&` chain did.
 */

import { spawn } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

// Prisma's CLI phones home for a version check on every invocation and prints an
// "update available" box that nobody acts on mid-build. Both cost a network round
// trip on the deploy critical path.
const env = {
  ...process.env,
  CHECKPOINT_DISABLE: '1',
  PRISMA_HIDE_UPDATE_MESSAGE: 'true',
}

// Call the locally installed Prisma CLI directly rather than through npx, which
// re-runs npm's package resolution for no benefit (mirrors build-migrate.mjs).
const localPrisma = path.join(rootDir, 'node_modules', '.bin', 'prisma')
const prismaCli = existsSync(localPrisma) ? [localPrisma] : ['npx', 'prisma']

function run(label, cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: rootDir, env, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
    let output = ''
    child.stdout.on('data', (d) => { output += d })
    child.stderr.on('data', (d) => { output += d })
    child.on('error', (err) => resolve({ label, status: 1, output: `${err.message}\n` }))
    child.on('close', (status) => resolve({ label, status, output }))
  })
}

// Runs a list of steps one after another, stopping at the first failure. Used for
// the database branch, where the order is load-bearing.
async function runSeries(label, steps) {
  let output = ''
  for (const [cmd, args] of steps) {
    const result = await run(label, cmd, args)
    output += result.output
    if (result.status !== 0) return { label, status: result.status, output }
  }
  return { label, status: 0, output }
}

function flush({ label, output }) {
  process.stdout.write(`\n──── ${label} ────\n${output.endsWith('\n') || output === '' ? output : output + '\n'}`)
}

// 1. Module code on disk. Everything below reads it, so this one is a barrier.
const checkout = await run('checkout-modules', 'node', ['scripts/checkout-modules.mjs'])
flush(checkout)
if (checkout.status !== 0) process.exit(checkout.status)

// 2. The three independent branches.
const results = await Promise.all([
  run('prisma generate', prismaCli[0], [...prismaCli.slice(1), 'generate']),
  runSeries('database', [
    ['node', ['scripts/build-migrate.mjs']],
    ['node', ['scripts/sync-module-manifests.mjs']],
  ]),
  run('generators', 'node', ['scripts/generate-all.mjs']),
])

for (const result of results) flush(result)

const failed = results.find((r) => r.status !== 0)
if (failed) {
  console.error(`[prebuild] ${failed.label} failed — aborting build`)
  process.exit(failed.status ?? 1)
}
