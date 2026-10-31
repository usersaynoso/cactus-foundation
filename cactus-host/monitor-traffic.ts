// Visitor traffic, from Caddy's JSON access logs: /var/log/caddy/<site>.access.log,
// one per site (caddy.ts writes the `log` block). Read as they grow, like `tail -f`.
//
// Two things come out of every line:
//   - per-site figures for each sample: requests, errors, latency percentiles, bytes
//     in and out - stored as series like everything else;
//   - per-minute breakdowns (paths, status codes, countries, visitors, browsers),
//     the top 50 of each kept per site per minute in the `traffic` table, the rest
//     folded into "(other)".
//
// Behind Cloudflare, Caddy's own idea of the client is a Cloudflare address, so the
// visitor is taken from Cf-Connecting-IP and the country from Cf-IPCountry. Visitor
// addresses are personal data: they are kept `visitorDays` and no longer.

import { closeSync, fstatSync, openSync, readSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { TrafficReport, TrafficRow } from './monitor-protocol.ts'

export type AccessRecord = {
  site: string
  at: number
  path: string
  method: string
  status: number
  durationMs: number
  bytesOut: number
  bytesIn: number
  ip: string | null
  country: string | null
  agent: string
  bot: boolean
}

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|monitor|uptime|pingdom|headless|lighthouse|curl|wget|python-requests|httpx|go-http|axios|node-fetch|okhttp|java\//i

/** A browser or bot family, for the "who visits" breakdown. Deliberately coarse. */
export function agentFamily(ua: string): { agent: string; bot: boolean } {
  if (!ua) return { agent: 'Unknown', bot: true }
  if (BOT.test(ua)) {
    const named = /(Googlebot|bingbot|Applebot|DuckDuckBot|YandexBot|Baiduspider|AhrefsBot|SemrushBot|MJ12bot|GPTBot|ClaudeBot|PerplexityBot|facebookexternalhit|Twitterbot|LinkedInBot|UptimeRobot|curl|Wget|python-requests)/i.exec(ua)
    return { agent: `Bot: ${named ? named[1] : 'other'}`, bot: true }
  }
  const mobile = /Mobile|Android|iPhone|iPad/i.test(ua) ? ' (mobile)' : ''
  const family = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Other'
  return { agent: `${family}${mobile}`, bot: false }
}

/** A path with the query string off and the endlessly varying parts folded together. */
export function normalisePath(uri: string): string {
  let path = uri.split('?')[0] ?? '/'
  if (path.startsWith('/_next/static/')) return '/_next/static/*'
  if (path.startsWith('/_next/image')) return '/_next/image'
  path = path
    .split('/')
    .map((seg) => (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg) || /^\d{4,}$/.test(seg) || /^[A-Za-z0-9_-]{24,}$/.test(seg) ? ':id' : seg))
    .join('/')
  return path.length > 120 ? `${path.slice(0, 117)}...` : path || '/'
}

function header(headers: unknown, name: string): string | null {
  if (!headers || typeof headers !== 'object') return null
  const value = (headers as Record<string, unknown>)[name]
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : null
}

/** One line of a Caddy JSON access log, or null for anything that is not a request. */
export function parseAccessLine(line: string, site: string): AccessRecord | null {
  if (!line.startsWith('{')) return null
  let entry: Record<string, unknown>
  try {
    entry = JSON.parse(line) as Record<string, unknown>
  } catch {
    return null
  }
  const request = entry.request as Record<string, unknown> | undefined
  if (!request || typeof entry.status !== 'number') return null
  const ua = header(request.headers, 'User-Agent') ?? ''
  const { agent, bot } = agentFamily(ua)
  const country = header(request.headers, 'Cf-Ipcountry')
  return {
    site,
    at: Math.round(Number(entry.ts) * 1000) || Date.now(),
    path: normalisePath(typeof request.uri === 'string' ? request.uri : '/'),
    method: typeof request.method === 'string' ? request.method : 'GET',
    status: entry.status,
    durationMs: Math.max(0, Number(entry.duration) * 1000 || 0),
    bytesOut: Math.max(0, Number(entry.size) || 0),
    bytesIn: Math.max(0, Number(entry.bytes_read) || 0),
    ip: header(request.headers, 'Cf-Connecting-Ip') ?? (typeof request.client_ip === 'string' ? request.client_ip : typeof request.remote_ip === 'string' ? request.remote_ip : null),
    country: country && /^[A-Z]{2}$/.test(country) ? country : country === 'XX' || country === 'T1' ? country : null,
    agent,
    bot,
  }
}

type FileState = { inode: number; offset: number; partial: string }

/** Follows every `<site>.access.log` in a directory, from where it left off. */
export class AccessLogTailer {
  private readonly files = new Map<string, FileState>()
  private readonly dir: string

  constructor(dir: string) {
    this.dir = dir
  }

