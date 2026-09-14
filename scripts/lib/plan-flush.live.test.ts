// RUN_PLAN_FLUSH=1: real queries and backend cleanup, against a database this
// suite creates itself. The application's DATABASE_URL is never read.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { vpsConfigFromEnv, createTestRole, createTestDatabase, connectionUri, dropTestDatabase, dropTestRole, TEST_PREFIX } from '../../lib/backup/vps-database'
import { beginPlanFlush, finishPlanFlush, migrationFingerprint, sweepPlans } from './plan-flush.mjs'

const enabled = process.env.RUN_PLAN_FLUSH === '1'
describe.skipIf(!enabled)('query-plan bookkeeping on throwaway Postgres', () => {
  let cfg: ReturnType<typeof vpsConfigFromEnv>
  let dbName: string
  let roleName: string
  let url: string
  let client: pg.Client

  beforeAll(async () => {
    cfg = vpsConfigFromEnv()
    const suffix = Date.now().toString().slice(-9)
    dbName = `${TEST_PREFIX}flush_${suffix}`
    roleName = `${TEST_PREFIX}role_flush_${suffix}`
    const role = await createTestRole(cfg, roleName)
    await createTestDatabase(cfg, dbName, role)
    const endpoint = new URL(connectionUri(cfg, dbName, role))
    endpoint.searchParams.set('sslmode', 'verify-full')
    url = endpoint.toString()
    client = new pg.Client({ connectionString: url })
    await client.connect()
    expect(await beginPlanFlush(client)).toEqual({ before: null, previous: null })
    await client.query(`
      CREATE TABLE "ModuleMigration" (
        "id" text PRIMARY KEY, "moduleName" text NOT NULL, "migrationName" text NOT NULL,
        "checksum" text NOT NULL, "appliedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE ("moduleName", "migrationName")
      );
      CREATE TABLE "_prisma_migrations" (
        migration_name text NOT NULL, checksum text NOT NULL,
        finished_at timestamptz, rolled_back_at timestamptz
      );
    `)
    await client.query('SELECT pg_advisory_unlock_all()')
  }, 120_000)

  afterAll(async () => {
    await client?.end().catch(() => {})
    if (cfg && dbName) await dropTestDatabase(cfg, dbName)
    if (cfg && roleName) await dropTestRole(cfg, roleName)
  }, 120_000)

  it('executes the marker SQL and real two-pass sweep, then skips an unchanged deploy', async () => {
    const idle = new pg.Client({ connectionString: url })
    const ended = new Promise<void>((resolve) => idle.on('error', () => resolve()))
    await idle.connect()
    try {
      const state = await beginPlanFlush(client)
      expect(await finishPlanFlush(client, state)).toEqual({ skipped: false })
      await ended
      await client.query('SELECT pg_advisory_unlock_all()')
      const next = await beginPlanFlush(client)
      expect(await finishPlanFlush(client, next, { sweep: async () => { throw new Error('unchanged deployment must not sweep') } })).toEqual({ skipped: true })
    } finally {
      await idle.end().catch(() => {})
      await client.query('SELECT pg_advisory_unlock_all()')
    }
  }, 20_000)

  it('detects Prisma and module changes, and interrupted runs with unchanged ledgers', async () => {
    const before = await migrationFingerprint(client)
    const state = await beginPlanFlush(client)
    await client.query(`INSERT INTO "_prisma_migrations" VALUES ('init', 'hash', NOW(), NULL)`)
    expect(await migrationFingerprint(client)).not.toBe(before)
    expect(await finishPlanFlush(client, state, { sweep: (connection) => sweepPlans(connection, async () => {}) })).toEqual({ skipped: false })
    await client.query('SELECT pg_advisory_unlock_all()')
    const moduleBefore = await migrationFingerprint(client)
    await client.query(`INSERT INTO "ModuleMigration" VALUES ('example', 'example', '001.sql', 'hash', NOW())`)
    expect(await migrationFingerprint(client)).not.toBe(moduleBefore)
    await beginPlanFlush(client)
    await client.query('SELECT pg_advisory_unlock_all()') // Pending marker survives the lost session.
    const recovery = await beginPlanFlush(client)
    expect(await finishPlanFlush(client, recovery, { sweep: (connection) => sweepPlans(connection, async () => {}) })).toEqual({ skipped: false })
    await client.query('SELECT pg_advisory_unlock_all()')
  }, 20_000)

  it('serialises concurrent deployment trackers', async () => {
    const other = new pg.Client({ connectionString: url })
    await other.connect()
    try {
      await beginPlanFlush(client)
      const { rows } = await other.query('SELECT pg_try_advisory_lock(1128350548, 1347174734) AS acquired')
      expect(rows[0].acquired).toBe(false)
      await client.query('SELECT pg_advisory_unlock_all()')
      expect((await other.query('SELECT pg_try_advisory_lock(1128350548, 1347174734) AS acquired')).rows[0].acquired).toBe(true)
    } finally {
      await other.end()
      await client.query('SELECT pg_advisory_unlock_all()')
    }
  })
})
