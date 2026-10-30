import { createHmac } from 'crypto'
import { readFileSync } from 'fs'
import path from 'path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import {
  connectionUri,
  createTestDatabase,
  createTestRole,
  dropStaleTestObjects,
  dropTestDatabase,
  dropTestRole,
  TEST_PREFIX,
  vpsConfigFromEnv,
} from '@/lib/backup/vps-database'
import { splitMigrationStatements } from '@/lib/backup/migration-sql'
import { clearUnreadableSecrets } from '@/lib/backup/secrets'
import { derivationSalt, hmacVerify, keyFingerprint, readingKeys, resetKeyringState } from './keyring'
import { loadKeyring } from './keyring-loader'
import { dryRunRotation, rollbackLatestRotation, rotateEncryptionKey, RotationBlockedError } from './rotation'
import { decryptSecret, encryptSecret, encryptWithKey, tryDecryptWithKey } from './secrets'

// The rotation against a real Postgres: core and module columns side by side, a
// value nobody can read, a crash halfway, a second run, a roll-back, and the
// swapped-in key reading everything from history. `npm run test:key-rotation`.
//
// Needs OVH_SERVER / OVH_USER / OVH_PASSWORD exported (from the Deskwell
// workspace's .env) - with RUN_KEY_ROTATION=1 and no server details it FAILS
// rather than skipping, because a skip here is a pass nobody earned. Provisions
// and drops its own throwaway database under TEST_PREFIX; touches nothing else.

const shared = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/db/prisma', async (original) => {
  const real = await original<typeof import('@/lib/db/prisma')>()
  return { ...real, get prisma() { return shared.client ?? real.prisma } }
})

const shouldRun = process.env.RUN_KEY_ROTATION === '1'

const OLD = '1a'.repeat(32)
const NEW = '2b'.repeat(32)
const STRANGER = '3c'.repeat(32)

const saved = { key: process.env.ENCRYPTION_KEY, next: process.env.ENCRYPTION_KEY_NEXT }

function env(current: string | undefined, next?: string) {
  if (current === undefined) delete process.env.ENCRYPTION_KEY
  else process.env.ENCRYPTION_KEY = current
  if (next === undefined) delete process.env.ENCRYPTION_KEY_NEXT
  else process.env.ENCRYPTION_KEY_NEXT = next
}

// Every value the suite planted, by where it lives.
type Planted = { table: string; column: string; id: string; plain: string }