  /** New lines since the last call, per site. The first call skips what was already there. */
  poll(maxBytesPerFile = 32 * 1024 * 1024): AccessRecord[] {
    const out: AccessRecord[] = []
    let names: string[]
    try {
      names = readdirSync(this.dir).filter((n) => n.endsWith('.access.log'))
    } catch {
      return out
    }
    for (const name of names) {
      const site = name.slice(0, -'.access.log'.length)
      const path = join(this.dir, name)
      let stat
      try {
        stat = statSync(path)
      } catch {
        continue
      }
      const known = this.files.get(path)
      if (!known) {
        this.files.set(path, { inode: stat.ino, offset: stat.size, partial: '' })
        continue
      }
      // Rolled: Caddy renamed the old file away and started a new one.
      if (known.inode !== stat.ino || stat.size < known.offset) {
        known.inode = stat.ino
        known.offset = 0
        known.partial = ''
      }
      if (stat.size === known.offset) continue
      let fd: number
      try {
        fd = openSync(path, 'r')
      } catch {
        continue
      }
      try {
        const size = fstatSync(fd).size
        // A file that grew by more than we will read in one go: skip to near the end
        // rather than fall ever further behind.
        if (size - known.offset > maxBytesPerFile) {
          known.offset = size - maxBytesPerFile
          known.partial = ''
        }
        const buf = Buffer.alloc(size - known.offset)
        const read = readSync(fd, buf, 0, buf.length, known.offset)
        known.offset += read
        const text = known.partial + buf.subarray(0, read).toString('utf8')
        const lines = text.split('\n')
        known.partial = lines.pop() ?? ''
        for (const line of lines) {
          const record = parseAccessLine(line, site)
          if (record) out.push(record)
        }
      } finally {
        closeSync(fd)
      }
    }
    return out
  }
}

export type SiteTrafficSample = {
  reqRate: number
  err4xxRate: number
  err5xxRate: number
  err5xxPct: number
  p50Ms: number | null
  p95Ms: number | null
  p99Ms: number | null
  bytesOutBps: number
  bytesInBps: number
  botRate: number
}

type Interval = { requests: number; e4: number; e5: number; bytesOut: number; bytesIn: number; bots: number; durations: number[] }
type DimRow = { requests: number; bytes: number; errors: number; durSum: number; durMax: number }

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] as number
}

const DIMENSIONS = ['path', 'status', 'country', 'visitor', 'agent'] as const
const TOP_N = 50

/** Turns access records into per-sample figures and per-minute breakdowns. */
export class TrafficAggregator {
  private interval = new Map<string, Interval>()
  /** `${site}\t${minuteSec}\t${dim}\t${key}` */
  private minutes = new Map<string, DimRow>()

  add(records: AccessRecord[]): void {
    for (const r of records) {
      let i = this.interval.get(r.site)
      if (!i) {
        i = { requests: 0, e4: 0, e5: 0, bytesOut: 0, bytesIn: 0, bots: 0, durations: [] }
        this.interval.set(r.site, i)
      }
      i.requests++
      if (r.status >= 500) i.e5++
      else if (r.status >= 400) i.e4++
      i.bytesOut += r.bytesOut
      i.bytesIn += r.bytesIn
      if (r.bot) i.bots++
      if (i.durations.length < 50_000) i.durations.push(r.durationMs)

      const minute = Math.floor(r.at / 60_000) * 60
      const keys: Record<(typeof DIMENSIONS)[number], string | null> = {
        path: `${r.method} ${r.path}`,
        status: String(r.status),
        country: r.country,
        visitor: r.ip,
        agent: r.agent,
      }
      for (const dim of DIMENSIONS) {
        const key = keys[dim]
        if (!key) continue
        const mapKey = `${r.site}\t${minute}\t${dim}\t${key}`
        const row = this.minutes.get(mapKey) ?? { requests: 0, bytes: 0, errors: 0, durSum: 0, durMax: 0 }
        row.requests++
        row.bytes += r.bytesOut
        if (r.status >= 500) row.errors++
        row.durSum += r.durationMs
        row.durMax = Math.max(row.durMax, r.durationMs)
        this.minutes.set(mapKey, row)
      }
    }
  }

  /** Figures for the interval just ended, per site, and a fresh interval. Sites with no traffic still get zeros. */
  drain(seconds: number, sites: string[]): Map<string, SiteTrafficSample> {
    const out = new Map<string, SiteTrafficSample>()
    const secs = Math.max(1, seconds)
    for (const site of new Set([...sites, ...this.interval.keys()])) {
      const i = this.interval.get(site) ?? { requests: 0, e4: 0, e5: 0, bytesOut: 0, bytesIn: 0, bots: 0, durations: [] }
      const sorted = i.durations.sort((a, b) => a - b)
      out.set(site, {
        reqRate: i.requests / secs,
        err4xxRate: i.e4 / secs,
        err5xxRate: i.e5 / secs,
        err5xxPct: i.requests ? (i.e5 / i.requests) * 100 : 0,
        p50Ms: percentile(sorted, 50),
        p95Ms: percentile(sorted, 95),
        p99Ms: percentile(sorted, 99),
        bytesOutBps: i.bytesOut / secs,
        bytesInBps: i.bytesIn / secs,
        botRate: i.bots / secs,
      })
    }
    this.interval = new Map()
    return out
  }

