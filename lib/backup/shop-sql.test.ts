import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'
import {
  vpsConfigFromEnv, createTestRole, createTestDatabase, connectionUri,
  dropTestDatabase, dropTestRole, dropStaleTestObjects, TEST_PREFIX,
} from './vps-database'
import { rememberAddressForMember } from '@/modules/shop/lib/db/addresses'
import { getDeductionRules, listOrderSizeDeductionChecks } from '@/modules/shop/lib/db/suppliers'
import { getCategoryFaqChainBySlug, getCollectionFaqSetBySlug, getProductFaqCategoryChain } from '@/modules/shop/lib/db/catalogue'
import type { ShpAddress } from '@/modules/shop/lib/types'
import { splitMigrationStatements } from './migration-sql'

// Migrations are read with the shared dollar-quote-aware splitter, not the backup
// format's own - shop's migrations carry $$-quoted DO blocks and a semicolon
// inside one is not a statement end. See lib/backup/migration-sql.ts.

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
    for (const s of splitMigrationStatements(readFileSync(initSql, 'utf8'))) {
      await db.$executeRawUnsafe(s)
    }

    const dir = path.join(process.cwd(), 'modules/shop/migrations')
    expect(existsSync(dir)).toBe(true)
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      for (const s of splitMigrationStatements(readFileSync(path.join(dir, f), 'utf8'))) {
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
    for (const s of splitMigrationStatements(readFileSync(initSql, 'utf8'))) {
      await db.$executeRawUnsafe(s)
    }
    const dir = path.join(process.cwd(), 'modules/shop/migrations')
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      for (const s of splitMigrationStatements(readFileSync(path.join(dir, f), 'utf8'))) {
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

// The order-size deduction's own SQL, executed.
//
// Three statements nothing else in the build can check: a LOWER(name) IN (...)
// against a Prisma.join, and the two catalogue reports, one of which joins
// products to suppliers on LOWER(name) and compares two NUMERIC columns. All
// three are strings to typecheck, to eslint and to the module build gate, and a
// query Postgres refuses parses exactly as well as one it accepts.
//
// The REAL functions are run rather than a copy of their SQL, so the two cannot
// drift apart - the same reasoning the address book probe above is built on.
describe.skipIf(!cfg)('order-size deduction SQL against a real database', () => {
  let db: PrismaClient
  let dbName: string
  let roleName: string

  beforeAll(async () => {
    const suffix = `${Date.now()}`.slice(-9)
    dbName = `${TEST_PREFIX}osd_${suffix}`
    roleName = `${TEST_PREFIX}role_osd_${suffix}`
    const role = await createTestRole(cfg!, roleName)
    await createTestDatabase(cfg!, dbName, role)
    db = new PrismaClient({ datasources: { db: { url: connectionUri(cfg!, dbName, role) } } })

    const initSql = path.join(process.cwd(), 'prisma/migrations/20260626000000_init/migration.sql')
    for (const s of splitMigrationStatements(readFileSync(initSql, 'utf8'))) {
      await db.$executeRawUnsafe(s)
    }
    const dir = path.join(process.cwd(), 'modules/shop/migrations')
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      for (const s of splitMigrationStatements(readFileSync(path.join(dir, f), 'utf8'))) {
        await db.$executeRawUnsafe(s)
      }
    }

    // Two suppliers, one with a threshold and one without, and four products
    // between them covering every branch both reports have.
    await db.$executeRawUnsafe(`
      INSERT INTO "shp_suppliers" ("name", "order_size_deduction_threshold")
      VALUES ('Dynamic Office Solutions', 350.00),
             ('Furdeco', NULL)`)
    await db.$executeRawUnsafe(`
      INSERT INTO "shp_products" ("name", "slug", "type", "status", "sku", "supplier", "price", "sale_price", "order_size_deduction")
      VALUES
        -- On offer, stamped, supplier has a rule: the ordinary case, on neither list.
        ('Metropolis', 'metropolis', 'PHYSICAL', 'ACTIVE', 'EX000230', 'Dynamic Office Solutions', 130.00, 116.00, 6.00),
        -- On offer, supplier has a rule, NOT stamped: the missing list.
        ('Vantage', 'vantage', 'PHYSICAL', 'ACTIVE', 'EX000231', 'Dynamic Office Solutions', 200.00, 180.00, NULL),
        -- Stamped with more than it is charged: the impossible list.
        ('Footstool', 'footstool', 'PHYSICAL', 'ACTIVE', 'EX000232', 'Dynamic Office Solutions', 12.00, 8.00, 9.00),
        -- On offer and unstamped, but its supplier has no rule: neither list.
        ('Lansdowne', 'lansdowne', 'PHYSICAL', 'ACTIVE', 'EX000233', 'Furdeco', 400.00, 380.00, NULL)`)
  }, 300_000)

  afterAll(async () => {
    await db?.$disconnect()
    if (dbName) await dropTestDatabase(cfg!, dbName)
    if (roleName) await dropTestRole(cfg!, roleName)
  }, 120_000)

  it('reads a supplier\'s rule by name, case-insensitively, and skips one with no threshold', async () => {
    const rules = await getDeductionRules(['dynamic office solutions', 'Furdeco', 'Nobody At All'], { client: db })
    expect(rules).toHaveLength(1)
    expect(rules[0]!.supplier).toBe('Dynamic Office Solutions')
    // NUMERIC(10,2) comes back as a Decimal; the query layer has to hand back a
    // number or the rule module compares a threshold against an object.
    expect(rules[0]!.threshold).toBe(350)
    expect(typeof rules[0]!.threshold).toBe('number')
  })

  it('asks nothing at all for an empty or blank list of names', async () => {
    expect(await getDeductionRules([], { client: db })).toEqual([])
    expect(await getDeductionRules(['', '   '], { client: db })).toEqual([])
  })

  it('finds the row stamped with more than it is charged, and only that one', async () => {
    const { impossible } = await listOrderSizeDeductionChecks(200, { client: db })
    expect(impossible.map((r) => r.sku)).toEqual(['EX000232'])
    // A decimal-pound string, exactly as every other NUMERIC on a product comes
    // back - Prisma's Decimal prints "9", not "9.00", so the report must not be
    // read as pre-formatted money. formatMoney does the formatting on screen.
    expect(Number(impossible[0]!.orderSizeDeduction)).toBe(9)
    expect(Number(impossible[0]!.salePrice)).toBe(8)
  })

  it('finds the on-offer row its supplier has a rule for but nothing stamped on', async () => {
    const { missing } = await listOrderSizeDeductionChecks(200, { client: db })
    // Vantage only: Metropolis is stamped, Footstool is stamped, and Lansdowne's
    // supplier has no threshold for it to be missing an amount against.
    expect(missing.map((r) => r.sku)).toEqual(['EX000231'])
    expect(missing[0]!.supplier).toBe('Dynamic Office Solutions')
  })
})

// ---------------------------------------------------------------------------
// Product FAQs: the walk from a product up its category tree (migration 055).
//
// A recursive CTE with a scalar sub-select feeding its non-recursive term - the
// exact shape nothing short of Postgres will tell you about. It is also the one
// query on the product page that can be wrong QUIETLY: a chain that came back
// in the wrong order would print the parent range's answers over the child's,
// and every check outside this file would stay green.
// ---------------------------------------------------------------------------
describe.skipIf(!cfg)('product FAQ category chain against a real database', () => {
  let db: PrismaClient
  let dbName: string
  let roleName: string

  beforeAll(async () => {
    const suffix = `${Date.now()}`.slice(-9)
    dbName = `${TEST_PREFIX}faq_${suffix}`
    roleName = `${TEST_PREFIX}role_faq_${suffix}`
    const role = await createTestRole(cfg!, roleName)
    await createTestDatabase(cfg!, dbName, role)
    db = new PrismaClient({ datasources: { db: { url: connectionUri(cfg!, dbName, role) } } })

    const initSql = path.join(process.cwd(), 'prisma/migrations/20260626000000_init/migration.sql')
    for (const s of splitMigrationStatements(readFileSync(initSql, 'utf8'))) {
      await db.$executeRawUnsafe(s)
    }
    const dir = path.join(process.cwd(), 'modules/shop/migrations')
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      for (const s of splitMigrationStatements(readFileSync(path.join(dir, f), 'utf8'))) {
        await db.$executeRawUnsafe(s)
      }
    }

    // Furniture > Seating > Task chairs, questions on the outer two only, so a
    // gap in the middle of the chain has to survive the walk as well.
    await db.$executeRawUnsafe(`
      INSERT INTO "shp_categories" ("id", "name", "slug", "parent_id", "position", "faqs")
      VALUES
        ('cat-furniture', 'Furniture', 'furniture', NULL, 0,
          '{"items":[{"question":"Do you deliver?","answer":"Everywhere on the mainland."}],"inherit":true}'),
        ('cat-seating', 'Seating', 'seating', 'cat-furniture', 0, NULL),
        ('cat-task', 'Task chairs', 'task-chairs', 'cat-seating', 0,
          '{"items":[{"question":"Is it assembled?","answer":"Arms and castors go on at your end."}],"inherit":true}'),
        ('cat-desks', 'Desks', 'desks', 'cat-furniture', 1,
          '{"items":[{"question":"Cable tray?","answer":"Optional."}],"inherit":false}')`)

    await db.$executeRawUnsafe(`
      INSERT INTO "shp_products" ("id", "name", "slug", "type", "status", "price", "master_category_id")
      VALUES
        ('prod-chair', 'Operator chair', 'operator-chair', 'PHYSICAL', 'ACTIVE', 199.00, 'cat-task'),
        ('prod-desk', 'Bench desk', 'bench-desk', 'PHYSICAL', 'ACTIVE', 399.00, 'cat-desks'),
        ('prod-filed', 'Filed only', 'filed-only', 'PHYSICAL', 'ACTIVE', 49.00, NULL),
        ('prod-loose', 'Filed nowhere', 'filed-nowhere', 'PHYSICAL', 'ACTIVE', 9.00, NULL)`)

    // No master category, but filed under two - the fallback picks the
    // lowest-positioned one, which is Furniture (position 0), not Desks.
    await db.$executeRawUnsafe(`
      INSERT INTO "shp_product_categories" ("product_id", "category_id")
      VALUES ('prod-filed', 'cat-desks'), ('prod-filed', 'cat-furniture')`)
  }, 300_000)

  afterAll(async () => {
    await db?.$disconnect()
    if (dbName) await dropTestDatabase(cfg!, dbName)
    if (roleName) await dropTestRole(cfg!, roleName)
  }, 120_000)

  it('walks from the master category outwards, nearest first', async () => {
    const chain = await getProductFaqCategoryChain('prod-chair', { client: db })
    // Task chairs, Seating, Furniture - three rungs, in that order, with the
    // empty middle one still present so the walk is provably not skipping it.
    expect(chain).toHaveLength(3)
    expect(chain[0]!.items[0]!.question).toBe('Is it assembled?')
    expect(chain[1]!.items).toEqual([])
    expect(chain[2]!.items[0]!.question).toBe('Do you deliver?')
  })

  it('carries a category own inherit flag back off the column', async () => {
    const chain = await getProductFaqCategoryChain('prod-desk', { client: db })
    expect(chain[0]!.inherit).toBe(false)
    // The walk itself does not stop - stopping is resolveProductFaqs' job, and
    // it needs the parent in hand to decide. The query hands back the lot.
    expect(chain).toHaveLength(2)
  })

  it('falls back to the lowest-positioned filed category when there is no master', async () => {
    const chain = await getProductFaqCategoryChain('prod-filed', { client: db })
    expect(chain).toHaveLength(1)
    expect(chain[0]!.items[0]!.question).toBe('Do you deliver?')
  })

  it('asks nothing of a product filed nowhere at all', async () => {
    expect(await getProductFaqCategoryChain('prod-loose', { client: db })).toEqual([])
    expect(await getProductFaqCategoryChain('no-such-product', { client: db })).toEqual([])
  })

  // The category page's own walk, rooted at a slug rather than at a product.
  it('walks a category up to the root from its slug, nearest first', async () => {
    const chain = await getCategoryFaqChainBySlug('task-chairs', { client: db })
    expect(chain).toHaveLength(3)
    expect(chain[0]!.items[0]!.question).toBe('Is it assembled?')
    expect(chain[1]!.items).toEqual([])
    expect(chain[2]!.items[0]!.question).toBe('Do you deliver?')
  })

  it('reads a collection own set, and an empty one for a slug that matches nothing', async () => {
    await db.$executeRawUnsafe(`
      INSERT INTO "shp_collections" ("id", "name", "slug", "faqs")
      VALUES
        ('col-impulse', 'Impulse', 'impulse',
          '{"items":[{"question":"Is Impulse a range?","answer":"Desks, storage and screens that match."}],"inherit":false}'),
        ('col-plain', 'Clearance', 'clearance', NULL)`)

    const impulse = await getCollectionFaqSetBySlug('impulse', { client: db })
    expect(impulse.items[0]!.question).toBe('Is Impulse a range?')
    // The flag has to survive the column, or a collection that said "just mine"
    // would quietly start printing the shop's questions under its own.
    expect(impulse.inherit).toBe(false)

    // A collection with nothing written, and a slug that is nobody's, both read
    // as the empty inheriting set - which is what prints the shop-wide list.
    expect(await getCollectionFaqSetBySlug('clearance', { client: db })).toEqual({ items: [], inherit: true })
    expect(await getCollectionFaqSetBySlug('no-such-collection', { client: db })).toEqual({ items: [], inherit: true })
  })

  it('hands a top-level category back on its own, and an unknown slug nothing', async () => {
    const chain = await getCategoryFaqChainBySlug('furniture', { client: db })
    expect(chain).toHaveLength(1)
    expect(chain[0]!.items[0]!.question).toBe('Do you deliver?')
    expect(await getCategoryFaqChainBySlug('no-such-category', { client: db })).toEqual([])
  })
})
