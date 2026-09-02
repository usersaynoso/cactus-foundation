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

    // Read every manifest off disk first, then write them all in ONE statement.
    // This used to be an UPDATE per module inside the loop, so an install with
    // thirty-odd modules paid thirty-odd sequential round trips to a database that
    // is not in the same building as the build machine - several seconds of a
    // deploy, every deploy, to write rows that are usually identical to what is
    // already there.
    const names = []
    const manifests = []

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

      names.push(mod.name)
      // Re-serialised from the parsed value rather than passed through as the raw
      // file text, exactly as before: the parse is what proves the file is valid
      // JSON, and re-serialising drops whitespace the column would only normalise
      // away anyway.
      manifests.push(JSON.stringify(manifest))
    }

    if (names.length === 0) {
      console.log('[sync-manifests] No readable module manifests. Nothing to do.')
      return
    }

    // `IS DISTINCT FROM` makes an unchanged manifest cost nothing: the column is
    // jsonb, so the comparison is on the parsed value and is not fooled by key
    // order or whitespace. On the overwhelming majority of deploys nothing has
    // changed and this writes no rows at all, which is the point - the previous
    // version rewrote all of them every time.
    const { rows: updated } = await client.query(
      `UPDATE "Module" AS m
          SET manifest = v.manifest::jsonb
         FROM unnest($1::text[], $2::text[]) AS v(name, manifest)
        WHERE m.name = v.name
          AND m.manifest IS DISTINCT FROM v.manifest::jsonb
    RETURNING m.name`,
      [names, manifests]
    )

    for (const row of updated) console.log(`[sync-manifests] ${row.name}: manifest refreshed`)
    console.log(
      updated.length === 0
        ? `[sync-manifests] All ${names.length} module manifest(s) already up to date.`
        : `[sync-manifests] ${updated.length} of ${names.length} module manifest(s) refreshed.`
    )
  } finally {
    await client.end()
  }
}

run().catch((err) => {
  console.error('[sync-manifests] Fatal error:', err)
  process.exit(1)
})
