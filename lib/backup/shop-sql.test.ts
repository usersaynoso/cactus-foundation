import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'
import {
  vpsConfigFromEnv, createTestRole, createTestDatabase, connectionUri,
  dropTestDatabase, dropTestRole, dropStaleTestObjects, TEST_PREFIX,
} from './vps-database'
import { rememberAddressForMember } from '@/modules/shop/lib/db/addresses'
import type { ShpAddress } from '@/modules/shop/lib/types'

// Shop's migrations carry $$-quoted DO blocks, which is exactly why the
// round-trip's own splitter refuses the module. Semicolons inside a dollar-quoted
// body are not statement ends, so this walks the text and skips those regions.
function splitPgStatements(sql: string): string[] {
  const out: string[] = []
  let start = 0
  let i = 0
  while (i < sql.length) {
    const two = sql.slice(i, i + 2)
    if (two === '--') { const nl = sql.indexOf('\n', i); i = nl === -1 ? sql.length : nl + 1; continue }
    if (two === '/*') { const end = sql.indexOf('*/', i + 2); i = end === -1 ? sql.length : end + 2; continue }
    if (sql[i] === "'") {
      i++
      while (i < sql.length && sql[i] !== "'") i++
      i++
      continue
    }
    const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i))
    if (tag) {
      const close = sql.indexOf(tag[0], i + tag[0].length)
      i = close === -1 ? sql.length : close + tag[0].length
      continue
    }
    if (sql[i] === ';') {
      const stmt = sql.slice(start, i).trim()
      if (stmt) out.push(stmt)
      start = i + 1
    }
    i++
  }
  const tail = sql.slice(start).trim()
  if (tail) out.push(tail)
  return out
}

// Shop's own SQL, executed. `npm run test:shop-sql`.
//
// The backup round-trip beside this file skips shop entirely: its splitter
// cannot see past the $$-quoted DO blocks in shop's migrations, so the module is
// dropped at read time and nothing in the whole suite ever runs a shp_ statement.
// Typecheck, eslint and the build are all green on SQL that Postgres will not
// parse - raw SQL is a string to every one of them - so the only proof is
// Postgres, which is what this is.
//
// Covers the supplier page work: the 034 migration's back-fill and collision
// numbering, the slug-to-products hop listProducts builds, the sitemap's
// published-and-stocked query, and a jsonb write-up round-tripping.
//
// SKIPS SILENTLY without OVH_SERVER / OVH_USER / OVH_PASSWORD in the shell, the
// same way roundtrip.test.ts does. A skip is not a pass - export them from the
// Deskwell workspace's .env for the run. Provisions and drops its own throwaway
// database, named under TEST_PREFIX; it never touches anything else on the box.
const cfg = (() => { try { return vpsConfigFromEnv() } catch { return null } })()

