#!/usr/bin/env node
/**
 * Conditional migration runner for Vercel builds.
 *
 * Skips all migration steps if DATABASE_URL is absent — this is expected on the
 * initial deployment before the setup wizard has provisioned the database.
 * Migrations run on the subsequent redeploy once DATABASE_URL is written to Vercel
 * by the setup wizard (provision-db or manual entry).
 *
 * Neon note: prisma migrate deploy uses a Postgres advisory lock which fails on
 * the pooler endpoint. We prefer DIRECT_URL if set; otherwise we strip "-pooler"
 * from the DATABASE_URL hostname to get the direct connection for migrations only.
 */

import { execSync } from 'child_process'

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

const env = { ...process.env, DATABASE_URL: migrateUrl }

console.log('[build-migrate] Running Prisma migrations…')
execSync('npx prisma migrate deploy', { stdio: 'inherit', env })

console.log('[build-migrate] Running module migrations…')
execSync('node scripts/run-module-migrations.mjs', { stdio: 'inherit', env })
