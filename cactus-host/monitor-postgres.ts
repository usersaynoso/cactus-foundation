// Postgres, as the cluster's superuser: one psql call every 30 seconds that comes
// back as a single JSON document - every database's statistics, every client
// session, and the cluster's limits - and, every five minutes, the slowest and
// busiest statements from pg_stat_statements when it is loaded.
//
// pg_stat_statements needs `shared_preload_libraries` and one restart (RUNBOOK
// section 14). Until then the rest works and the statements list says why it is
// empty.

import type { DatabaseSync } from 'node:sqlite'
import type { HostConfig } from './config.ts'
import type { PgActivity, PgStatement, PostgresLive } from './monitor-protocol.ts'
import type { System } from './system.ts'

const STATS_SQL = `SELECT json_build_object(
  'dbs', (SELECT COALESCE(json_agg(json_build_object(
      'name', d.datname, 'size', pg_database_size(d.datname), 'backends', s.numbackends,
      'commit', s.xact_commit, 'rollback', s.xact_rollback, 'read', s.blks_read, 'hit', s.blks_hit,
      'returned', s.tup_returned, 'fetched', s.tup_fetched, 'inserted', s.tup_inserted,
      'updated', s.tup_updated, 'deleted', s.tup_deleted, 'deadlocks', s.deadlocks, 'temp', s.temp_bytes)), '[]'::json)
    FROM pg_database d JOIN pg_stat_database s ON s.datid = d.oid
    WHERE NOT d.datistemplate AND d.datname <> 'postgres'),
  'activity', (SELECT COALESCE(json_agg(json_build_object(
      'pid', pid, 'db', datname, 'user', usename, 'state', state, 'wait', wait_event_type,
      'since', extract(epoch FROM COALESCE(query_start, xact_start, backend_start)), 'query', left(query, 1000))), '[]'::json)
    FROM pg_stat_activity WHERE backend_type = 'client backend' AND pid <> pg_backend_pid()),
  'max', current_setting('max_connections')::int,
  'wal', (SELECT wal_bytes FROM pg_stat_wal),
  'statements', EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements')
)`

const STATEMENTS_SQL = `SELECT COALESCE(json_agg(x), '[]'::json) FROM (
  SELECT d.datname AS db, s.queryid::text AS id, left(s.query, 2000) AS query, sum(s.calls) AS calls,
    sum(s.total_exec_time) AS total, sum(s.rows) AS rows
  FROM pg_stat_statements s JOIN pg_database d ON d.oid = s.dbid
  WHERE d.datname <> 'postgres'
  GROUP BY d.datname, s.queryid, s.query
  ORDER BY sum(s.total_exec_time) DESC LIMIT 300) x`

type RawDb = { name: string; size: number; backends: number; commit: number; rollback: number; read: number; hit: number; returned: number; fetched: number; inserted: number; updated: number; deleted: number; deadlocks: number; temp: number }
type RawStats = { dbs: RawDb[]; activity: { pid: number; db: string | null; user: string | null; state: string | null; wait: string | null; since: number | null; query: string }[]; max: number; wal: number | null; statements: boolean }

export type PostgresSample = { live: PostgresLive; activity: PgActivity[]; values: Map<string, number> }

export class PostgresCollector {
  private readonly config: HostConfig
  private readonly system: System
  private previous: { at: number; stats: RawStats } | null = null

  constructor(config: HostConfig, system: System) {
    this.config = config
    this.system = system
  }

  private async psql<T>(sql: string): Promise<T> {
    // Collected line by line: the run result keeps only the last 64 KB, and the
    // statements document is larger than that.
    const lines: string[] = []
    const result = await this.system.run('runuser', ['-u', this.config.postgres.osUser, '--', 'psql', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', 'postgres', '-c', sql], {
      timeoutMs: 20_000,
      onLine: (line) => lines.push(line),
    })
    if (result.code !== 0) throw new Error(result.output.trim().split('\n').slice(-2).join(' ') || `psql exited ${result.code}`)
    return JSON.parse(lines.join('\n').trim()) as T
  }

