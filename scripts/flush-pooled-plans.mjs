#!/usr/bin/env node
/**
 * Drops stale server-side query plans after a schema change.
 *
 * Why this exists: Postgres caches the plan for a prepared statement against the
 * table shape it saw at prepare time. `SELECT *` is the common case — its result
 * type is every column of the table. Change the table (drop a column, add three)
 * and every connection still holding that cached plan fails the next time it runs
 * the statement:
 *
 *     ERROR: cached plan must not change result type   (SQLSTATE 0A000)
 *
 * Normally this is invisible, because a deploy replaces the application and its
 * connections along with it. It is not invisible through a pooler. Neon's pooled
 * endpoint is pgBouncer, and pgBouncer keeps its *server* connections open across
 * deploys — so plans prepared before the migration outlive the deployment that
 * prepared them. Meanwhile our DDL deliberately runs on the direct endpoint (see
 * build-migrate.mjs), which never touches those pooled connections at all.
 *
 * The result is a site that half works: requests routed onto a fresh pooled
 * connection are fine, requests routed onto an old one throw, and which is which
 * changes request to request. It clears up on its own once pgBouncer recycles the
 * connections, which can be an hour or more of a broken storefront.
 *
 * Symptom seen in the wild (v0.5.578, 2026-07-19): shop 005_price_types dropped
 * `compare_at_price` and added the sale/retail/trade columns, and every product
 * page 500'd afterwards because `SELECT * FROM "shp_products"` was still planned
 * against the old column list.
 *
 * The fix is simply to end those connections; pgBouncer reopens them on demand
 * and the next prepare sees the current schema. Only *idle* backends are ended,
 * so nothing in flight on the still-serving old deployment is interrupted — an
 * idle pooled backend is exactly where a stale plan sits waiting. Two passes a
 * few seconds apart catch the ones that were mid-query on the first pass.
 *
 * Runs last in build-migrate.mjs, after every DDL step. Skipped when there is no
 * DATABASE_URL (initial deploy before the setup wizard) and when the database is
 * not reached through a pooler, where the problem cannot arise.
 */

import pg from 'pg'

const { Client } = pg

if (!process.env.DATABASE_URL) {
  console.log('[flush-plans] DATABASE_URL not set — skipping (initial deployment before setup)')
  process.exit(0)
}

// Only pooled setups can strand a plan. A direct-only install replaces all its
// connections with the deployment, so there is nothing here to clear.
const pooled = process.env.DATABASE_URL.includes('-pooler.')
if (!pooled) {
  console.log('[flush-plans] Not a pooled connection — nothing to clear')
  process.exit(0)
}

// Terminating a backend has to be done from another connection, and it has to be
// the direct endpoint: asking pgBouncer to end pgBouncer's own connections just
// routes the request back through the pool. Mirrors build-migrate/reconcile.
let dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL.replace('-pooler.', '.')

// Same SSL handling as the other runners: promote Neon's `sslmode=require` to
// `verify-full` so node-postgres validates the certificate.
const parsedUrl = new URL(dbUrl)
if (parsedUrl.searchParams.get('sslmode') === 'require') {
  parsedUrl.searchParams.set('sslmode', 'verify-full')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// One sweep: end every idle backend on this database except our own. Returns how
// many were ended. `pg_terminate_backend` needs no superuser for connections
// belonging to the same role, which is what every application connection is.
async function sweep(client) {
  const { rows } = await client.query(`
    SELECT pg_terminate_backend(pid) AS ended
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND state = 'idle'
  `)
  return rows.filter((r) => r.ended).length
}

const client = new Client({ connectionString: parsedUrl.toString() })

try {
  await client.connect()
  const first = await sweep(client)
  // A backend that was mid-query a moment ago still holds its stale plan once it
  // goes idle, so give the short ones time to finish and sweep again.
  await sleep(3000)
  const second = await sweep(client)
  console.log(`[flush-plans] Cleared ${first + second} idle pooled connection(s) so plans are rebuilt against the new schema`)
} catch (err) {
  // Never fail a deploy over this. The worst case without it is the old
  // behaviour: stale plans that clear themselves when pgBouncer recycles.
  console.warn(`[flush-plans] Could not clear pooled connections (continuing): ${err.message}`)
} finally {
  await client.end().catch(() => {})
}
