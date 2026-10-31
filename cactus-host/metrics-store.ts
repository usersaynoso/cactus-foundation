// The monitor's history: one SQLite file, <stateDir>/monitor/metrics.db.
//
// Written only by cactus-monitor; cactus-host's API opens it as well, to answer
// queries, which WAL mode allows while the monitor keeps writing.
//
// Three tiers of every series:
//   raw      every sample, kept `rawHours`
//   minute   min / avg / max of each minute, kept `minuteDays`
//   hour     min / avg / max of each hour, kept `hourDays`
//
// Points are not one row each. A row holds a chunk of one series - ten minutes of
// raw samples, six hours of minutes, a week of hours - packed into a blob, which
// keeps the file about a tenth the size and a query a handful of row reads. The
// chunk being filled is held in memory and written back after every sample, so a
// query from the API is never more than one sample behind.
//
// Values are float32. Plenty for a chart; a 2 TB disk is still right to 0.01%.

import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import type { SeriesInfo, SeriesQueryResult } from './monitor-protocol.ts'

export type Tier = 'raw' | 'minute' | 'hour'

/** Seconds each chunk row covers, per tier. */
const CHUNK: Record<Tier, number> = { raw: 600, minute: 6 * 3600, hour: 7 * 86_400 }
/** Seconds between points, per tier (raw is the sample interval, set per query). */
const NATIVE: Record<Exclude<Tier, 'raw'>, number> = { minute: 60, hour: 3600 }

/** raw: [offset u16, value f32]. minute/hour: [offset u32, min f32, avg f32, max f32]. */
const RAW_ENTRY = 6
const AGG_ENTRY = 16

type OpenChunk = { start: number; entries: number[] }

type Accumulator = {
  minute: number
  mMin: number
  mMax: number
  mSum: number
  mN: number
  hour: number
  hMin: number
  hMax: number
  hSum: number
  hN: number
}

export function splitKey(key: string): { name: string; label: string | null } {
  const at = key.indexOf('@')
  return at === -1 ? { name: key, label: null } : { name: key.slice(0, at), label: key.slice(at + 1) }
}

export function seriesKey(name: string, label?: string | null): string {
  return label ? `${name}@${label}` : name
}

function encode(tier: Tier, entries: number[]): Uint8Array {
  if (tier === 'raw') {
    const buf = Buffer.alloc((entries.length / 2) * RAW_ENTRY)
    for (let i = 0, o = 0; i < entries.length; i += 2, o += RAW_ENTRY) {
      buf.writeUInt16LE(entries[i] as number, o)
      buf.writeFloatLE(entries[i + 1] as number, o + 2)
    }
    return buf
  }
  const buf = Buffer.alloc((entries.length / 4) * AGG_ENTRY)
  for (let i = 0, o = 0; i < entries.length; i += 4, o += AGG_ENTRY) {
    buf.writeUInt32LE(entries[i] as number, o)
    buf.writeFloatLE(entries[i + 1] as number, o + 4)
    buf.writeFloatLE(entries[i + 2] as number, o + 8)
    buf.writeFloatLE(entries[i + 3] as number, o + 12)
  }
  return buf
}

