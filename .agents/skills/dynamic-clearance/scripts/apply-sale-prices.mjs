#!/usr/bin/env node
// Apply a plan produced by plan-sale-prices.mjs to the live Deskwell database.
//
// This is the only script here that writes, and the database on the end of
// DIRECT_URL belongs to a shop taking real orders, so:
//   - nothing happens without --apply; the default is a rehearsal
//   - every row is re-read inside the transaction and compared with what the
//     plan saw. A price that has moved since the plan was made means the plan
//     is stale, and the whole run is rolled back rather than half-applied
//   - it is one transaction, so a UNIQUE clash on a restored SKU leaves no
//     partial state
//
// What it writes: sale_price, and sale_sku (the code the supplier wants on the
// order while the offer runs). The product's own sku is left alone, except on a
// row an older version of this script swapped over, which is put back.
//   - rollback.sql beside the plan puts every touched row back
//
// Usage:
//   node apply-sale-prices.mjs --plan clearance_sale_2026_08_10/plan.json [--apply] [--force]

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import pg from 'pg'

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}
const flag = (name) => process.argv.includes(`--${name}`)

const planPath = arg('plan', 'clearance_sale_plan/plan.json')
const doApply = flag('apply')
const force = flag('force')

function directUrl() {
  if (process.env.DIRECT_URL) return process.env.DIRECT_URL
  const env = readFileSync('.env', 'utf8')
  const line = env.split('\n').find((l) => l.startsWith('DIRECT_URL='))
  if (!line) throw new Error('No DIRECT_URL in the environment or in .env - run this from the repo root.')
  return line.slice('DIRECT_URL='.length).trim().replace(/^["']|["']$/g, '')
}

const { planned } = JSON.parse(readFileSync(planPath, 'utf8'))
if (planned.length === 0) {
  console.log('Plan is empty - nothing to do.')
  process.exit(0)
}

const client = new pg.Client({ connectionString: directUrl() })
await client.connect()

const applied = []
const stale = []
try {
  await client.query('BEGIN')

  for (const row of planned) {
    // FOR UPDATE so nothing else can move the price between the check and the
    // write. A shop this size will never contend, but a price is a price.
    const { rows: current } = await client.query(
      'select sku, sale_sku, price::text as price, sale_price::text as sale_price from shp_products where id = $1 for update',
      [row.id],
    )
    if (current.length === 0) {
      stale.push({ ...row, why: 'product no longer exists' })
      continue
    }
    const live = current[0]
    if (Number(live.price) !== Number(row.price)) {
      stale.push({ ...row, why: `shop price is now ${live.price}, plan was built against ${row.price}` })
      continue
    }
    const liveSale = live.sale_price == null ? null : Number(live.sale_price)
    if (liveSale !== row.currentSale) {
      stale.push({ ...row, why: `sale price is now ${liveSale ?? 'none'}, plan expected ${row.currentSale ?? 'none'}` })
      continue
    }
    if (row.newSaleSku && (live.sale_sku ?? null) !== (row.currentSaleSku ?? null)) {
      stale.push({ ...row, why: `sale SKU is now ${live.sale_sku ?? 'none'}, plan expected ${row.currentSaleSku ?? 'none'}` })
      continue
    }
    // Only rows being put right after the old SKU-swapping script care what the
    // SKU says; every other row leaves it alone, so it cannot go stale.
    if (row.restoreSku && live.sku !== row.sku) {
      stale.push({ ...row, why: `SKU is now ${live.sku}, plan expected ${row.sku}` })
      continue
    }

    const sets = ['sale_price = $1']
    const values = [row.newSale]
    if (row.newSaleSku) { values.push(row.newSaleSku); sets.push(`sale_sku = $${values.length}`) }
    if (row.restoreSku) { values.push(row.restoreSku); sets.push(`sku = $${values.length}`) }
    values.push(row.id)
    await client.query(`update shp_products set ${sets.join(', ')}, updated_at = now() where id = $${values.length}`, values)
    applied.push(row)
  }

  if (stale.length > 0 && !force) {
    await client.query('ROLLBACK')
    console.error(
      `${stale.length} of ${planned.length} rows have moved since the plan was made. Nothing was written.\n` +
        stale.map((s) => `  ${s.sku ?? s.id} - ${s.why}`).join('\n') +
        `\n\nRe-run fetch-clearance.mjs and plan-sale-prices.mjs, or pass --force to apply the ${applied.length} rows that still match.`,
    )
    process.exit(1)
  }

  if (!doApply) {
    await client.query('ROLLBACK')
    console.log(
      `Rehearsal only - rolled back. ${applied.length} rows would change` +
        (stale.length ? `, ${stale.length} are stale and were skipped` : '') +
        `.\nRe-run with --apply to write them.`,
    )
    process.exit(0)
  }

  await client.query('COMMIT')
} catch (err) {
  await client.query('ROLLBACK').catch(() => {})
  throw err
} finally {
  await client.end()
}

const receipt = join(dirname(planPath), 'applied.json')
writeFileSync(receipt, `${JSON.stringify({ appliedAt: new Date().toISOString(), applied, stale }, null, 2)}\n`)

console.log(
  `Applied to the LIVE Deskwell database (${planned.length} planned):\n` +
    `  ${applied.length} rows updated\n` +
    (stale.length ? `  ${stale.length} skipped as stale (--force was set)\n` : '') +
    `  receipt: ${receipt}\n` +
    `  undo:    psql "$DIRECT_URL" -f ${join(dirname(planPath), 'rollback.sql')}`,
)
