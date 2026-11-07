// Notices that the data behind public pages has changed, whoever changed it.
//
// A price reaches the database by a dozen routes: the product editor, a bulk action,
// a stock import, a supplier checker, an order taking stock down, a script on
// somebody's laptop, a raw UPDATE in a module. Wiring an "invalidate" call into each
// would miss the next one to be written, and could never see anything outside this
// process. Postgres already counts every row written to every table, so the store
// asks it. One cheap query every few seconds, no triggers, no code in any module.
//
// The counters are cumulative and only ever compared for change. They run a few
// seconds behind (a backend reports its counts when it goes idle, 1s at the soonest
// and about 10s at the latest), which is part of the promise the engine states.
// TRUNCATE is not counted; that is not how anything here changes a catalogue, and
// the freshness limit in ./store.ts is the backstop.

export type TableWrites = Map<string, bigint>

export type WatcherRow = { relname: string; writes: bigint | number | string }

export const TABLE_WRITES_SQL = `SELECT relname, (n_tup_ins + n_tup_upd + n_tup_del) AS writes FROM pg_stat_user_tables WHERE schemaname = 'public'`

export function toTableWrites(rows: readonly WatcherRow[]): TableWrites {
  return new Map(rows.map((row) => [row.relname, BigInt(row.writes)]))
}

/** The tables that changed between two readings, leaving out the ones that do not matter. */
export function changedTables(
  before: TableWrites,
  after: TableWrites,
  isIgnored: (table: string) => boolean,
): string[] {
  const changed: string[] = []
  for (const [table, writes] of after) {
    if (isIgnored(table)) continue
    // A table that appeared since the last look has been written to if it counts
    // anything at all; one that went backwards had its counters reset, which says
    // nothing either way but costs only a re-render to treat as a change.
    if ((before.get(table) ?? 0n) !== writes) changed.push(table)
  }
  return changed.sort()
}