  async sample(now: number): Promise<PostgresSample> {
    const stats = await this.psql<RawStats>(STATS_SQL)
    const prev = this.previous
    this.previous = { at: now, stats }
    const secs = prev ? Math.max(1, (now - prev.at) / 1000) : 0
    const rate = (a: number | undefined, b: number) => (prev && a !== undefined && b >= a ? (b - a) / secs : 0)
    const values = new Map<string, number>()
    const databases = stats.dbs.map((d) => {
      const p = prev?.stats.dbs.find((x) => x.name === d.name)
      const reads = (p ? d.read - p.read : 0)
      const hits = (p ? d.hit - p.hit : 0)
      const row = {
        name: d.name,
        sizeBytes: d.size,
        backends: d.backends,
        tps: rate(p ? p.commit + p.rollback : undefined, d.commit + d.rollback),
        cacheHitPct: reads + hits > 0 ? (hits / (reads + hits)) * 100 : null,
        rowsReadPs: rate(p ? p.returned : undefined, d.returned),
        rowsWrittenPs: rate(p ? p.inserted + p.updated + p.deleted : undefined, d.inserted + d.updated + d.deleted),
        deadlocks: p ? Math.max(0, d.deadlocks - p.deadlocks) : 0,
        tempBps: rate(p?.temp, d.temp),
      }
      values.set(`db.size_bytes@${d.name}`, row.sizeBytes)
      values.set(`db.backends@${d.name}`, row.backends)
      values.set(`db.tps@${d.name}`, row.tps)
      if (row.cacheHitPct !== null) values.set(`db.cache_hit_pct@${d.name}`, row.cacheHitPct)
      values.set(`db.rows_read_ps@${d.name}`, row.rowsReadPs)
      values.set(`db.rows_written_ps@${d.name}`, row.rowsWrittenPs)
      values.set(`db.deadlocks@${d.name}`, row.deadlocks)
      values.set(`db.temp_bps@${d.name}`, row.tempBps)
      return row
    })
    const nowS = now / 1000
    const activity: PgActivity[] = stats.activity.map((a) => ({
      pid: a.pid, database: a.db, user: a.user, state: a.state, wait: a.wait,
      seconds: a.since ? Math.max(0, Math.round(nowS - a.since)) : null,
      query: a.query,
    }))
    const active = activity.filter((a) => a.state === 'active')
    const live: PostgresLive = {
      connections: activity.length,
      maxConnections: stats.max,
      active: active.length,
      idleInTransaction: activity.filter((a) => a.state?.startsWith('idle in transaction')).length,
      waiting: activity.filter((a) => a.wait === 'Lock').length,
      longestQuerySeconds: Math.max(0, ...active.map((a) => a.seconds ?? 0)),
      walBps: stats.wal !== null && prev?.stats.wal != null ? rate(prev.stats.wal, stats.wal) : null,
      statementsAvailable: stats.statements,
      databases,
    }
    values.set('pg.connections', live.connections)
    values.set('pg.conn_pct', stats.max ? (live.connections / stats.max) * 100 : 0)
    values.set('pg.active', live.active)
    values.set('pg.idle_in_tx', live.idleInTransaction)
    values.set('pg.waiting', live.waiting)
    values.set('pg.longest_query_s', live.longestQuerySeconds)
    if (live.walBps !== null) values.set('pg.wal_bps', live.walBps)
    return { live, activity, values }
  }

  /** Snapshots pg_stat_statements into the history, for "what got slow, and when". */
  async snapshotStatements(db: DatabaseSync, now: number): Promise<void> {
    const rows = await this.psql<{ db: string; id: string; query: string; calls: number; total: number; rows: number }[]>(STATEMENTS_SQL)
    const t = Math.floor(now / 1000)
    const put = db.prepare('INSERT OR REPLACE INTO pg_statements (t, db, queryid, query, calls, total_ms, rows) VALUES (?, ?, ?, ?, ?, ?, ?)')
    db.exec('BEGIN')
    try {
      for (const r of rows) put.run(t, r.db, r.id ?? '', r.query, Number(r.calls), Number(r.total), Number(r.rows))
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }

  /** Cancels one running query (not the session). */
  async cancel(pid: number): Promise<boolean> {
    if (!Number.isInteger(pid) || pid <= 0) throw new Error('Not a process id')
    return this.psql<boolean>(`SELECT to_json(pg_cancel_backend(${pid}))`)
  }
}

/**
 * The statements that cost the most between two instants: the difference between
 * the snapshot nearest each end. Statement counters only go up (until a stats reset,
 * which makes the difference negative - then the later figure stands on its own).
 */
export function statementsBetween(db: DatabaseSync, from: number, to: number, database: string | null): PgStatement[] {
  const fromS = Math.floor(from / 1000)
  const toS = Math.ceil(to / 1000)
  const last = db.prepare('SELECT MAX(t) AS t FROM pg_statements WHERE t <= ?').get(toS) as { t: number | null }
  if (last.t === null) return []
  const first = db.prepare('SELECT MIN(t) AS t FROM pg_statements WHERE t >= ? AND t < ?').get(fromS, last.t) as { t: number | null }
  const filter = database ? 'AND db = ?' : ''
  const args = (t: number) => (database ? [t, database] : [t])
  const end = db.prepare(`SELECT db, queryid, query, calls, total_ms, rows FROM pg_statements WHERE t = ? ${filter}`).all(...args(last.t)) as { db: string; queryid: string; query: string; calls: number; total_ms: number; rows: number }[]
  const startRows = first.t !== null ? (db.prepare(`SELECT db, queryid, calls, total_ms, rows FROM pg_statements WHERE t = ? ${filter}`).all(...args(first.t)) as { db: string; queryid: string; calls: number; total_ms: number; rows: number }[]) : []
  const start = new Map(startRows.map((r) => [`${r.db}|${r.queryid}`, r]))
  return end
    .map((r) => {
      const s = start.get(`${r.db}|${r.queryid}`)
      const reset = s && r.calls < s.calls
      const calls = s && !reset ? r.calls - s.calls : r.calls
      const totalMs = s && !reset ? r.total_ms - s.total_ms : r.total_ms
      const rows = s && !reset ? r.rows - s.rows : r.rows
      return { database: r.db, queryId: r.queryid, query: r.query, calls, totalMs: Math.round(totalMs), meanMs: calls ? Math.round((totalMs / calls) * 100) / 100 : 0, rows }
    })
    .filter((s) => s.calls > 0)
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 100)
}
