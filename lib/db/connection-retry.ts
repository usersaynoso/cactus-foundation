// A pooled connection the database ended while it sat idle fails the next query
// handed to it, even though nothing is wrong with the database or the query.
//
// The deploy's own build step does exactly this, on purpose. After migrations,
// scripts/lib/plan-flush.mjs ends every idle backend (twice, three seconds apart)
// so no connection keeps a query plan from before the schema change. Through a
// pooler such as pgBouncer that is invisible: the pooler opens a fresh server
// connection on demand. On a site whose running release talks to Postgres
// directly - the `server` hosting provider, where the new release is built while
// the old one is still serving from the same database - each of those idle
// connections belonged to the live site's own Prisma pool. Every request that
// drew one of them failed: a burst of 500s on whatever happened to be loading
// (pages, the app manifest, admin screens), logged as
//
//     prisma:error Error in PostgreSQL connection: ... E57P01
//     "terminating connection due to administrator command"
//
// at the two moments of the sweep. A Postgres restart reads the same way.
//
// The query never reached the database (its connection was already gone), so
// replaying it on another connection is the whole fix. That is only done for
// READS, though. The error alone cannot prove a write was not applied - a
// connection can die between the commit and the reply - and replaying a write
// that did land could take a payment or send an email twice. A failed write
// stays failed and says so; a page render, which is almost all reads, recovers.

const CLOSED_CONNECTION_MESSAGES = [
  // What Prisma says when it hands a query to a connection the server has
  // already closed (P1017).
  'Server has closed the connection',
  // Postgres's own words for pg_terminate_backend() and for a fast shutdown.
  'terminating connection due to administrator command',
]

/** True when a query failed because its connection had been ended, not because
 *  anything was wrong with the query. */
export function isClosedConnectionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const e = error as { code?: unknown; message?: unknown; meta?: { code?: unknown; message?: unknown } }
  if (e.code === 'P1017' || e.meta?.code === 'E57P01') return true
  return [e.message, e.meta?.message].some(
    (value) => typeof value === 'string' && CLOSED_CONNECTION_MESSAGES.some((m) => value.includes(m)),
  )
}

const READ_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
])

// Comments first, so a leading `-- why` or `/* why */` does not hide the verb.
function leadingSql(sql: string): string {
  return sql.replace(/^(\s+|--[^\n]*(\n|$)|\/\*[\s\S]*?\*\/)+/, '')
}

/** True for SQL that only reads. A CTE counts only when nothing in it writes,
 *  since `WITH x AS (DELETE ...)` is a write wearing a SELECT. */
export function isReadOnlySql(sql: string): boolean {
  const head = leadingSql(sql)
  if (/^select\b/i.test(head)) return true
  if (/^with\b/i.test(head)) return !/\b(insert|update|delete|merge)\b/i.test(head)
  return false
}

// $queryRaw arrives as a Prisma.Sql object, $queryRawUnsafe as [text, ...values].
function rawSqlText(args: unknown): string | null {
  if (Array.isArray(args)) return typeof args[0] === 'string' ? args[0] : null
  if (typeof args === 'object' && args !== null) {
    const sql = (args as { sql?: unknown }).sql
    if (typeof sql === 'string') return sql
  }
  return null
}

/** True when replaying this operation cannot change anything the first attempt
 *  might already have changed. Unknown shapes are treated as writes. */
export function isReplayableRead(operation: string, args: unknown): boolean {
  if (READ_OPERATIONS.has(operation)) return true
  if (operation === '$queryRaw' || operation === '$queryRawUnsafe') {
    const sql = rawSqlText(args)
    return sql !== null && isReadOnlySql(sql)
  }
  return false
}

/** Replays allowed on top of the first attempt. The pool can hold several
 *  connections that were all ended together, and each failed draw throws one of
 *  them away, so a single replay can simply land on the next dead one. A failure
 *  on a dead connection is immediate (nothing goes over the network), so the
 *  extra attempts cost nothing, and a database that is really down fails a fresh
 *  connection with a different error that is not retried. */
export const CLOSED_CONNECTION_REPLAYS = 5

export async function retryOnClosedConnection<T>(
  operation: string,
  args: unknown,
  run: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run()
    } catch (error) {
      if (attempt >= CLOSED_CONNECTION_REPLAYS || !isClosedConnectionError(error) || !isReplayableRead(operation, args)) {
        throw error
      }
    }
  }
}
