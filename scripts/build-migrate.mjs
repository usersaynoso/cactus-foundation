#!/usr/bin/env node
/**
 * Conditional migration runner for Vercel builds.
 *
 * Skips all migration steps if DATABASE_URL is absent — this is expected on the
 * initial deployment before the setup wizard has provisioned the database.
 * Migrations run on the subsequent redeploy once DATABASE_URL is written to Vercel
 * by the setup wizard (provision-db or manual entry).
 */

import { execSync } from 'child_process'

if (!process.env.DATABASE_URL) {
  console.log(
    '[build-migrate] DATABASE_URL not set — skipping migrations (initial deployment before setup)'
  )
  process.exit(0)
}

console.log('[build-migrate] Running Prisma migrations…')
execSync('npx prisma migrate deploy', { stdio: 'inherit' })

console.log('[build-migrate] Running module migrations…')
execSync('node scripts/run-module-migrations.mjs', { stdio: 'inherit' })
