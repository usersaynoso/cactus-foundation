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

      for (const filename of migrationFiles) {
        const migrationName = filename.replace(/\.sql$/, '')

        // Check if already applied
        const { rows: existing } = await client.query(
          `SELECT id FROM "ModuleMigration"
           WHERE "moduleName" = $1 AND "migrationName" = $2`,
          [mod.name, migrationName]
        )
        if (existing.length > 0) {
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
