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

const prebuildStarted = Date.now()

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
    const started = Date.now()
    const child = spawn(cmd, args, { cwd: rootDir, env, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
    let output = ''
    child.stdout.on('data', (d) => { output += d })
    child.stderr.on('data', (d) => { output += d })
    child.on('error', (err) => resolve({ label, status: 1, output: `${err.message}\n`, ms: Date.now() - started }))
    child.on('close', (status) => resolve({ label, status, output, ms: Date.now() - started }))
  })
}

// Runs a list of steps one after another, stopping at the first failure. Used for
// the database branch, where the order is load-bearing.
async function runSeries(label, steps) {
  let output = ''
  let ms = 0
  for (const [cmd, args] of steps) {
    const result = await run(label, cmd, args)
    output += result.output
    ms += result.ms
    if (result.status !== 0) return { label, status: result.status, output, ms }
  }
  return { label, status: 0, output, ms }
}

// Each step's own duration in its header. Vercel timestamps log lines, but a
// concurrent branch's output is only flushed when it finishes, so every line in a
// block carries the same timestamp and the log cannot say which branch was the long
// pole. Without this the only measurable thing about the prebuild is its total.
function flush({ label, output, ms }) {
  const took = typeof ms === 'number' ? ` (${(ms / 1000).toFixed(1)}s)` : ''
  process.stdout.write(`\n──── ${label}${took} ────\n${output.endsWith('\n') || output === '' ? output : output + '\n'}`)
}

// 1. Module code on disk. Everything below reads it, so this one is a barrier.
const checkout = await run('checkout-modules', 'node', ['scripts/checkout-modules.mjs'])
flush(checkout)
// `close` reports status null when the child dies from a signal (e.g. OOM kill).
// `process.exit(null)` would exit 0 and let `next build` proceed with no module
// code on disk, so coerce a null/undefined status to a non-zero exit.
if (checkout.status !== 0) process.exit(checkout.status ?? 1)

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

// 3. Last, because it needs both the module code and the generated wiring on
// disk: prove no client component can reach server-only code. This is the only
// moment THIS install's pinned module versions are assembled together, and a
// bad combination fails the bundler with a page of unrelated-looking errors
// about 'fs' and 'net'. Seconds here, named edge, versus a minute there and a
// guessing game. See scripts/check-client-graph.mjs.
const clientGraph = await run('client graph', 'node', ['scripts/check-client-graph.mjs'])
flush(clientGraph)
if (clientGraph.status !== 0) {
  console.error('[prebuild] client graph check failed — aborting build')
  process.exit(clientGraph.status ?? 1)
}

console.log(`\n[prebuild] Done in ${((Date.now() - prebuildStarted) / 1000).toFixed(1)}s.`)
