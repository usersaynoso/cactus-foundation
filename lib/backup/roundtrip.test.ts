import { readFileSync } from 'fs'
import path from 'path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { stalePlanRetryExtension, type ExtendedPrismaClient } from '@/lib/db/prisma'
import { buildBackupSql, quoteIdent } from './dump'
import { restoreDatabaseFromSql, splitSqlStatements } from './restore'
import { encryptSecret } from '@/lib/crypto/secrets'
import {
  vpsConfigFromEnv,
  createTestRole,
  createTestDatabase,
  dropTestDatabase,
  dropTestRole,
  dropStaleTestObjects,
  type VpsConfig,
  type TestRole,
  type TestDatabase,
} from './vps-database'

// The only test that actually proves a backup restores.
//
// Unit tests only cover the cases somebody thought of, and the bug that started
// all this (a jsonb column holding a JSON array, written as a SQL array literal)
// was precisely a case nobody thought of. So: build a real database from the core
// schema, seed it with the exact awkward shapes, dump it, restore the dump into a
// second real database, and compare every table byte for byte.
//
// It provisions its OWN throwaway databases on the self-hosted Postgres VPS (core
// schema only, synthetic data, dropped whole afterwards, plus a sweep for anything
// a crashed run left behind), so it never depends on or touches any real database -
// the live site's database sits on the same server and is never named, opened or
// altered. Skipped unless opted into explicitly, so a plain `npm test` never hits
// the network. Run it with:
//
//   npm run test:backup-roundtrip
//
// which sets RUN_BACKUP_ROUNDTRIP=1. Only then is .env loaded for the server details.
const shouldRun = process.env.RUN_BACKUP_ROUNDTRIP === '1'
if (shouldRun) {
  try {
    ;(process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile('.env')
  } catch {
    // No .env - the API-key guard below fails the suite loudly.
  }
}

const SCHEMA_SQL = readFileSync(
  path.join(process.cwd(), 'prisma/migrations/20260626000000_init/migration.sql'),
  'utf8',
)

// Two keys, because that is the whole point: ENCRYPTION_KEY is minted per install,
// so the site restoring a backup is virtually never the site that made it. Anything
// encrypted under SOURCE_KEY is noise to a site holding OTHER_KEY - and a site that
// keeps such noise around goes on insisting GitHub is connected while every call to
// it fails.
const SOURCE_KEY = 'a'.repeat(64)
const OTHER_KEY = 'b'.repeat(64)

// Extended exactly as the app's client is, so the round-trip exercises the same
// client the site runs on rather than a plainer one that happens to type-check.
async function connect(uri: string): Promise<ExtendedPrismaClient> {
  const db = new PrismaClient({ datasourceUrl: uri }).$extends(stalePlanRetryExtension)
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
async function applySchema(db: ExtendedPrismaClient): Promise<void> {
  for (const statement of splitSqlStatements(SCHEMA_SQL)) {
    await db.$executeRawUnsafe(statement)
  }
}

async function listTables(db: ExtendedPrismaClient): Promise<string[]> {
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
async function tableHashes(db: ExtendedPrismaClient, tables: string[]): Promise<Map<string, string>> {
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
async function seedAwkwardValues(db: ExtendedPrismaClient): Promise<void> {
  const history = JSON.stringify([
    { title: 'Home v1', at: '2026-01-01T00:00:00.000Z', byId: null },
    { title: "Home 'v2'", at: '2026-02-01T00:00:00.000Z', byId: 'u1' },
  ])

  // A valid minimal graph: Role <- User <- Passkey, plus the two history-bearing
  // content tables and SiteConfig. Raw inserts bypass Prisma's @updatedAt, so
  // every updatedAt is supplied by hand.
  await db.$executeRawUnsafe(`INSERT INTO "Role" ("id", "name") VALUES ('role-1', 'Owner')`)
  // The admin carries both kinds of encrypted-at-rest secret: an authenticator
  // enrolment and a phone for sign-in codes.
  await db.$executeRawUnsafe(
    `INSERT INTO "User" ("id", "email", "username", "roleId", "totpSecretEncrypted", "totpVerifiedAt",
                         "smsOtpPhoneEncrypted", "createdAt", "updatedAt")
     VALUES ('user-1', 'owner@example.com', 'owner', 'role-1', $1, now(), $2, now(), now())`,
    encryptSecret('JBSWY3DPEHPK3PXP'),
    encryptSecret('+447700900000'),
  )
  // The row that started all this: a GitHub App connection whose private key is
  // useless anywhere but the site that encrypted it.
  await db.$executeRawUnsafe(
    `INSERT INTO "GithubAppConnection" ("id", "appId", "appSlug", "installationId", "installationAccount",
                                        "privateKeyEncrypted", "webhookSecretEncrypted", "createdAt", "updatedAt")
     VALUES ('gh-1', '12345', 'cactus-test', '999', 'acme', $1, $2, now(), now())`,
    encryptSecret('-----BEGIN RSA PRIVATE KEY-----not a real key-----END RSA PRIVATE KEY-----'),
    encryptSecret('webhook-secret'),
  )
  // A member enrolled in authenticator-app 2FA. Member sign-in REFUSES an account
  // with no two-factor config at all, so an unreadable one must be demoted, never
  // deleted - see lib/backup/secrets.ts.
  await db.$executeRawUnsafe(
    `INSERT INTO "Member" ("id", "email", "username", "createdAt", "updatedAt")
     VALUES ('member-1', 'member@example.com', 'member', now(), now())`,
  )
  await db.$executeRawUnsafe(
    `INSERT INTO "MemberTwoFactor" ("id", "memberId", "method", "secretEncrypted", "verified", "createdAt")
     VALUES ('m2fa-1', 'member-1', 'AUTHENTICATOR_APP', $1, true, now())`,
    encryptSecret('KRSXG5CTMVRXEZLU'),
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
    `INSERT INTO "Layout" ("id", "name", "history", "priority", "updatedAt")
     VALUES ('layout-1', 'Default', $1::jsonb, 0, now())`,
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
  let vps: VpsConfig
  let role: TestRole
  let srcDatabase: TestDatabase
  let dstDatabase: TestDatabase
  let srcDb: ExtendedPrismaClient
  let dstDb: ExtendedPrismaClient
  let tables: string[]
  let backupSql: string

  beforeAll(async () => {
    vps = vpsConfigFromEnv()
    // Anything a previous crashed run left behind, before adding more.
    await dropStaleTestObjects(vps)

    // Seed as the SOURCE site: every secret below is encrypted with its key.
    process.env.ENCRYPTION_KEY = SOURCE_KEY

    const stamp = Date.now()
    role = await createTestRole(vps, `cactus_rt_role_${stamp}`)

    // Source = a fresh database built from the core schema and seeded.
    srcDatabase = await createTestDatabase(vps, `cactus_rt_src_${stamp}`, role)
    srcDb = await connect(srcDatabase.connectionUri)
    await applySchema(srcDb)
    await seedAwkwardValues(srcDb)
    tables = await listTables(srcDb)

    // Target = a clone of the seeded source, so the two start identical and the
    // restore has something faithful to be checked against. Postgres will not copy
    // a template anybody is connected to, hence the disconnect; Prisma reconnects
    // by itself on the next query.
    await srcDb.$disconnect()
    dstDatabase = await createTestDatabase(vps, `cactus_rt_dst_${stamp}`, role, srcDatabase.name)
    dstDb = await connect(dstDatabase.connectionUri)
  }, 600_000)

  // Cleanup runs whatever happened above: a half-provisioned run must still leave
  // the server as it found it. Each step is independently guarded so one failure
  // cannot strand the rest, and the final sweep is the backstop.
  afterAll(async () => {
    await srcDb?.$disconnect().catch(() => {})
    await dstDb?.$disconnect().catch(() => {})
    if (!vps) return
    if (dstDatabase) await dropTestDatabase(vps, dstDatabase.name).catch(() => {})
    if (srcDatabase) await dropTestDatabase(vps, srcDatabase.name).catch(() => {})
    if (role) await dropTestRole(vps, role.name).catch(() => {})
    await dropStaleTestObjects(vps).catch(() => {})
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
    // Restoring under the key that wrote them, so every secret is readable and
    // nothing may be thrown away. The byte-identical check below covers this too,
    // but an over-eager sweep deserves to fail by name.
    expect(result.secretsChecked).toBe(true)
    expect(result.clearedSecrets).toEqual([])

    const actualTables = await tableHashes(dstDb, tables)
    const mismatched = tables.filter((t) => actualTables.get(t) !== expectedTables.get(t))
    expect(mismatched, 'these tables did not survive the round-trip').toEqual([])
  }, 600_000)

  // The bug this was written for: restore dwoffice.furniture onto a fresh install and
  // the site announced GitHub was connected, then failed every call to it with
  // OpenSSL's "Unsupported state or unable to authenticate data" - because a fresh
  // install mints its own ENCRYPTION_KEY, and the restored credentials were encrypted
  // with the old one.
  it('clears the secrets it cannot decrypt, so a restored site never claims a connection it has not got', async () => {
    // A different install, therefore a different key. This is the NORMAL case for a
    // restore, not an exotic one.
    process.env.ENCRYPTION_KEY = OTHER_KEY
    try {
      const result = await restoreDatabaseFromSql(backupSql, dstDb)
      expect(result.secretsChecked).toBe(true)
      expect(result.clearedSecrets.join(' | ')).toMatch(/GitHub App connection/)

      // The row that did the lying.
      const gh = await dstDb.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM "GithubAppConnection"`,
      )
      expect(Number(gh[0]!.n)).toBe(0)

      // An enrolment left behind offers the owner an authenticator step at login that
      // no code on earth can satisfy, so the flags go with the secret.
      const [user] = await dstDb.$queryRawUnsafe<
        { totpSecretEncrypted: string | null; totpVerifiedAt: Date | null; smsOtpPhoneEncrypted: string | null }[]
      >(`SELECT "totpSecretEncrypted", "totpVerifiedAt", "smsOtpPhoneEncrypted" FROM "User" WHERE "id" = 'user-1'`)
      expect(user!.totpSecretEncrypted).toBeNull()
      expect(user!.totpVerifiedAt).toBeNull()
      expect(user!.smsOtpPhoneEncrypted).toBeNull()

      // The member keeps a second factor: demoted to an emailed code, never deleted -
      // member sign-in refuses an account with no two-factor config at all, so deleting
      // the row would lock them out just as thoroughly as leaving the dead secret in it.
      const m2fa = await dstDb.$queryRawUnsafe<
        { method: string; secretEncrypted: string | null; verified: boolean }[]
      >(`SELECT "method"::text AS method, "secretEncrypted", "verified" FROM "MemberTwoFactor" WHERE "memberId" = 'member-1'`)
      expect(m2fa).toHaveLength(1)
      expect(m2fa[0]!.method).toBe('EMAIL')
      expect(m2fa[0]!.secretEncrypted).toBeNull()
      expect(m2fa[0]!.verified).toBe(false)

      // None of which is licence to touch the actual content.
      const pages = await dstDb.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "InfoPage"`)
      expect(Number(pages[0]!.n)).toBe(1)
    } finally {
      process.env.ENCRYPTION_KEY = SOURCE_KEY
    }
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
