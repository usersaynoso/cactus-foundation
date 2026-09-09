#!/usr/bin/env node
/**
 * Module migration runner — executes during Vercel's build step, NEVER at runtime.
 *
 * For every installed module whose status is active or deploying, reads its
 * migrations/ folder (plain .sql files, named in lexicographic order), and
 * applies any that haven't been recorded in the ModuleMigration table.
 *
 * This runner is deliberately separate from Prisma's own migration history.
 * Module migrations are plain SQL targeting prefixed tables; they never touch
 * the core schema or Prisma's _prisma_migrations table.
 *
 * Run order in package.json build script:
 *   prisma migrate deploy && node scripts/run-module-migrations.mjs && next build
 */

import { readdir, readFile } from 'fs/promises'
import { createHash } from 'crypto'
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
// Helpers
// ---------------------------------------------------------------------------

function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// The alert an owner actually sees when a released migration has been edited
// underneath their install. Deduped on a stable key so a run of green deploys
// neither piles up copies nor keeps re-lighting the bell, and cleared the moment
// the drift is gone - which is what taking the catch-up file does.
//
// Written straight through pg rather than through lib/notifications/alerts.ts:
// this runs in the build, before Next exists, with no Prisma client to hand.
// Every failure in here is swallowed. A build must never fall over because it
// could not file a warning - least of all this warning, whose whole point is to
// be raised on a site that is already having a bad day. The `alert` enum value
// arrives in prisma/core-reconcile/036, which build-migrate runs before this.
// Migrations that are edited in place by design and therefore cannot drift.
// See the exemption note at the checksum comparison below.
const EDITED_IN_PLACE = new Set(['001_initial.sql'])

const DRIFT_DEDUPE_KEY = 'schema-drift'

async function reportDrift(client, drift) {
  try {
    if (drift.length === 0) {
      await client.query(`DELETE FROM "Notification" WHERE "dedupeKey" = $1`, [DRIFT_DEDUPE_KEY])
      return
    }

    console.warn(
      `[module-migrations] ${drift.length} applied migration(s) no longer match the files in this build. ` +
        `Anything added to them after they ran is NOT in this database.`
    )

    const title =
      drift.length === 1
        ? `Part of an update never reached your database (${drift[0].module})`
        : `Part of an update never reached your database (${drift.length} files)`
    // Plain enough to act on without knowing what a migration is, and the
    // machine detail sits underneath for whoever ends up looking at it.
    const reasons = drift.map((d) => ({
      label: `${d.module}: ${d.migration}`,
      detail:
        `Ran here on ${new Date(d.appliedAt).toISOString().slice(0, 10)} and has changed since. ` +
        `Recorded ${d.recorded.slice(0, 12)}, this build has ${d.onDisk.slice(0, 12)}.`,
      at: new Date().toISOString(),
    }))

    const { rows } = await client.query(`SELECT "id", "title" FROM "Notification" WHERE "dedupeKey" = $1 LIMIT 1`, [
      DRIFT_DEDUPE_KEY,
    ])
    if (rows.length === 0) {
      await client.query(
        `INSERT INTO "Notification" ("id", "type", "title", "reasons", "link", "actionLabel", "dedupeKey", "readAt", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, 'alert', $1, $2::jsonb, '/modules', 'View modules', $3, NULL, NOW(), NOW())`,
        [title, JSON.stringify(reasons), DRIFT_DEDUPE_KEY]
      )
      return
    }
    // Only re-light the bell when the story changes, exactly as upsertAlert does
    // - an owner who has read this once does not need it shouting on every deploy.
    await client.query(
      `UPDATE "Notification"
          SET "title" = $1, "reasons" = $2::jsonb, "updatedAt" = NOW(),
              "readAt" = CASE WHEN "title" = $1 THEN "readAt" ELSE NULL END
        WHERE "id" = $3`,
      [title, JSON.stringify(reasons), rows[0].id]
    )
  } catch (err) {
    console.warn(`[module-migrations] could not record the drift alert: ${err.message}`)
  }
}

