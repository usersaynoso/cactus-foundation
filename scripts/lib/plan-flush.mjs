// Deployment bookkeeping in the existing migration ledger, never a new table.
// A pending marker is durable BEFORE migrations start. A killed build therefore
// forces the next sweep even if it applied SQL before writing a migration record.
import { createHash, randomUUID } from 'node:crypto'

const MODULE = '__core__'
const NAME = '__query_plan_flush_v1__'

export async function migrationFingerprint(client) {
  const { rows } = await client.query(`
    SELECT 'module' AS kind, "moduleName" AS owner, "migrationName" AS name,
           "checksum", "appliedAt"::text AS applied, NULL::text AS rolled_back
      FROM "ModuleMigration"
     WHERE NOT ("moduleName" = $1 AND "migrationName" = $2)
    UNION ALL
    SELECT 'prisma', '', migration_name, checksum, finished_at::text, rolled_back_at::text
      FROM "_prisma_migrations"
    ORDER BY kind, owner, name, checksum, applied, rolled_back
  `, [MODULE, NAME])
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex')
}

async function writeMarker(client, checksum) {
  await client.query(`
    INSERT INTO "ModuleMigration" ("id", "moduleName", "migrationName", "checksum", "appliedAt")
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT ("moduleName", "migrationName")
    DO UPDATE SET "checksum" = EXCLUDED."checksum", "appliedAt" = NOW()
  `, [randomUUID(), MODULE, NAME, checksum])
}

/** The caller holds this connection until migrations and the sweep finish. */
export async function beginPlanFlush(client) {
  // Serialise cooperating deployment runners on THIS database, so one build
  // cannot acknowledge another build's pending schema change. No session state
  // is entrusted to the pooler: build-migrate connects to the direct endpoint.
  await client.query('SELECT pg_advisory_lock(1128350548, 1347174734)')
  const { rows } = await client.query(`
    SELECT to_regclass('"ModuleMigration"') IS NOT NULL
       AND to_regclass('"_prisma_migrations"') IS NOT NULL AS ready
  `)
  if (!rows[0]?.ready) return { before: null, previous: null }
  const before = await migrationFingerprint(client)
  const marker = await client.query(
    'SELECT "checksum" FROM "ModuleMigration" WHERE "moduleName" = $1 AND "migrationName" = $2',
    [MODULE, NAME],
  )
  const previous = marker.rows[0]?.checksum ?? null
  await writeMarker(client, `pending:${randomUUID()}`)
  return { before, previous }
}

/** The actual sweep uses the tracking connection so it cannot terminate itself. */
export async function sweepPlans(client, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  const sweep = async () => {
    const { rows } = await client.query(`
      SELECT pg_terminate_backend(pid) AS ended
        FROM pg_stat_activity
       WHERE datname = current_database()
         AND pid <> pg_backend_pid()
         AND state = 'idle'
    `)
    return rows.filter((row) => row.ended).length
  }
  const first = await sweep()
  await sleep(3000)
  return first + await sweep()
}

export async function finishPlanFlush(client, state, { sweep = sweepPlans, log = console.log } = {}) {
  const after = await migrationFingerprint(client)
  // A missing, pending, or stale marker always forces cleanup, including first
  // deploys and recovery from an interrupted or failed prior sweep.
  const unchanged = state.before === after && state.previous === `complete:${after}`
  if (unchanged) {
    log('Migration records unchanged since the last completed sweep - skipping query-plan cleanup.')
  } else {
    const count = await sweep(client)
    log(`Cleared ${count} idle connection(s) after migrations.`)
  }
  await writeMarker(client, `complete:${after}`)
  return { skipped: unchanged }
}