  /** Writes every minute that has finished (older than `nowMs`'s minute) into the traffic table. */
  flush(db: DatabaseSync, nowMs: number): void {
    const current = Math.floor(nowMs / 60_000) * 60
    const groups = new Map<string, [string, DimRow][]>()
    for (const [mapKey, row] of this.minutes) {
      const [site, minute, dim, key] = mapKey.split('\t') as [string, string, string, string]
      if (Number(minute) >= current) continue
      const g = `${site}\t${minute}\t${dim}`
      const list = groups.get(g) ?? []
      list.push([key, row])
      groups.set(g, list)
      this.minutes.delete(mapKey)
    }
    if (!groups.size) return
    const put = db.prepare(`INSERT INTO traffic (site, t, dim, key, requests, bytes, errors, dur_sum, dur_max) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (site, t, dim, key) DO UPDATE SET requests = requests + excluded.requests, bytes = bytes + excluded.bytes,
      errors = errors + excluded.errors, dur_sum = dur_sum + excluded.dur_sum, dur_max = MAX(dur_max, excluded.dur_max)`)
    db.exec('BEGIN')
    try {
      for (const [g, rows] of groups) {
        const [site, minute, dim] = g.split('\t') as [string, string, string]
        rows.sort((a, b) => b[1].requests - a[1].requests)
        const kept = rows.slice(0, TOP_N)
        const rest = rows.slice(TOP_N)
        if (rest.length) {
          kept.push(['(other)', rest.reduce<DimRow>((acc, [, r]) => ({
            requests: acc.requests + r.requests, bytes: acc.bytes + r.bytes, errors: acc.errors + r.errors,
            durSum: acc.durSum + r.durSum, durMax: Math.max(acc.durMax, r.durMax),
          }), { requests: 0, bytes: 0, errors: 0, durSum: 0, durMax: 0 })])
        }
        for (const [key, r] of kept) put.run(site, Number(minute), dim, key, r.requests, Math.round(r.bytes), r.errors, r.durSum, r.durMax)
      }
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }
}

/** The breakdowns for one site (or every site) over a time range. */
export function trafficReport(db: DatabaseSync, site: string | null, from: number, to: number): TrafficReport {
  const fromS = Math.floor(from / 1000)
  const toS = Math.ceil(to / 1000)
  const where = site ? 'site = ? AND t >= ? AND t <= ?' : 't >= ? AND t <= ?'
  const params = site ? [site, fromS, toS] : [fromS, toS]
  const rows = (dim: string, order: string, limit = 25, extra = ''): TrafficRow[] =>
    (db.prepare(`SELECT key, SUM(requests) AS requests, SUM(bytes) AS bytes, SUM(errors) AS errors,
        SUM(dur_sum) / MAX(1, SUM(requests)) AS avgMs, MAX(dur_max) AS maxMs
      FROM traffic WHERE ${where} AND dim = ? ${extra} GROUP BY key ORDER BY ${order} DESC LIMIT ${limit}`)
      .all(...params, dim) as TrafficRow[]).map((r) => ({ ...r, avgMs: Math.round(r.avgMs * 10) / 10, maxMs: Math.round(r.maxMs * 10) / 10 }))
  const status = rows('status', 'requests', 40)
  const sum = (pred: (code: number) => boolean) => status.filter((s) => pred(Number(s.key))).reduce((n, s) => n + s.requests, 0)
  const agents = rows('agent', 'requests', 30)
  const totalsRow = db.prepare(`SELECT SUM(requests) AS requests, SUM(bytes) AS bytes, SUM(dur_sum) / MAX(1, SUM(requests)) AS avgMs FROM traffic WHERE ${where} AND dim = 'status'`)
    .get(...params) as { requests: number | null; bytes: number | null; avgMs: number | null }
  return {
    from,
    to,
    totals: {
      requests: totalsRow.requests ?? 0,
      bytes: totalsRow.bytes ?? 0,
      errors4xx: sum((c) => c >= 400 && c < 500),
      errors5xx: sum((c) => c >= 500),
      bots: agents.filter((a) => a.key.startsWith('Bot:') || a.key === 'Unknown').reduce((n, a) => n + a.requests, 0),
      avgMs: Math.round((totalsRow.avgMs ?? 0) * 10) / 10,
    },
    paths: rows('path', 'requests'),
    slowPaths: rows('path', 'SUM(dur_sum) / MAX(1, SUM(requests))', 25, "AND key <> '(other)'"),
    errorPaths: rows('path', 'errors', 25, 'AND errors > 0'),
    countries: rows('country', 'requests', 50),
    visitors: rows('visitor', 'requests'),
    agents,
    status,
  }
}
