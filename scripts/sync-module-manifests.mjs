#!/usr/bin/env node
/**
 * Module manifest sync — executes during Vercel's build step, NEVER at runtime.
 *
 * The admin sidebar (and teardown logic) reads each module's manifest from the
 * Module.manifest column. That column is written only at install time, so any
 * later change to a module's cactus.module.json (e.g. a removed nav entry)
 * never reaches the DB and the sidebar shows stale entries.
 *
 * This runner rewrites every installed module's Module.manifest from its
 * deployed cactus.module.json on each deploy, so the DB always tracks the
 * code that is actually shipped. No GitHub fetch, no runtime cost. It mirrors
 * the build-time module-migration pattern.
 *
 * Run order in package.json build script:
 *   node scripts/build-migrate.mjs && node scripts/sync-module-manifests.mjs && …
 */

import { readFile } from 'fs/promises'
import { join, resolve } from 'path'
import pg from 'pg'

const { Client } = pg

// ---------------------------------------------------------------------------
// Database connection (uses the same DATABASE_URL as Prisma)
// ---------------------------------------------------------------------------

function getClient() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const parsedUrl = new URL(url)
  if (parsedUrl.searchParams.get('sslmode') === 'require') {
    parsedUrl.searchParams.set('sslmode', 'verify-full')
  }
  return new Client({ connectionString: parsedUrl.toString() })
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  // Skip when DATABASE_URL is absent — expected on the initial deployment
  // before the setup wizard has provisioned the database, mirroring
  // scripts/build-migrate.mjs.
  if (!process.env.DATABASE_URL) {
    console.log('[sync-manifests] DATABASE_URL not set — skipping manifest sync (initial deployment before setup)')
    return
  }

  const client = getClient()
  await client.connect()

  try {
    // Refresh every installed module regardless of enabled state.
    const { rows: modules } = await client.query(
      `SELECT id, name FROM "Module"
       WHERE status IN ('active', 'deploying', 'inactive', 'update_available')
       ORDER BY "installedAt" ASC`
    )

    if (modules.length === 0) {
      console.log('[sync-manifests] No installed modules found. Nothing to do.')
      return
    }

    for (const mod of modules) {
      const manifestPath = resolve(process.cwd(), 'modules', mod.name, 'cactus.module.json')

      let manifest
      try {
        const raw = await readFile(manifestPath, 'utf8')
        manifest = JSON.parse(raw)
      } catch (err) {
        console.log(`[sync-manifests] ${mod.name}: cactus.module.json missing or unparseable (${err.message}) — skipping`)
        continue
      }

      await client.query(
        `UPDATE "Module" SET manifest = $1::jsonb WHERE name = $2`,
        [JSON.stringify(manifest), mod.name]
      )
      console.log(`[sync-manifests] ${mod.name}: manifest refreshed`)
    }

    console.log('[sync-manifests] All module manifests synced successfully.')
  } finally {
    await client.end()
  }
}

run().catch((err) => {
  console.error('[sync-manifests] Fatal error:', err)
  process.exit(1)
})