describe.skipIf(!shouldRun)('encryption key rotation against a real database', () => {
  // Read in beforeAll, not here: a skipped describe still runs its body.
  let cfg: ReturnType<typeof vpsConfigFromEnv>
  let db: PrismaClient
  let dbName: string
  let roleName: string
  const planted: Planted[] = [
    { table: 'SiteConfig', column: 'pushVapidPrivateEncrypted', id: 'singleton', plain: 'vapid-private' },
    { table: 'GithubAppConnection', column: 'privateKeyEncrypted', id: 'gh', plain: '-----BEGIN RSA PRIVATE KEY-----' },
    { table: 'GithubAppConnection', column: 'webhookSecretEncrypted', id: 'gh', plain: 'webhook' },
    { table: 'fake_module_settings', column: 'api_key_encrypted', id: 'm1', plain: 'module-api-key' },
    { table: 'fake_module_settings', column: 'token_enc', id: 'm1', plain: 'social-style-token' },
    { table: 'fake_module_settings', column: 'api_key_encrypted', id: 'm2', plain: 'second-row' },
  ]

  async function valueOf(p: Pick<Planted, 'table' | 'column' | 'id'>): Promise<string | null> {
    const rows = await db.$queryRawUnsafe<{ v: string | null }[]>(
      `SELECT "${p.column}" AS v FROM "${p.table}" WHERE "id" = $1`,
      p.id,
    )
    return rows[0]?.v ?? null
  }

  async function snapshot(): Promise<(string | null)[]> {
    return Promise.all(planted.map(valueOf))
  }

  beforeAll(async () => {
    cfg = vpsConfigFromEnv()
    env(OLD)
    resetKeyringState()
    const suffix = `${Date.now()}`.slice(-9)
    dbName = `${TEST_PREFIX}keyrot_${suffix}`
    roleName = `${TEST_PREFIX}role_keyrot_${suffix}`
    await dropStaleTestObjects(cfg)
    const role = await createTestRole(cfg, roleName)
    await createTestDatabase(cfg, dbName, role)
    db = new PrismaClient({ datasources: { db: { url: connectionUri(cfg, dbName, role) } } })
    shared.client = db

    const initSql = path.join(process.cwd(), 'prisma/migrations/20260626000000_init/migration.sql')
    for (const s of splitMigrationStatements(readFileSync(initSql, 'utf8'))) await db.$executeRawUnsafe(s)

    // A module's table, as a module would write it: one "_encrypted" column, one
    // social-hub style "_enc" column, and a plain value in an encrypted-named
    // column that is not ours and must be left alone.
    await db.$executeRawUnsafe(`
      CREATE TABLE "fake_module_settings" (
        "id" TEXT PRIMARY KEY,
        "api_key_encrypted" TEXT,
        "token_enc" TEXT,
        "legacy_encrypted" TEXT
      )`)

    await db.$executeRawUnsafe(
      `INSERT INTO "SiteConfig" ("id", "adminPath", "updatedAt") VALUES ('singleton', 'hq', CURRENT_TIMESTAMP)`,
    )
    await db.$executeRawUnsafe(
      `INSERT INTO "GithubAppConnection" ("id", "appId", "appSlug", "privateKeyEncrypted", "updatedAt")
       VALUES ('gh', '1', 'app', 'x', CURRENT_TIMESTAMP)`,
    )
    await db.$executeRawUnsafe(`INSERT INTO "fake_module_settings" ("id", "legacy_encrypted") VALUES ('m1', 'plain text, not ours'), ('m2', NULL)`)
    for (const p of planted) {
      await db.$executeRawUnsafe(`UPDATE "${p.table}" SET "${p.column}" = $1 WHERE "id" = $2`, encryptSecret(p.plain), p.id)
    }
  }, 300_000)

  afterAll(async () => {
    shared.client = null
    await db?.$disconnect()
    if (dbName) await dropTestDatabase(cfg, dbName)
    if (roleName) await dropTestRole(cfg, roleName)
    resetKeyringState()
    env(saved.key, saved.next)
  }, 120_000)

  it('dry run counts every value per area and proves each decrypts', async () => {
    env(OLD, NEW)
    const report = await dryRunRotation(db, NEW)
    expect(report.unreadable).toBe(0)
    expect(report.totalValues).toBe(planted.length)
    const fake = report.columns.filter((c) => c.table === 'fake_module_settings')
    expect(fake.map((c) => c.column).sort()).toEqual(['api_key_encrypted', 'legacy_encrypted', 'token_enc'])
    expect(fake.find((c) => c.column === 'legacy_encrypted')?.notOurs).toBe(1)
    expect(report.areas).toContainEqual({ area: 'the GitHub App connection', values: 2 })
    expect(report.areas).toContainEqual({ area: 'browser push notifications', values: 1 })
  })

  it('a value no key can read is reported, and blocks the rotation without changing anything', async () => {
    await db.$executeRawUnsafe(
      `INSERT INTO "fake_module_settings" ("id", "api_key_encrypted") VALUES ('dead', $1)`,
      encryptWithKey('from another site', STRANGER),
    )
    const report = await dryRunRotation(db, NEW)
    expect(report.unreadable).toBe(1)
    expect(report.unreadableAreas).toEqual(['stored secrets in fake_module_settings'])

    const before = await snapshot()
    await expect(rotateEncryptionKey(db, NEW)).rejects.toBeInstanceOf(RotationBlockedError)
    expect(await snapshot()).toEqual(before)

    // The "clear these" button: the restore's own clearer, nothing else touched.
    const cleared = await clearUnreadableSecrets(db)
    expect(cleared.cleared).toEqual(['stored secrets in fake_module_settings'])
    expect(await valueOf({ table: 'fake_module_settings', column: 'api_key_encrypted', id: 'dead' })).toBeNull()
    expect(await snapshot()).toEqual(before)
    expect((await dryRunRotation(db, NEW)).unreadable).toBe(0)
  })

  it('a crash mid-rotation leaves the site exactly as it was', async () => {
    const before = await snapshot()
    let seen = 0
    await expect(
      rotateEncryptionKey(db, NEW, {
        onValue: () => {
          if (++seen === 3) throw new Error('power cut')
        },
      }),
    ).rejects.toThrow('power cut')
    expect(seen).toBe(3)
    expect(await snapshot()).toEqual(before)
    expect(await db.encryptionKey.count()).toBe(0)
    expect(await db.encryptionKeyRotation.count()).toBe(0)
    const config = await db.siteConfig.findUniqueOrThrow({ where: { id: 'singleton' } })
    expect(config.encryptionKeyActiveFingerprint).toBeNull()
    expect(config.derivationSaltEncrypted).toBeNull()
  })

  it('rotates: everything under the new key, the old key in history, ids unchanged', async () => {
    const result = await rotateEncryptionKey(db, NEW)
    expect(result.alreadyDone).toBe(false)
    expect(result.keysRetired).toBe(1)
    expect(result.areas).toContainEqual({ area: 'stored secrets in fake_module_settings', values: 3 })

    for (const p of planted) {
      const v = await valueOf(p)
      expect(tryDecryptWithKey(v, NEW)).toBe(p.plain)
      expect(tryDecryptWithKey(v, OLD)).toBeNull()
    }
    expect(await valueOf({ table: 'fake_module_settings', column: 'legacy_encrypted', id: 'm1' })).toBe('plain text, not ours')

    const history = await db.encryptionKey.findMany()
    expect(history).toHaveLength(1)
    expect(history[0]?.fingerprint).toBe(keyFingerprint(OLD))
    expect(tryDecryptWithKey(history[0]?.keyEncrypted, NEW)).toBe(OLD)

    const config = await db.siteConfig.findUniqueOrThrow({ where: { id: 'singleton' } })
    expect(config.encryptionKeyActiveFingerprint).toBe(keyFingerprint(NEW))
    expect(tryDecryptWithKey(config.derivationSaltEncrypted, NEW)).toBe(OLD)
  })

  it('S2: the running site reads and writes under the new key once it reloads', async () => {
    await loadKeyring(db)
    expect(readingKeys()[0]).toBe(NEW)
    for (const p of planted) expect(decryptSecret((await valueOf(p)) as string)).toBe(p.plain)
    expect(tryDecryptWithKey(encryptSecret('fresh'), NEW)).toBe('fresh')
  })

  it('running it twice does nothing the second time', async () => {
    const before = await snapshot()
    const again = await rotateEncryptionKey(db, NEW)
    expect(again.alreadyDone).toBe(true)
    expect(await snapshot()).toEqual(before)
    expect(await db.encryptionKeyRotation.count()).toBe(1)
  })

  it('rolls back while the old key is still on the host, including secrets saved since', async () => {
    await db.$executeRawUnsafe(
      `UPDATE "fake_module_settings" SET "token_enc" = $1 WHERE "id" = 'm2'`,
      encryptSecret('saved after the rotation'),
    )
    const result = await rollbackLatestRotation(db)
    expect(result.valuesRestored).toBeGreaterThanOrEqual(planted.length + 1)
    for (const p of planted) expect(tryDecryptWithKey(await valueOf(p), OLD)).toBe(p.plain)
    expect(tryDecryptWithKey(await valueOf({ table: 'fake_module_settings', column: 'token_enc', id: 'm2' }), OLD)).toBe(
      'saved after the rotation',
    )
    expect(await db.encryptionKey.count()).toBe(0)
    const config = await db.siteConfig.findUniqueOrThrow({ where: { id: 'singleton' } })
    expect(config.encryptionKeyActiveFingerprint).toBe(keyFingerprint(OLD))
    expect(config.derivationSaltEncrypted).toBeNull()
    await loadKeyring(db)
    expect(readingKeys()[0]).toBe(OLD)
  })

  it('S3: after the swap, the new key alone reads everything and old links still verify', async () => {
    const oldLink = createHmac('sha256', OLD).update('receipt:1001').digest('base64url')
    await rotateEncryptionKey(db, NEW)

    // The redeploy: ENCRYPTION_KEY is now the new key, NEXT is gone, and the
    // instance boots fresh.
    env(NEW)
    resetKeyringState()
    await loadKeyring(db)

    expect(readingKeys()).toEqual([NEW, OLD])
    expect(derivationSalt()).toBe(OLD)
    expect(hmacVerify('receipt:1001', oldLink)).toBe(true)
    for (const p of planted) expect(decryptSecret((await valueOf(p)) as string)).toBe(p.plain)
    await expect(rollbackLatestRotation(db)).rejects.toBeInstanceOf(RotationBlockedError)
  })
})
