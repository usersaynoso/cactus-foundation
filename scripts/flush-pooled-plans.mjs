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
 * Standalone unconditional cleanup. build-migrate.mjs uses the same sweep helper
 * with durable migration tracking to skip unchanged deployments. This CLI uses the site's
 * real (pooled) DATABASE_URL rather than the direct one the migration steps run
 * with. Skipped only when there is no DATABASE_URL at all (initial deploy before
 * the setup wizard).
 *
 * It is a best-effort first line, not the guarantee. A build-time sweep cannot
 * cover a connection opened after the build, so the actual guarantee is the
 * retry in `lib/db/stale-plan.ts`, which replays any query that hits a stale plan
 * at runtime. This script exists to keep that retry rare rather than routine.
 */

import pg from 'pg'
import { sweepPlans } from './lib/plan-flush.mjs'

const { Client } = pg

if (!process.env.DATABASE_URL) {
  console.log('[flush-plans] DATABASE_URL not set — skipping (initial deployment before setup)')
  process.exit(0)
}

// No pooled/direct test any more, deliberately. There was one, and it was the
// reason this script has never actually protected anything: build-migrate.mjs
// hands its children a DATABASE_URL already rewritten to the direct endpoint, so
// the "-pooler" test read a hostname with "-pooler" stripped out of it, decided
// the install was direct-only, and exited having cleared nothing. Every pooled
// install - the ones that need this - was the exact set it skipped.
//
// Sweeping unconditionally removes the failure mode rather than fixing that one
// test, because a wrong answer here is silent and only shows up as a broken site
// after the next migration. On a genuinely direct install the sweep costs one
// query and ends idle connections that the deploy was about to replace anyway.
const pooled = process.env.DATABASE_URL.includes('-pooler.')
console.log(
  pooled
    ? '[flush-plans] Pooled connection — clearing idle backends so plans are rebuilt'
    : '[flush-plans] No pooler detected — sweeping anyway (the check is not worth trusting; see comment)',
)

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

const client = new Client({ connectionString: parsedUrl.toString() })

try {
  await client.connect()
  const count = await sweepPlans(client)
  console.log(`[flush-plans] Cleared ${count} idle pooled connection(s) so plans are rebuilt against the new schema`)
} catch (err) {
  // Never fail a deploy over this. The worst case without it is the old
  // behaviour: stale plans that clear themselves when pgBouncer recycles.
  console.warn(`[flush-plans] Could not clear pooled connections (continuing): ${err.message}`)
} finally {
  await client.end().catch(() => {})
}
