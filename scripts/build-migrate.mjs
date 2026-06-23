#!/usr/bin/env node
/**
 * Conditional migration runner for Vercel builds.
 *
 * Skips all migration steps if DATABASE_URL is absent — this is expected on the
 * initial deployment before the setup wizard has provisioned the database.
 * Migrations run on the subsequent redeploy once DATABASE_URL is written to Vercel
 * by the setup wizard (provision-db or manual entry).
 *
 * Neon note: prisma migrate deploy uses a Postgres advisory lock which can
 * time-out through Neon's pgBouncer pooler endpoint AND on cold-start of the
 * direct endpoint. Fixes applied:
 *   1. Use DIRECT_URL if set, else strip "-pooler" from the hostname.
 *   2. Set PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1 so Prisma skips the advisory
 *      lock entirely — safe here because Vercel runs only one build at a time.
 *   3. Retry up to 3 times with a 15 s back-off for any remaining transient
 *      connectivity issues.
 */

import { spawnSync } from 'child_process'

if (!process.env.DATABASE_URL) {
  console.log(
    '[build-migrate] DATABASE_URL not set — skipping migrations (initial deployment before setup)'
  )
  process.exit(0)
}

// Prefer an explicit DIRECT_URL; otherwise derive one from the pooler URL.
let migrateUrl = process.env.DIRECT_URL || process.env.DATABASE_URL

// Neon pooler URLs contain "-pooler" in the hostname.
// Advisory locks don't work through pgBouncer, so swap to the direct endpoint.
if (!process.env.DIRECT_URL && migrateUrl.includes('-pooler.')) {
  migrateUrl = migrateUrl.replace('-pooler.', '.')
  console.log('[build-migrate] Detected Neon pooler URL — using direct endpoint for migrations')
}

const env = {
  ...process.env,
  DATABASE_URL: migrateUrl,
  // Skip the Postgres advisory lock: Vercel runs one build at a time so there
  // is no concurrent-migration risk, and Neon cold-starts frequently exceed
  // Prisma's 10 s advisory lock timeout.
  PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: '1',
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function runWithRetry(label, cmd, args, retries = 3, backoffMs = 10_000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    console.log(`[build-migrate] ${label} (attempt ${attempt}/${retries})…`)
    const result = spawnSync(cmd, args, { stdio: 'inherit', env, shell: false })
    if (result.status === 0) return
    if (attempt < retries) {
      console.log(`[build-migrate] ${label} failed — retrying in ${backoffMs / 1000}s`)
      sleep(backoffMs)
    } else {
      console.error(`[build-migrate] ${label} failed after ${retries} attempts`)
      process.exit(result.status ?? 1)
    }
  }
}

runWithRetry('Prisma migrations', 'npx', ['prisma', 'migrate', 'deploy'])
runWithRetry('Module migrations', 'node', ['scripts/run-module-migrations.mjs'])