async function run() {
  const client = getClient()
  await client.connect()

  try {
    // Find all installed modules (active or deploying — deploying means this
    // build IS the deployment that should apply the new migrations).
    const { rows: modules } = await client.query(
      `SELECT id, name, "tablePrefix" FROM "Module"
       WHERE status IN ('active', 'deploying', 'update_available')
       ORDER BY "installedAt" ASC`
    )

    if (modules.length === 0) {
      console.log('[module-migrations] No active modules found. Nothing to do.')
      return
    }

    // Read the whole applied-migrations ledger once. This used to be a SELECT per
    // (module, migration file) pair, so a site with seven modules and a handful of
    // migrations each paid dozens of round trips to Neon just to learn that it had
    // nothing to do — which is the outcome on all but the deploy that introduces a
    // migration. The skip decision below is unchanged, only where it reads from.
    const { rows: appliedRows } = await client.query(
      `SELECT "moduleName", "migrationName", "checksum", "appliedAt" FROM "ModuleMigration"`
    )
    const appliedKey = (moduleName, migrationName) => `${moduleName}::${migrationName}`
    const applied = new Set(appliedRows.map((r) => appliedKey(r.moduleName, r.migrationName)))
    // The recorded hash of each applied file, so the skip below can notice that
    // the file it is skipping is no longer the file that ran. See reportDrift.
    const appliedChecksums = new Map(
      appliedRows.map((r) => [appliedKey(r.moduleName, r.migrationName), { checksum: r.checksum, appliedAt: r.appliedAt }])
    )
    const drift = []

    // Every table in the schema, read at most once, for the stale-ledger check
    // below. That check used to ask information_schema for a count per module,
    // which on an install with thirty-odd modules is thirty-odd sequential round
    // trips on every deploy - all of them to establish that nothing is stale,
    // which is the answer on every build except the rare one recovering a restored
    // database. Exactly the same shape of waste as the per-migration ledger SELECT
    // fixed above, and the same fix: ask once, decide in memory. Read lazily, so an
    // install with no ledger rows at all still pays nothing.
    //
    // Safe to cache for the whole run even though migrations below create tables:
    // a module is checked before its own migrations run, and table prefixes are
    // unique per module, so no module's check can depend on a table another
    // module's migration is about to create.
    let publicTables = null
    async function tableNames() {
      if (publicTables === null) {
        const { rows } = await client.query(
          `SELECT table_name FROM information_schema.tables
           WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
        )
        publicTables = rows.map((r) => r.table_name)
      }
      return publicTables
    }

    for (const mod of modules) {
      const modulePath = resolve(process.cwd(), 'modules', mod.name)

      let migrationFiles
      try {
        const entries = await readdir(join(modulePath, 'migrations'))
        migrationFiles = entries
          .filter((f) => f.endsWith('.sql'))
          .sort() // lexicographic order
      } catch {
        console.log(`[module-migrations] No migrations directory for module "${mod.name}". Skipping.`)
        continue
      }

      // Self-heal a stale ledger. A restored or branched database can carry the
      // ModuleMigration ledger (it is an ordinary table) without the module's
      // actual tables - those are created by the migrations below and are NOT part
      // of any backup's schema section. The ledger then insists every migration is
      // applied, the skip check further down honours it, and the module's tables
      // never come back. (Backups no longer carry the ledger - see lib/backup - but
      // databases already in this state, and any future path that desyncs the two,
      // still need recovering.) Detect the exact contradiction - this module has
      // recorded migrations yet not one table with its prefix exists - and purge
      // its ledger rows so its migrations re-apply from scratch, just as on a fresh
      // install. Restricted to the zero-tables case so a healthy install is never
      // touched and a plain (non-idempotent) CREATE TABLE can't collide.
      const prefix = (mod.tablePrefix ?? '').trim()
      const hasLedgerRows = appliedRows.some((r) => r.moduleName === mod.name)
      if (prefix && hasLedgerRows) {
        // `left(table_name, n) = prefix` in the old per-module query and
        // `startsWith` here are the same test: a case-sensitive literal prefix
        // match on the table name.
        const hasPrefixedTable = (await tableNames()).some((t) => t.startsWith(prefix))
        if (!hasPrefixedTable) {
          console.warn(
            `[module-migrations] ${mod.name}: ledger records migrations but no "${prefix}" tables exist - ` +
              `stale ledger (likely a restored database). Purging ledger and re-applying from scratch.`,
          )
          await client.query(`DELETE FROM "ModuleMigration" WHERE "moduleName" = $1`, [mod.name])
          for (const key of [...applied]) {
            if (key.startsWith(`${mod.name}::`)) applied.delete(key)
          }
        }
      }

      for (const filename of migrationFiles) {
        const migrationName = filename.replace(/\.sql$/, '')

        const sqlPath = join(modulePath, 'migrations', filename)

        // Check if already applied
        if (applied.has(appliedKey(mod.name, migrationName))) {
          // ...and, while we are here, whether it is still the same file. The
          // ledger is keyed by NAME, so an applied migration never runs again
          // however much it changes - which means an edit made after a release
          // reaches installs provisioned afterwards and NO ONE else, silently,
          // for ever. Reading the hash we already store is the whole check, and
          // nothing read it until a customer's card was charged against an order
          // that could not be written (2026-09-08, shop 043_returnable).
          //
          // Never fatal. The drift is historical by the time it is visible, the
          // build that surfaces it is usually the one carrying the catch-up file,
          // and a hard failure here would wedge every update on a site that has
          // already been bitten. It shouts instead, and raises an alert the owner
          // sees in the admin.
          //
          // 001_initial.sql is exempt, and getting that wrong would have made
          // this alarm worthless: it is edited in place ON PURPOSE so a fresh
          // install lands where an updated one does, which means its checksum
          // legitimately differs from the recorded one on every install that has
          // ever taken an update. Reporting it would be a false alarm on every
          // site, every deploy - and an alarm that always fires is one nobody
          // reads on the day it is right.
          const recorded = EDITED_IN_PLACE.has(filename)
            ? null
            : appliedChecksums.get(appliedKey(mod.name, migrationName))
          if (recorded?.checksum) {
            // A file that cannot be read is a build problem, not drift. Hashing
            // the empty string would make one up.
            const current = await readFile(sqlPath, 'utf8').catch(() => null)
            const onDisk = current === null ? null : sha256(current)
            if (onDisk && onDisk !== recorded.checksum) {
              drift.push({
                module: mod.name,
                migration: migrationName,
                appliedAt: recorded.appliedAt,
                recorded: recorded.checksum,
                onDisk,
              })
              console.warn(
                `[module-migrations] ${mod.name}/${migrationName}: DRIFT - this file has changed since it ran ` +
                  `here (recorded ${recorded.checksum.slice(0, 12)}, on disk ${onDisk.slice(0, 12)}). ` +
                  `It will NOT be re-applied; anything added to it after the fact has never reached this database.`
              )
              continue
            }
          }
          console.log(`[module-migrations] ${mod.name}/${migrationName}: already applied, skipping`)
          continue
        }

        const sql = await readFile(sqlPath, 'utf8')
        const checksum = sha256(sql)

        console.log(`[module-migrations] ${mod.name}/${migrationName}: applying...`)

        // Run the SQL in a transaction
        await client.query('BEGIN')
        try {
          await client.query(sql)
          await client.query(
            `INSERT INTO "ModuleMigration" ("id", "moduleName", "migrationName", "appliedAt", "checksum")
             VALUES (gen_random_uuid()::text, $1, $2, NOW(), $3)`,
            [mod.name, migrationName, checksum]
          )
          await client.query('COMMIT')
          applied.add(appliedKey(mod.name, migrationName))
          console.log(`[module-migrations] ${mod.name}/${migrationName}: done`)
        } catch (err) {
          await client.query('ROLLBACK')
          console.error(`[module-migrations] ${mod.name}/${migrationName}: FAILED — ${err.message}`)
          throw err
        }
      }
    }

    console.log('[module-migrations] All module migrations applied successfully.')
    await reportDrift(client, drift)
  } finally {
    await client.end()
  }
}

run().catch((err) => {
  console.error('[module-migrations] Fatal error:', err)
  process.exit(1)
})