/** Flattened entries: raw → [offset, value, ...]; aggregates → [offset, min, avg, max, ...]. */
export function decode(tier: Tier, data: Uint8Array): number[] {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  const out: number[] = []
  if (tier === 'raw') {
    for (let o = 0; o + RAW_ENTRY <= buf.length; o += RAW_ENTRY) out.push(buf.readUInt16LE(o), buf.readFloatLE(o + 2))
  } else {
    for (let o = 0; o + AGG_ENTRY <= buf.length; o += AGG_ENTRY) {
      out.push(buf.readUInt32LE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8), buf.readFloatLE(o + 12))
    }
  }
  return out
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS series (id INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS raw (series INTEGER NOT NULL, t INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (series, t)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS minute (series INTEGER NOT NULL, t INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (series, t)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS hour (series INTEGER NOT NULL, t INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (series, t)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, kind TEXT NOT NULL, severity TEXT NOT NULL, site TEXT, title TEXT NOT NULL, detail TEXT);
CREATE INDEX IF NOT EXISTS events_at ON events (at);
CREATE INDEX IF NOT EXISTS events_site ON events (site, at);
CREATE TABLE IF NOT EXISTS traffic (site TEXT NOT NULL, t INTEGER NOT NULL, dim TEXT NOT NULL, key TEXT NOT NULL, requests INTEGER NOT NULL, bytes INTEGER NOT NULL, errors INTEGER NOT NULL, dur_sum REAL NOT NULL, dur_max REAL NOT NULL, PRIMARY KEY (site, t, dim, key)) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS traffic_t ON traffic (t);
CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY, rule_id TEXT NOT NULL, label TEXT, site TEXT, title TEXT NOT NULL, severity TEXT NOT NULL, state TEXT NOT NULL, started_at INTEGER NOT NULL, acknowledged_at INTEGER, acknowledged_by TEXT, resolved_at INTEGER, snoozed_until INTEGER, value REAL, last_notified_at INTEGER, muted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS alerts_state ON alerts (state, started_at);
CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY, alert_id INTEGER, kind TEXT NOT NULL, created_at INTEGER NOT NULL, sent_at INTEGER);
CREATE INDEX IF NOT EXISTS notifications_unsent ON notifications (sent_at, id);
CREATE TABLE IF NOT EXISTS pg_statements (t INTEGER NOT NULL, db TEXT NOT NULL, queryid TEXT NOT NULL, query TEXT NOT NULL, calls REAL NOT NULL, total_ms REAL NOT NULL, rows REAL NOT NULL, PRIMARY KEY (t, db, queryid)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, at INTEGER NOT NULL);
`

export class MetricsStore {
  readonly db: DatabaseSync
  private readonly ids = new Map<string, number>()
  private readonly open = new Map<string, OpenChunk>()
  private readonly acc = new Map<number, Accumulator>()

  constructor(path: string, opts: { readOnly?: boolean } = {}) {
    if (!opts.readOnly && path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(path, { readOnly: opts.readOnly ?? false })
    this.db.exec('PRAGMA busy_timeout = 5000')
    if (!opts.readOnly) {
      // auto_vacuum only takes on a new file, which is the only time it matters.
      this.db.exec('PRAGMA auto_vacuum = INCREMENTAL')
      this.db.exec('PRAGMA journal_mode = WAL')
      this.db.exec('PRAGMA synchronous = NORMAL')
      this.db.exec(SCHEMA)
    }
  }

  close(): void {
    this.db.close()
  }

  private seriesId(key: string, create: boolean): number | null {
    const known = this.ids.get(key)
    if (known !== undefined) return known
    const row = this.db.prepare('SELECT id FROM series WHERE key = ?').get(key) as { id: number } | undefined
    if (row) {
      this.ids.set(key, row.id)
      return row.id
    }
    if (!create) return null
    const result = this.db.prepare('INSERT INTO series (key) VALUES (?)').run(key)
    const id = Number(result.lastInsertRowid)
    this.ids.set(key, id)
    return id
  }

  private chunk(tier: Tier, series: number, t: number): OpenChunk {
    const start = t - (t % CHUNK[tier])
    const mapKey = `${tier}:${series}`
    const held = this.open.get(mapKey)
    if (held && held.start === start) return held
    const row = this.db.prepare(`SELECT data FROM ${tier} WHERE series = ? AND t = ?`).get(series, start) as { data: Uint8Array } | undefined
    const fresh = { start, entries: row ? decode(tier, row.data) : [] }
    this.open.set(mapKey, fresh)
    return fresh
  }

  private append(tier: Tier, series: number, t: number, values: number[], dirty: Set<string>): void {
    const chunk = this.chunk(tier, series, t)
    const width = tier === 'raw' ? 2 : 4
    const offset = t - chunk.start
    const last = chunk.entries.length >= width ? (chunk.entries[chunk.entries.length - width] as number) : -1
    // The clock went back, or the same second twice: keep what is there.
    if (offset <= last) return
    chunk.entries.push(offset, ...values)
    dirty.add(`${tier}:${series}`)
  }

  /**
   * Records one sample of many series at `tSec` (epoch seconds), rolling minutes and
   * hours up as they complete, in one transaction.
   */
  write(tSec: number, values: Map<string, number>): void {
    const t = Math.floor(tSec)
    const dirty = new Set<string>()
    this.db.exec('BEGIN')
    try {
      for (const [key, value] of values) {
        if (!Number.isFinite(value)) continue
        const id = this.seriesId(key, true) as number
        this.append('raw', id, t, [value], dirty)
        this.rollUp(id, t, value, dirty)
      }
      const put = (tier: Tier) => this.db.prepare(`INSERT OR REPLACE INTO ${tier} (series, t, data) VALUES (?, ?, ?)`)
      const statements = { raw: put('raw'), minute: put('minute'), hour: put('hour') }
      for (const mapKey of dirty) {
        const [tier, id] = mapKey.split(':') as [Tier, string]
        const chunk = this.open.get(mapKey)
        if (chunk) statements[tier].run(Number(id), chunk.start, encode(tier, chunk.entries))
      }
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  private rollUp(id: number, t: number, value: number, dirty: Set<string>): void {
    const minute = t - (t % 60)
    const hour = t - (t % 3600)
    let a = this.acc.get(id)
    if (!a) {
      a = { minute, mMin: Infinity, mMax: -Infinity, mSum: 0, mN: 0, hour, hMin: Infinity, hMax: -Infinity, hSum: 0, hN: 0 }
      this.acc.set(id, a)
    }
    if (minute !== a.minute) {
      if (a.mN > 0) {
        const avg = a.mSum / a.mN
        this.append('minute', id, a.minute, [a.mMin, avg, a.mMax], dirty)
        a.hMin = Math.min(a.hMin, a.mMin)
        a.hMax = Math.max(a.hMax, a.mMax)
        a.hSum += avg
        a.hN += 1
      }
      a.minute = minute
      a.mMin = Infinity
      a.mMax = -Infinity
      a.mSum = 0
      a.mN = 0
    }
    if (hour !== a.hour) {
      if (a.hN > 0) this.append('hour', id, a.hour, [a.hMin, a.hSum / a.hN, a.hMax], dirty)
      a.hour = hour
      a.hMin = Infinity
      a.hMax = -Infinity
      a.hSum = 0
      a.hN = 0
    }
    a.mMin = Math.min(a.mMin, value)
    a.mMax = Math.max(a.mMax, value)
    a.mSum += value
    a.mN += 1
  }

  catalogue(): SeriesInfo[] {
    const rows = this.db.prepare('SELECT key FROM series ORDER BY key').all() as { key: string }[]
    return rows.map(({ key }) => ({ key, ...splitKey(key) }))
  }

  /** Every series key with this name, e.g. all `site.cpu_pct@*`. */
  keysNamed(name: string): string[] {
    const rows = this.db.prepare("SELECT key FROM series WHERE key = ? OR key LIKE ? ESCAPE '\\'").all(name, `${name.replace(/[\\%_]/g, (c) => `\\${c}`)}@%`) as { key: string }[]
    return rows.map((r) => r.key)
  }

  /**
   * History of the given series between two epoch-ms instants, at most about
   * `maxPoints` points, from the finest tier that still covers `from`.
   */
  query(keys: string[], from: number, to: number, opts: { maxPoints: number; now: number; sampleSeconds: number; rawHours: number; minuteDays: number }): SeriesQueryResult {
    const fromS = Math.floor(from / 1000)
    const toS = Math.ceil(to / 1000)
    const span = Math.max(1, toS - fromS)
    const nowS = Math.floor(opts.now / 1000)
    const covers: Record<Tier, boolean> = {
      raw: fromS >= nowS - opts.rawHours * 3600,
      minute: fromS >= nowS - opts.minuteDays * 86_400,
      hour: true,
    }
    const native: Record<Tier, number> = { raw: opts.sampleSeconds, minute: NATIVE.minute, hour: NATIVE.hour }
    const tier: Tier = (['raw', 'minute', 'hour'] as const).find((t) => covers[t] && span / native[t] <= opts.maxPoints * 4)
      ?? (covers.minute ? 'minute' : 'hour')
    const step = Math.max(native[tier], niceStep(Math.ceil(span / Math.max(1, opts.maxPoints)), native[tier]))
    const start = fromS - (fromS % step)
    const count = Math.max(1, Math.floor((toS - start) / step) + 1)
    const t = Array.from({ length: count }, (_, i) => (start + i * step) * 1000)

    const series = keys.map((key) => {
      const sums = new Float64Array(count)
      const ns = new Uint32Array(count)
      const mins = new Float64Array(count).fill(Infinity)
      const maxs = new Float64Array(count).fill(-Infinity)
      const id = this.seriesId(key, false)
      if (id !== null) {
        const rows = this.db
          .prepare(`SELECT t, data FROM ${tier} WHERE series = ? AND t >= ? AND t <= ? ORDER BY t`)
          .all(id, start - CHUNK[tier], toS) as { t: number; data: Uint8Array }[]
        const width = tier === 'raw' ? 2 : 4
        for (const row of rows) {
          const entries = decode(tier, row.data)
          for (let i = 0; i < entries.length; i += width) {
            const at = row.t + (entries[i] as number)
            if (at < start || at > toS) continue
            const b = Math.floor((at - start) / step)
            if (b < 0 || b >= count) continue
            const lo = entries[i + 1] as number
            const mid = entries[i + (width === 2 ? 1 : 2)] as number
            const hi = width === 2 ? (entries[i + 1] as number) : (entries[i + 3] as number)
            sums[b] = (sums[b] as number) + mid
            ns[b] = (ns[b] as number) + 1
            if (lo < mins[b]!) mins[b] = lo
            if (hi > maxs[b]!) maxs[b] = hi
          }
        }
      }
      const round = (v: number) => Math.round(v * 1000) / 1000
      return {
        key,
        ...splitKey(key),
        avg: Array.from(sums, (s, i) => (ns[i] ? round(s / ns[i]!) : null)),
        min: Array.from(mins, (m, i) => (ns[i] ? round(m) : null)),
        max: Array.from(maxs, (m, i) => (ns[i] ? round(m) : null)),
      }
    })
    return { from, to, step, tier, t, series }
  }

  /** Drops what has aged out, and keeps the file under its cap. */
  prune(opts: { now: number; rawHours: number; minuteDays: number; hourDays: number; eventDays: number; visitorDays: number; maxStoreMb: number }): void {
    const nowS = Math.floor(opts.now / 1000)
    const run = (sql: string, ...params: SQLInputValue[]) => this.db.prepare(sql).run(...params)
    run('DELETE FROM raw WHERE t < ?', nowS - opts.rawHours * 3600 - CHUNK.raw)
    run('DELETE FROM minute WHERE t < ?', nowS - opts.minuteDays * 86_400 - CHUNK.minute)
    run('DELETE FROM hour WHERE t < ?', nowS - opts.hourDays * 86_400 - CHUNK.hour)
    run('DELETE FROM events WHERE at < ?', opts.now - opts.eventDays * 86_400_000)
    run("DELETE FROM traffic WHERE dim = 'visitor' AND t < ?", nowS - opts.visitorDays * 86_400)
    run('DELETE FROM traffic WHERE t < ?', nowS - opts.minuteDays * 86_400)
    run('DELETE FROM pg_statements WHERE t < ?', nowS - 7 * 86_400)
    run('DELETE FROM notifications WHERE sent_at IS NOT NULL AND sent_at < ?', opts.now - 30 * 86_400_000)
    run("DELETE FROM alerts WHERE state = 'resolved' AND resolved_at < ?", opts.now - opts.eventDays * 86_400_000)
    // Over the cap: raw history goes first, an hour at a time from the oldest end,
    // then per-minute history - the hourly tier is what a year-long chart needs.
    for (let guard = 0; guard < 200 && this.sizeMb() > opts.maxStoreMb; guard++) {
      const oldestRaw = this.db.prepare('SELECT MIN(t) AS t FROM raw').get() as { t: number | null }
      if (oldestRaw.t !== null) {
        run('DELETE FROM raw WHERE t < ?', oldestRaw.t + 3600)
      } else {
        const oldestMinute = this.db.prepare('SELECT MIN(t) AS t FROM minute').get() as { t: number | null }
        if (oldestMinute.t === null) break
        run('DELETE FROM minute WHERE t < ?', oldestMinute.t + 86_400)
      }
      this.db.exec('PRAGMA incremental_vacuum')
    }
    this.db.exec('PRAGMA incremental_vacuum')
    // Every open chunk may be one a delete just removed; reloading costs one read each.
    this.open.clear()
  }

  sizeMb(): number {
    const pages = this.db.prepare('PRAGMA page_count').get() as { page_count: number }
    const size = this.db.prepare('PRAGMA page_size').get() as { page_size: number }
    const free = this.db.prepare('PRAGMA freelist_count').get() as { freelist_count: number }
    return ((pages.page_count - free.freelist_count) * size.page_size) / 1024 / 1024
  }

  getKv<T>(key: string): { value: T; at: number } | null {
    const row = this.db.prepare('SELECT value, at FROM kv WHERE key = ?').get(key) as { value: string; at: number } | undefined
    if (!row) return null
    try {
      return { value: JSON.parse(row.value) as T, at: row.at }
    } catch {
      return null
    }
  }

  setKv(key: string, value: unknown, at: number): void {
    this.db.prepare('INSERT OR REPLACE INTO kv (key, value, at) VALUES (?, ?, ?)').run(key, JSON.stringify(value), at)
  }
}

/** A step of at least `wanted` seconds, rounded up to a whole multiple of the tier's own that reads well. */
function niceStep(wanted: number, native: number): number {
  const ladder = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10_800, 21_600, 43_200, 86_400, 172_800, 604_800]
  const pick = ladder.find((s) => s >= wanted && s % native === 0) ?? Math.ceil(wanted / native) * native
  return pick
}
