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
      `SELECT "moduleName", "migrationName" FROM "ModuleMigration"`
    )
    const appliedKey = (moduleName, migrationName) => `${moduleName}::${migrationName}`
    const applied = new Set(appliedRows.map((r) => appliedKey(r.moduleName, r.migrationName)))

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
        const { rows: tableCount } = await client.query(
          `SELECT count(*)::int AS count FROM information_schema.tables
           WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
             AND left(table_name, $1) = $2`,
          [prefix.length, prefix],
        )
        if (tableCount[0].count === 0) {
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

        // Check if already applied
        if (applied.has(appliedKey(mod.name, migrationName))) {
          console.log(`[module-migrations] ${mod.name}/${migrationName}: already applied, skipping`)
          continue
        }

        const sqlPath = join(modulePath, 'migrations', filename)
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
  } finally {
    await client.end()
  }
}

run().catch((err) => {
  console.error('[module-migrations] Fatal error:', err)
  process.exit(1)
})
