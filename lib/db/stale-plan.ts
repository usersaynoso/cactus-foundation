// Postgres caches the plan for a prepared statement against the connection that
// prepared it. Add a column to a table and every live backend still holding a
// plan for `SELECT * FROM that_table` is now wrong: the plan promises one row
// shape, the table hands back another. Postgres refuses rather than guess, with
// SQLSTATE 0A000 and the message below.
//
// This is not a hypothetical. A shop module migration added `shp_products.supplier`
// on 2026-07-19 and every product read on the live site 500'd afterwards - product
// pages, the admin product editor, CSV export. The schema was perfectly correct;
// the pooled connections were simply stale. It took a compute restart to clear.
//
// Two things make it certain to recur without a guard:
//
//   1. Migrations run in the Vercel build step, against a database whose pooled
//      connections outlive the deploy. There is no point at which the app gets a
//      clean set of backends, so the window is not "briefly during deploy" - the
//      broken connections stay broken until something recycles them.
//   2. It is not only `SELECT *`. Changing a column's type invalidates plans for
//      queries naming that column explicitly too, so "just list the columns"
//      narrows the blast radius without closing the hole.
//
// The failure is self-clearing on the very next attempt: the failed execution
// discards the stale plan, so a replay re-plans against the real schema and
// succeeds. That makes a retry the whole fix, and it is why this lives at the
// client rather than in any one query.
const STALE_PLAN_MESSAGE = 'cached plan must not change result type'

// Deliberately message-based rather than SQLSTATE-based. 0A000 is Postgres's
// generic "feature not supported" and covers plenty of genuine programming
// errors that must not be retried; the message is what identifies this one.
// The error arrives wrapped by Prisma (P2010 with meta.message on raw queries,
// plain message elsewhere), so both are checked.
export function isStalePlanError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false

  const candidates: unknown[] = [
    (error as { message?: unknown }).message,
    (error as { meta?: { message?: unknown } }).meta?.message,
  ]

  return candidates.some(
    (value) => typeof value === 'string' && value.includes(STALE_PLAN_MESSAGE),
  )
}

// Runs `operation`, and replays it once if it failed only because the connection
// was holding a plan from before the last migration.
//
// One replay, not a loop: the first failure is what evicts the stale plan, so a
// second failure means something else is wrong and looping would only turn a
// visible error into a slow one. If the replay fails, its error is thrown - the
// caller sees the real reason, not a stale-plan red herring.
//
// Inside an interactive transaction the replay cannot save anything: the first
// failure has already aborted the transaction, so the replay reports that
// instead. That is no worse than the unguarded behaviour - the transaction was
// lost the moment the stale plan was hit - and single statements, which is
// almost everything a page render does, recover cleanly.
export async function retryOnStalePlan<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (!isStalePlanError(error)) throw error
    return await operation()
  }
}
