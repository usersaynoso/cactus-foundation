import { readFileSync } from 'fs'
import path from 'path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { buildBackupSql, quoteIdent } from './dump'
import { restoreDatabaseFromSql, splitSqlStatements } from './restore'
import {
  createProject,
  deleteProject,
  createBranch,
  type NeonProject,
  type NeonBranch,
} from './neon-branch'

// The only test that actually proves a backup restores.
//
// Unit tests only cover the cases somebody thought of, and the bug that started
// all this (a jsonb column holding a JSON array, written as a SQL array literal)
// was precisely a case nobody thought of. So: build a real database from the core
// schema, seed it with the exact awkward shapes, dump it, restore the dump into a
// second real database, and compare every table byte for byte.
//
// It provisions its OWN throwaway Neon project (core schema only, synthetic data,
// deleted whole afterwards), so it never depends on or touches any real database,
// and runs with any org-scoped Neon key. Skipped unless opted into explicitly, so
// a plain `npm test` never hits the network. Run it with:
//
//   npm run test:backup-roundtrip
//
// which sets RUN_BACKUP_ROUNDTRIP=1. Only then is .env loaded for the key.
const shouldRun = process.env.RUN_BACKUP_ROUNDTRIP === '1'
if (shouldRun) {
  try {
    ;(process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile('.env')
  } catch {
    // No .env - the API-key guard below fails the suite loudly.
  }
}

const API_KEY = process.env.NEON_API_KEY
// The org the throwaway project is created in. Discovered from the key if unset.
let ORG_ID = process.env.BACKUP_TEST_ORG_ID

const SCHEMA_SQL = readFileSync(
  path.join(process.cwd(), 'prisma/migrations/20260626000000_init/migration.sql'),
  'utf8',
)

async function firstOrgForKey(apiKey: string): Promise<string> {
  const res = await fetch('https://console.neon.tech/api/v2/users/me/organizations', {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Neon: could not list organizations (${res.status})`)
  const body = (await res.json()) as { organizations: { id: string }[] }
  const org = body.organizations[0]?.id
  if (!org) throw new Error('Neon: this key belongs to no organization; set BACKUP_TEST_ORG_ID')
  return org
}

async function connect(uri: string): Promise<PrismaClient> {
  const db = new PrismaClient({ datasourceUrl: uri })
  // A freshly-created endpoint takes a moment to accept connections.
  for (let attempt = 0; ; attempt++) {
    try {
      await db.$queryRawUnsafe('SELECT 1')
      return db
    } catch (err) {
      if (attempt >= 15) throw err
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
}

// Apply the core init migration. Split into single statements because Prisma's
// raw executor sends one statement per call. The backup format shares this
// splitter, and the schema uses the same constrained SQL (no dollar-quoting), so
// this is a faithful exercise of it.
async function applySchema(db: PrismaClient): Promise<void> {
  for (const statement of splitSqlStatements(SCHEMA_SQL)) {
    await db.$executeRawUnsafe(statement)
  }
}

async function listTables(db: PrismaClient): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ table_name: string }[]>(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name != '_prisma_migrations'
    ORDER BY table_name
  `)
  return rows.map((r) => r.table_name)
}

// A content fingerprint per table, order-independent. Two databases with the same
// rows produce the same hashes whatever order the rows are stored in. This is the
// assertion that would have caught the history bug without anyone predicting it:
// a jsonb column that came back as text[] simply wouldn't have restored at all.
async function tableHashes(db: PrismaClient, tables: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (const table of tables) {
    const rows = await db.$queryRawUnsafe<{ h: string }[]>(
      `SELECT coalesce(md5(string_agg(t::text, '|' ORDER BY t::text)), 'empty') AS h
       FROM ${quoteIdent(table)} t`,
    )
    out.set(table, rows[0]!.h)
  }
  return out
}

// Seed the exact shapes that break naive serialisation. The jsonb-array on
// InfoPage.history / Layout.history is the literal regression; the String[] on
// Passkey.transports is the real SQL-array case that must NOT be confused with it.
async function seedAwkwardValues(db: PrismaClient): Promise<void> {
  const history = JSON.stringify([
    { title: 'Home v1', at: '2026-01-01T00:00:00.000Z', byId: null },
    { title: "Home 'v2'", at: '2026-02-01T00:00:00.000Z', byId: 'u1' },
  ])

  // A valid minimal graph: Role <- User <- Passkey, plus the two history-bearing
  // content tables and SiteConfig. Raw inserts bypass Prisma's @updatedAt, so
  // every updatedAt is supplied by hand.
  await db.$executeRawUnsafe(`INSERT INTO "Role" ("id", "name") VALUES ('role-1', 'Owner')`)
  await db.$executeRawUnsafe(
    `INSERT INTO "User" ("id", "email", "username", "roleId", "createdAt", "updatedAt")
     VALUES ('user-1', 'owner@example.com', 'owner', 'role-1', now(), now())`,
  )
  await db.$executeRawUnsafe(
    `INSERT INTO "SiteConfig" ("id", "adminPath", "setupCompleted", "designTokens", "updatedAt")
     VALUES ('singleton', 'cactus-admin', true, '{"probe":"json object"}'::jsonb, now())`,
  )
  await db.$executeRawUnsafe(
    `INSERT INTO "InfoPage" ("id", "slug", "title", "body", "bodyFormat", "history", "status", "createdAt", "updatedAt")
     VALUES ('page-1', 'home', 'Home', '', 'builder', $1::jsonb, 'published', now(), now())`,
    history,
  )
  await db.$executeRawUnsafe(
    `INSERT INTO "Layout" ("id", "name", "history", "priority", "isStarter", "updatedAt")
     VALUES ('layout-1', 'Default', $1::jsonb, 0, false, now())`,
    history,
  )
  // A real text[] column, and an empty one, right next to the jsonb arrays above.
  await db.$executeRawUnsafe(
    `INSERT INTO "Passkey" ("id", "userId", "credentialId", "publicKey", "counter", "transports", "createdAt")
     VALUES ('pk-1', 'user-1', 'cred-1', '\\x00'::bytea, 0, ARRAY['usb','nfc']::text[], now())`,
  )
  await db.$executeRawUnsafe(
    `INSERT INTO "Passkey" ("id", "userId", "credentialId", "publicKey", "counter", "transports", "createdAt")
     VALUES ('pk-2', 'user-1', 'cred-2', '\\x01'::bytea, 5, ARRAY[]::text[], now())`,
  )
}

describe.skipIf(!shouldRun)('backup round-trip against a real database', () => {
  let project: NeonProject
  let dstBranch: NeonBranch
  let srcDb: PrismaClient
  let dstDb: PrismaClient
  let tables: string[]
  let backupSql: string

  beforeAll(async () => {
    if (!API_KEY) throw new Error('RUN_BACKUP_ROUNDTRIP=1 but NEON_API_KEY is not set (checked .env)')
    ORG_ID ??= await firstOrgForKey(API_KEY)

    const stamp = Date.now()
    project = await createProject(API_KEY, ORG_ID, `cactus-backup-roundtrip-${stamp}`)

    // Source = the project's default branch, built from the core schema and seeded.
    srcDb = await connect(project.connectionUri)
    await applySchema(srcDb)
    await seedAwkwardValues(srcDb)
    tables = await listTables(srcDb)

    // Target = a copy-on-write branch off the seeded source, so the two start
    // identical and the restore has something faithful to be checked against.
    dstBranch = await createBranch(API_KEY, project.id, project.defaultBranchId, `dst-${stamp}`)
    dstDb = await connect(dstBranch.connectionUri)
  }, 600_000)

  afterAll(async () => {
    await srcDb?.$disconnect().catch(() => {})
    await dstDb?.$disconnect().catch(() => {})
    // Deleting the project takes its branches and endpoints with it.
    if (project && API_KEY) await deleteProject(API_KEY, project.id).catch(() => {})
  }, 600_000)

  it('dumps, restores, and lands on a byte-identical database', async () => {
    backupSql = await buildBackupSql(srcDb, SCHEMA_SQL, new Date().toISOString())
    expect(backupSql).toContain('INSERT INTO "InfoPage"')
    // The heart of it: a jsonb array must be written as a JSON literal - `'[{...}]'` -
    // and never as a SQL array of JSON strings, which is what the bug produced:
    // ARRAY['{"title":...}', '{"title":...}'] typed text[], which jsonb rejects.
    // (Postgres normalises jsonb key order, hence matching on the value not the key.)
    expect(backupSql).toMatch(/'\[\{"at":/)
    expect(backupSql).toContain('Home v1')
    expect(backupSql).not.toMatch(/ARRAY\['\{/)
    // ...while a genuine text[] column still gets a cast SQL array literal.
    expect(backupSql).toMatch(/ARRAY\['usb', 'nfc'\]::text\[\]/)

    const expectedTables = await tableHashes(srcDb, tables)

    // Knock the target out of shape so a restore that quietly does nothing can't
    // pass: empty the seeded tables.
    for (const table of ['InfoPage', 'Layout', 'Passkey', 'User', 'SiteConfig']) {
      await dstDb.$executeRawUnsafe(`TRUNCATE TABLE ${quoteIdent(table)} CASCADE`)
    }

    const result = await restoreDatabaseFromSql(backupSql, dstDb)
    expect(result.rowsInserted).toBeGreaterThan(0)
    expect(result.tablesRestored).toContain('InfoPage')
    expect(result.skippedTables).toEqual([])

    const actualTables = await tableHashes(dstDb, tables)
    const mismatched = tables.filter((t) => actualTables.get(t) !== expectedTables.get(t))
    expect(mismatched, 'these tables did not survive the round-trip').toEqual([])
  }, 600_000)

  it('refuses a backup from a newer Cactus, and changes nothing when it does', async () => {
    // Simulate the target running an OLDER Cactus: it lacks a column the backup
    // carries. The restore must say so in English and leave the data alone.
    await dstDb.$executeRawUnsafe(`ALTER TABLE "InfoPage" DROP COLUMN "metaDescription"`)

    // Hashed AFTER the drop, so the comparison isolates what the restore did
    // rather than what the schema change did.
    const before = await tableHashes(dstDb, ['InfoPage'])

    await expect(restoreDatabaseFromSql(backupSql, dstDb)).rejects.toThrow(/NEWER version of Cactus/)

    // "Nothing has been changed" has to be true, not just a nice thing to say:
    // the check must run before the TRUNCATE, not halfway through it.
    const after = await tableHashes(dstDb, ['InfoPage'])
    expect(after.get('InfoPage')).toBe(before.get('InfoPage'))
    expect(before.get('InfoPage')).not.toBe('empty')
  }, 600_000)
})
