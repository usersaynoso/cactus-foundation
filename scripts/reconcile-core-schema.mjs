#!/usr/bin/env node
/**
 * Core schema reconcile runner for Vercel builds.
 *
 * The core schema ships as a single Prisma migration that is edited in place
 * (project policy: one core migration, ever). `prisma migrate deploy` therefore
 * never re-applies it on an install where it already ran, so any additive change
 * made to the init migration after an install was first provisioned never
 * reaches that install's database. That drift is invisible until a page queries
 * a table or column the frozen database doesn't have (e.g. the media library's
 * Folder / Tag tables on a site provisioned before they were added).
 *
 * This runner closes that gap. Every `.sql` file in `prisma/core-reconcile/` is
 * additive and fully idempotent (IF NOT EXISTS / guarded constraints), and is
 * run on every deploy. On a fresh or up-to-date install each statement is a
 * no-op; on a drifted install it adds exactly the missing objects.
 *
 * Runs after `prisma migrate deploy` in build-migrate.mjs. Skipped when
 * DATABASE_URL is absent (initial deploy before the setup wizard).
 */

import { readdirSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const { Client } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))

if (!process.env.DATABASE_URL) {
  console.log(
    '[reconcile-core] DATABASE_URL not set — skipping (initial deployment before setup)'
  )
  process.exit(0)
}

// Prefer an explicit DIRECT_URL, otherwise derive the direct endpoint from a
// Neon pooler URL — DDL is happier on the direct endpoint. Mirrors build-migrate.
let dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!process.env.DIRECT_URL && dbUrl.includes('-pooler.')) {
  dbUrl = dbUrl.replace('-pooler.', '.')
  console.log('[reconcile-core] Detected Neon pooler URL — using direct endpoint')
}

// Same SSL handling as run-module-migrations.mjs: promote Neon's `sslmode=require`
// to `verify-full` so node-postgres validates the certificate.
const parsedUrl = new URL(dbUrl)
if (parsedUrl.searchParams.get('sslmode') === 'require') {
  parsedUrl.searchParams.set('sslmode', 'verify-full')
}
const connectionString = parsedUrl.toString()

function reconcileFiles() {
  const dir = path.join(__dirname, '..', 'prisma', 'core-reconcile')
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.sql'))
      .map((e) => e.name)
      .sort() // numeric prefixes apply in order
      .map((name) => ({ name, file: path.join(dir, name) }))
  } catch {
    return []
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function run() {
  const files = reconcileFiles()
  if (files.length === 0) {
    console.log('[reconcile-core] No reconcile files — nothing to do')
    return
  }

  const retries = 3
  const backoffMs = 10_000
  for (let attempt = 1; attempt <= retries; attempt++) {
    const client = new Client({ connectionString })
    try {
      await client.connect()
      for (const { name, file } of files) {
        const sql = readFileSync(file, 'utf8')
        console.log(`[reconcile-core] Applying ${name}…`)
        // The whole file runs in one statement batch — additive, idempotent DDL,
        // no per-statement transaction needed.
        await client.query(sql)
      }
      console.log('[reconcile-core] Core schema reconcile complete')
      await client.end()
      return
    } catch (err) {
      await client.end().catch(() => {})
      console.error(`[reconcile-core] Attempt ${attempt}/${retries} failed: ${err.message}`)
      if (attempt < retries) {
        console.log(`[reconcile-core] Retrying in ${backoffMs / 1000}s`)
        await sleep(backoffMs)
      } else {
        console.error('[reconcile-core] Core schema reconcile failed')
        process.exit(1)
      }
    }
  }
}

run()