describe.skipIf(!cfg)('supplier page SQL against a real database', () => {
  let db: PrismaClient
  let dbName: string
  let roleName: string

  beforeAll(async () => {
    const suffix = `${Date.now()}`.slice(-9)
    dbName = `${TEST_PREFIX}sup_${suffix}`
    roleName = `${TEST_PREFIX}role_sup_${suffix}`
    await dropStaleTestObjects(cfg!)
    const role = await createTestRole(cfg!, roleName)
    await createTestDatabase(cfg!, dbName, role)
    db = new PrismaClient({ datasources: { db: { url: connectionUri(cfg!, dbName, role) } } })

    // Core first: shop's migrations reference core tables (Layout, Media).
    const initSql = path.join(process.cwd(), 'prisma/migrations/20260626000000_init/migration.sql')
    for (const s of splitPgStatements(readFileSync(initSql, 'utf8'))) {
      await db.$executeRawUnsafe(s)
    }

    const dir = path.join(process.cwd(), 'modules/shop/migrations')
    expect(existsSync(dir)).toBe(true)
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      for (const s of splitPgStatements(readFileSync(path.join(dir, f), 'utf8'))) {
        await db.$executeRawUnsafe(s)
      }
    }
  }, 300_000)

  afterAll(async () => {
    await db?.$disconnect()
    if (dbName) await dropTestDatabase(cfg!, dbName)
    if (roleName) await dropTestRole(cfg!, roleName)
  }, 120_000)

  it('back-fills a slug per supplier and settles collisions', async () => {
    // Two names that slugify to the same thing. The migration back-fills BEFORE
    // it creates the unique index - which is the whole reason it can - so the
    // probe drops the index to reproduce that order faithfully, and puts it back
    // afterwards to prove the settled slugs actually satisfy it.
    await db.$executeRawUnsafe(`DROP INDEX "shp_suppliers_slug_lower_key"`)
    await db.$executeRawUnsafe(`INSERT INTO "shp_suppliers" ("name") VALUES ('A & B'), ('A B')`)
    await db.$executeRawUnsafe(`
      UPDATE "shp_suppliers"
         SET "slug" = COALESCE(NULLIF(btrim(regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g'), '-'), ''), 'supplier')
       WHERE "slug" IS NULL`)
    await db.$executeRawUnsafe(`
      WITH ranked AS (
        SELECT "id", "slug", row_number() OVER (PARTITION BY "slug" ORDER BY "created_at" ASC, "id" ASC) AS n
          FROM "shp_suppliers" WHERE "slug" IS NOT NULL
      )
      UPDATE "shp_suppliers" s SET "slug" = ranked."slug" || '-' || ranked.n
        FROM ranked WHERE ranked."id" = s."id" AND ranked.n > 1`)

    await db.$executeRawUnsafe(`
      CREATE UNIQUE INDEX "shp_suppliers_slug_lower_key"
          ON "shp_suppliers" (LOWER("slug")) WHERE "slug" IS NOT NULL`)

    const rows = await db.$queryRawUnsafe<Array<{ slug: string }>>(`SELECT "slug" FROM "shp_suppliers" ORDER BY "slug"`)
    expect(rows.map((r) => r.slug).sort()).toEqual(['a-b', 'a-b-2'])
  }, 60_000)

  it('finds a supplier page\'s products through the slug', async () => {
    await db.$executeRawUnsafe(`UPDATE "shp_suppliers" SET "storefront_visible" = true WHERE "slug" = 'a-b'`)
    // Which of the two colliding names kept the clean slug is decided by insert
    // order, so read it back rather than assuming - the point of the test is the
    // slug-to-products hop, not who won the tie.
    const owners = await db.$queryRawUnsafe<Array<{ name: string }>>(`SELECT "name" FROM "shp_suppliers" WHERE "slug" = 'a-b'`)
    expect(owners).toHaveLength(1)
    const owner = owners[0]!
    // Deliberately cased differently from the supplier record: a name typed into
    // a spreadsheet import is not going to match the directory's capitalisation,
    // which is exactly why both sides of the comparison are lower-cased.
    await db.$executeRawUnsafe(`
      INSERT INTO "shp_products" ("name", "slug", "type", "price", "status", "supplier")
      VALUES ('Theirs', 'theirs', 'PHYSICAL', 10, 'ACTIVE', $1),
             ('Someone else''s', 'other', 'PHYSICAL', 10, 'ACTIVE', 'Nobody')`, owner.name.toUpperCase())

    // The exact predicate listProducts builds for supplierSlug.
    const hits = await db.$queryRawUnsafe<Array<{ name: string }>>(`
      SELECT p."name" FROM "shp_products" p
       WHERE LOWER(p."supplier") = (
         SELECT LOWER(s."name") FROM "shp_suppliers" s WHERE LOWER(s."slug") = LOWER('a-b') LIMIT 1
       )`)
    expect(hits.map((h) => h.name)).toEqual(['Theirs'])

    // And an address nothing answers to returns nothing rather than everything.
    const none = await db.$queryRawUnsafe<Array<{ name: string }>>(`
      SELECT p."name" FROM "shp_products" p
       WHERE LOWER(p."supplier") = (
         SELECT LOWER(s."name") FROM "shp_suppliers" s WHERE LOWER(s."slug") = LOWER('nothing-here') LIMIT 1
       )`)
    expect(none).toEqual([])
  }, 60_000)

  it('lists only published suppliers that have something on sale, for the sitemap', async () => {
    const rows = await db.$queryRawUnsafe<Array<{ slug: string }>>(`
      SELECT s."slug" FROM "shp_suppliers" s
      WHERE s."storefront_visible" = true AND s."slug" IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM "shp_products" p
           WHERE LOWER(p."supplier") = LOWER(s."name")
             AND p."status" = 'ACTIVE' AND p."catalogue_hidden" = false
        )`)
    expect(rows.map((r) => r.slug)).toEqual(['a-b'])
  }, 60_000)

  it('writes and reads back the page columns, designed write-up included', async () => {
    await db.$executeRawUnsafe(`
      UPDATE "shp_suppliers"
         SET "short_description" = 'One line', "description" = 'Two paragraphs',
             "description_puck" = '{"root":{"props":{}},"content":[],"zones":{}}'::jsonb,
             "meta_title" = 'T', "meta_description" = 'D'
       WHERE "slug" = 'a-b'`)
    const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT "short_description", "meta_title", ("description_puck" IS NOT NULL) AS has_designed_description
        FROM "shp_suppliers" WHERE "slug" = 'a-b'`)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.short_description).toBe('One line')
    expect(rows[0]!.has_designed_description).toBe(true)
  }, 60_000)
})

// The address book's one statement, executed. rememberAddressForMember builds
// its dedupe key in SQL and its "first address wins the default" flag in the
// INSERT itself, both of which are invisible to every other gate: a typo in
// either parses as a perfectly good TypeScript string and only misbehaves once
// Postgres has it. Runs the real function against a throwaway database rather
// than a copy of its SQL, so the two cannot drift.
describe.skipIf(!cfg)('address book SQL against a real database', () => {
  let db: PrismaClient
  let dbName: string
  let roleName: string

  beforeAll(async () => {
    const suffix = `${Date.now()}`.slice(-9)
    dbName = `${TEST_PREFIX}addr_${suffix}`
    roleName = `${TEST_PREFIX}role_addr_${suffix}`
    const role = await createTestRole(cfg!, roleName)
    await createTestDatabase(cfg!, dbName, role)
    db = new PrismaClient({ datasources: { db: { url: connectionUri(cfg!, dbName, role) } } })

    const initSql = path.join(process.cwd(), 'prisma/migrations/20260626000000_init/migration.sql')
    for (const s of splitPgStatements(readFileSync(initSql, 'utf8'))) {
      await db.$executeRawUnsafe(s)
    }
    const dir = path.join(process.cwd(), 'modules/shop/migrations')
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      for (const s of splitPgStatements(readFileSync(path.join(dir, f), 'utf8'))) {
        await db.$executeRawUnsafe(s)
      }
    }
  }, 300_000)

  afterAll(async () => {
    await db?.$disconnect()
    if (dbName) await dropTestDatabase(cfg!, dbName)
    if (roleName) await dropTestRole(cfg!, roleName)
  }, 120_000)

  const address = (over: Partial<ShpAddress> = {}): ShpAddress => ({
    firstName: 'Ada', lastName: 'Lovelace',
    line1: '12 Bridge Street', city: 'Bath', postcode: 'BA1 1AA', country: 'GB', ...over,
  })

  async function book(memberId: string) {
    return db.$queryRawUnsafe<Array<{ label: string | null; is_default: boolean; line1: string }>>(`
      SELECT "label", "is_default", "address"->>'line1' AS line1
        FROM "shp_saved_addresses" WHERE "member_id" = $1 ORDER BY "created_at" ASC`, memberId)
  }

  it('files the first delivery address as the default and never files that door twice', async () => {
    const member = 'mbr-delivery'
    await rememberAddressForMember(member, address(), { client: db })
    // Same door, typed the way a different person types it. The key drops case
    // and spacing, so this is not a second address.
    await rememberAddressForMember(member, address({ postcode: 'ba1  1aa', firstName: 'Someone', lastName: 'Else' }), { client: db })
    await rememberAddressForMember(member, address({ line1: '9 Mill Lane', postcode: 'BS1 2BB' }), { client: db })

    const rows = await book(member)
    expect(rows.map((r) => r.line1)).toEqual(['12 Bridge Street', '9 Mill Lane'])
    // Only the first, and only ever one.
    expect(rows.map((r) => r.is_default)).toEqual([true, false])
  }, 60_000)

  it('files a billing address labelled, and never as the default even when it is the first', async () => {
    const member = 'mbr-billing'
    await rememberAddressForMember(member, address({ firstName: '', lastName: '', line1: '1 Head Office Way', postcode: 'EC1 1AA' }),
      { label: 'Billing address', canBecomeDefault: false, client: db })

    let rows = await book(member)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.label).toBe('Billing address')
    // The default is what the next checkout offers to deliver to, and this
    // address carries no name and no phone number - it must not be it.
    expect(rows[0]!.is_default).toBe(false)

    // The delivery address that comes after it still gets the default, since
    // the member has none.
    await rememberAddressForMember(member, address(), { client: db })
    rows = await book(member)
    expect(rows.map((r) => [r.line1, r.is_default])).toEqual([
      ['1 Head Office Way', false],
      ['12 Bridge Street', true],
    ])
  }, 60_000)

  it('does not file a billing address at a door already in the book', async () => {
    const member = 'mbr-same-door'
    await rememberAddressForMember(member, address(), { client: db })
    await rememberAddressForMember(member, address({ firstName: '', lastName: '' }),
      { label: 'Billing address', canBecomeDefault: false, client: db })

    const rows = await book(member)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.label).toBeNull()
  }, 60_000)
})
