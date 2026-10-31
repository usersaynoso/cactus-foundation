// The monitoring half of the admin API: /v1/admin/monitor/..., answered by
// cactus-host from what cactus-monitor records (monitor.ts). The admin token is
// checked by http.ts before anything here runs.
//
// And /v1/metrics: the same live figures in Prometheus's text format, behind a
// read-only token of its own (`cactus-host monitor token`), for a Grafana or any
// other monitoring system added later. That token can read figures and nothing
// else.

import { spawn } from 'node:child_process'
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { audited } from './audit.ts'
import { Host, HostError } from './host.ts'
import { MetricsStore } from './metrics-store.ts'
import { acknowledge, dismiss, listAlerts, markSent, outbox, queueTest, snooze } from './monitor-alerts.ts'
import { queryEvents } from './monitor-events.ts'
import { ACCESS_LOG_DIR } from './caddy.ts'
import { daysUntilFull, livePath, metricsDbPath } from './monitor.ts'
import { PostgresCollector, statementsBetween } from './monitor-postgres.ts'
import type {
  CapacityReport, Forecast, LiveSnapshot, LogLevel, LogLine, LogQueryResult, LogSource, PgActivity,
  PostgresReport, SecurityReport, SiteUsage, UsageReport,
} from './monitor-protocol.ts'
import { monitorDir, readSettings, writeSettings } from './monitor-settings.ts'
import { parseAccessLine } from './monitor-traffic.ts'
import { siteSlice } from './monitor-proc.ts'
import type { SecuritySnapshot } from './monitor-security.ts'
import { writeFileAtomic } from './store.ts'
import { hashToken, newToken, tokenMatches } from './tokens.ts'

type Json = Record<string, unknown>

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

/** One connection to each history file, opened on first use and kept. */
const opened = new Map<string, MetricsStore>()

function store(host: Host): MetricsStore {
  const path = metricsDbPath(host.config.stateDir)
  const known = opened.get(path)
  if (known) return known
  if (!existsSync(path)) throw new HostError('Monitoring has not started yet. On the server: systemctl enable --now cactus-monitor (RUNBOOK section 14).', 503)
  const fresh = new MetricsStore(path)
  opened.set(path, fresh)
  return fresh
}

export function readLive(host: Host): LiveSnapshot | null {
  try {
    return JSON.parse(readFileSync(livePath(host.config.stateDir), 'utf8')) as LiveSnapshot
  } catch {
    return null
  }
}

function num(url: URL, name: string, fallback: number): number {
  const raw = url.searchParams.get(name)
  const v = raw === null || raw === '' ? NaN : Number(raw)
  return Number.isFinite(v) ? v : fallback
}

function range(url: URL, now: number, defaultMs = 3_600_000): { from: number; to: number } {
  const to = Math.min(num(url, 'to', now), now + 60_000)
  const from = Math.min(num(url, 'from', to - defaultMs), to - 1000)
  return { from, to }
}

function knownSite(host: Host, url: URL): string | null {
  const site = url.searchParams.get('site')
  if (!site) return null
  if (!host.store.getSite(site)) throw new HostError(`No site called ${site}`, 404)
  return site
}

// ── Logs ─────────────────────────────────────────────────────────────────────

const SOURCES: LogSource[] = ['site', 'access', 'caddy', 'postgres', 'cactus', 'security', 'system']

function journalFilter(host: Host, source: LogSource, site: string | null): string[] {
  switch (source) {
    case 'site': {
      const ids = site ? [site] : host.store.listSites().map((s) => s.id)
      return ids.flatMap((id) => ['-u', `cactus-${id}-a.service`, '-u', `cactus-${id}-b.service`])
    }
    case 'caddy': return ['-u', 'caddy.service']
    case 'postgres': return ['-u', 'postgresql*']
    case 'cactus': return ['-u', 'cactus-host.service', '-u', 'cactus-monitor.service', '-u', 'cactus-postgres-backup.service']
    case 'security': return ['SYSLOG_IDENTIFIER=sshd', 'SYSLOG_IDENTIFIER=sshd-session', 'SYSLOG_IDENTIFIER=sudo', 'SYSLOG_IDENTIFIER=fail2ban.actions', 'SYSLOG_IDENTIFIER=su']
    default: return []
  }
}

function levelOf(priority: number, message: string): LogLevel {
  if (priority <= 3) return 'error'
  if (priority === 4) return 'warning'
  if (message.startsWith('{')) {
    try {
      const p = JSON.parse(message) as { level?: unknown }
      const l = typeof p.level === 'string' ? p.level.toLowerCase() : typeof p.level === 'number' ? (p.level >= 50 ? 'error' : p.level >= 40 ? 'warn' : p.level >= 30 ? 'info' : 'debug') : ''
      if (l.startsWith('err') || l === 'fatal') return 'error'
      if (l.startsWith('warn')) return 'warning'
      if (l === 'debug' || l === 'trace') return 'debug'
      if (l) return 'info'
    } catch {
      // fall through
    }
  }
  if (/\b(error|exception|unhandled|uncaught|fatal|panic)\b/i.test(message)) return 'error'
  if (/\b(warn|warning|deprecated)\b/i.test(message)) return 'warning'
  return priority >= 7 ? 'debug' : 'info'
}

function journalLine(source: LogSource, raw: string): LogLine | null {
  let e: Json
  try {
    e = JSON.parse(raw) as Json
  } catch {
    return null
  }
  const message = Array.isArray(e.MESSAGE) ? Buffer.from(e.MESSAGE as number[]).toString('utf8') : String(e.MESSAGE ?? '')
  const unit = typeof e._SYSTEMD_UNIT === 'string' ? e._SYSTEMD_UNIT : typeof e.SYSLOG_IDENTIFIER === 'string' ? e.SYSLOG_IDENTIFIER : null
  const site = unit ? /^cactus-([a-z0-9-]+)-[ab]\.service$/.exec(unit)?.[1] ?? null : null
  return {
    at: Math.round(Number(e.__REALTIME_TIMESTAMP) / 1000),
    source,
    unit,
    site,
    level: levelOf(Number(e.PRIORITY ?? 6), message),
    message: message.slice(0, 8000),
    cursor: typeof e.__CURSOR === 'string' ? e.__CURSOR : null,
  }
}

function accessLines(host: Host, site: string | null, from: number, to: number, q: string, limit: number): LogLine[] {
  const ids = site ? [site] : host.store.listSites().map((s) => s.id)
  const out: LogLine[] = []
  const needle = q.toLowerCase()
  for (const id of ids) {
    const path = join(ACCESS_LOG_DIR, `${id}.access.log`)
    let fd: number
    try {
      fd = openSync(path, 'r')
    } catch {
      continue
    }
    try {
      // The tail of the file is where any range a person asks for will be; 8 MB of it is a lot of requests.
      const size = fstatSync(fd).size
      const length = Math.min(size, 8 * 1024 * 1024)
      const buf = Buffer.alloc(length)
      readSync(fd, buf, 0, length, size - length)
      const lines = buf.toString('utf8').split('\n')
      for (let i = lines.length - 1; i >= 0 && out.length < limit * 4; i--) {
        const line = lines[i] as string
        if (needle && !line.toLowerCase().includes(needle)) continue
        const r = parseAccessLine(line, id)
        if (!r || r.at < from || r.at > to) continue
        out.push({
          at: r.at,
          source: 'access',
          unit: null,
          site: id,
          level: r.status >= 500 ? 'error' : r.status >= 400 ? 'warning' : 'info',
          message: `${r.status} ${r.method} ${r.path} ${Math.round(r.durationMs)}ms ${r.bytesOut}B${r.country ? ` ${r.country}` : ''} ${r.agent}`,
          cursor: null,
        })
      }
    } finally {
      closeSync(fd)
    }
  }
  return out.sort((a, b) => b.at - a.at).slice(0, limit)
}

async function queryLogs(host: Host, url: URL, now: number): Promise<LogQueryResult> {
  const source = (url.searchParams.get('source') ?? 'site') as LogSource
  if (!SOURCES.includes(source)) throw new HostError('Unknown log source', 400)
  const site = knownSite(host, url)
  const { from, to } = range(url, now, 3_600_000)
  const limit = Math.max(10, Math.min(num(url, 'limit', 300), 2000))
  const q = (url.searchParams.get('q') ?? '').slice(0, 200)
  const level = url.searchParams.get('level') as LogLevel | null
  const keep = (l: LogLine) => !level || level === 'debug' || (level === 'info' ? l.level !== 'debug' : level === 'warning' ? l.level === 'warning' || l.level === 'error' : l.level === 'error')

  if (source === 'access') {
    const lines = accessLines(host, site, from, to, q, limit * (level ? 4 : 1)).filter(keep).slice(0, limit)
    return { lines, more: lines.length === limit }
  }
  const args = [
    '--no-pager', '-o', 'json', '-r', '-n', String(level ? limit * 5 : limit),
    '--output-fields=MESSAGE,PRIORITY,_SYSTEMD_UNIT,SYSLOG_IDENTIFIER,__REALTIME_TIMESTAMP',
    '--since', `@${Math.floor(from / 1000)}`, '--until', `@${Math.ceil(to / 1000)}`,
  ]
  if (q) args.push('-g', q)
  if (source === 'system' && !level) args.push('-p', '4')
  args.push(...journalFilter(host, source, site))
  const raw: string[] = []
  const result = await host.system.run('journalctl', args, { timeoutMs: 30_000, onLine: (l) => raw.push(l) })
  // journalctl exits 1 for "no entries"; anything else that is not JSON is its complaint.
  if (result.code !== 0 && !raw.some((l) => l.startsWith('{')) && /error|invalid|failed/i.test(result.output)) {
    throw new HostError(`journalctl: ${result.output.trim().split('\n').slice(-1)[0]}`, 400)
  }
  const lines = raw.map((l) => journalLine(source, l)).filter((l): l is LogLine => l !== null).filter(keep).slice(0, limit)
  return { lines, more: lines.length === limit }
}

function sse(res: ServerResponse): (event: string, data: unknown) => void {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
  res.write(': connected\n\n')
  return (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function streamLogs(host: Host, url: URL, req: IncomingMessage, res: ServerResponse): void {
  const source = (url.searchParams.get('source') ?? 'site') as LogSource
  if (!SOURCES.includes(source) || source === 'access') throw new HostError('That log source cannot be followed live', 400)
  const site = knownSite(host, url)
  const q = (url.searchParams.get('q') ?? '').slice(0, 200)
  const args = ['--no-pager', '-f', '-n', '50', '-o', 'json', '--output-fields=MESSAGE,PRIORITY,_SYSTEMD_UNIT,SYSLOG_IDENTIFIER,__REALTIME_TIMESTAMP']
  if (q) args.push('-g', q)
  args.push(...journalFilter(host, source, site))
  const emit = sse(res)
  const child = spawn('journalctl', args, { stdio: ['ignore', 'pipe', 'ignore'] })
  let partial = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    partial += chunk
    const lines = partial.split('\n')
    partial = lines.pop() ?? ''
    for (const l of lines) {
      const line = journalLine(source, l)
      if (line) emit('line', line)
    }
  })
  const ping = setInterval(() => res.write(': ping\n\n'), 15_000)
  const close = () => {
    clearInterval(ping)
    child.kill('SIGTERM')
  }
  req.on('close', close)
  child.on('close', () => {
    clearInterval(ping)
    res.end()
  })
}

function streamLive(host: Host, req: IncomingMessage, res: ServerResponse): void {
  const emit = sse(res)
  const path = livePath(host.config.stateDir)
  let last = 0
  const check = () => {
    try {
      const m = statSync(path).mtimeMs
      if (m === last) return
      last = m
      emit('live', JSON.parse(readFileSync(path, 'utf8')) as LiveSnapshot)
    } catch {
      // Not there yet, or caught mid-rename: the next check gets it.
    }
  }
  check()
  const timer = setInterval(check, 1000)
  const ping = setInterval(() => res.write(': ping\n\n'), 15_000)
  req.on('close', () => {
    clearInterval(timer)
    clearInterval(ping)
  })
}

// ── Capacity and usage ───────────────────────────────────────────────────────

function slopePerDay(t: number[], v: (number | null)[]): number {
  const pts = t.map((at, i) => [at / 86_400_000, v[i]] as const).filter((p): p is readonly [number, number] => p[1] !== null && p[1] !== undefined)
  if (pts.length < 2) return 0
  const n = pts.length
  const mx = pts.reduce((s, p) => s + p[0], 0) / n
  const my = pts.reduce((s, p) => s + p[1], 0) / n
  const den = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0)
  return den ? pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / den : 0
}

function lastValue(v: (number | null)[]): number | null {
  for (let i = v.length - 1; i >= 0; i--) if (v[i] !== null && v[i] !== undefined) return v[i] as number
  return null
}

function firstValue(v: (number | null)[]): number | null {
  for (const x of v) if (x !== null && x !== undefined) return x
  return null
}

function capacity(host: Host, now: number): CapacityReport {
  const s = store(host)
  const settings = readSettings(host.config)
  const live = readLive(host)
  const opts = { maxPoints: 400, now, sampleSeconds: settings.sampleSeconds, rawHours: settings.rawHours, minuteDays: settings.minuteDays }
  const forecasts: Forecast[] = []
  for (const m of live?.server.mounts ?? []) {
    const r = s.query([`disk.used_bytes@${m.mount}`, `disk.total_bytes@${m.mount}`], now - 14 * 86_400_000, now, opts)
    forecasts.push({
      label: m.mount, kind: 'disk', usedBytes: m.usedBytes, totalBytes: m.totalBytes,
      growthBytesPerDay: slopePerDay(r.t, r.series[0]?.avg ?? []),
      daysLeft: daysUntilFull(r.t, r.series[0]?.avg ?? [], r.series[1]?.avg ?? []),
    })
  }
  for (const key of s.keysNamed('db.size_bytes')) {
    const r = s.query([key], now - 30 * 86_400_000, now, opts)
    const used = lastValue(r.series[0]?.avg ?? [])
    if (used === null) continue
    forecasts.push({ label: key.split('@')[1] ?? key, kind: 'database', usedBytes: used, totalBytes: null, growthBytesPerDay: slopePerDay(r.t, r.series[0]?.avg ?? []), daysLeft: null })
  }
  const growth: CapacityReport['growth'] = []
  for (const key of s.keysNamed('site.disk_bytes')) {
    const site = key.split('@')[1] ?? key
    const r = s.query([key], now - 30 * 86_400_000, now, opts)
    const series = r.series[0]?.avg ?? []
    const bytesNow = lastValue(series)
    if (bytesNow === null) continue
    const then = firstValue(series)
    forecasts.push({ label: site, kind: 'site', usedBytes: bytesNow, totalBytes: null, growthBytesPerDay: slopePerDay(r.t, series), daysLeft: null })
    growth.push({ site, bytesNow, bytes30DaysAgo: then, growthBytes: then === null ? 0 : bytesNow - then })
  }
  growth.sort((a, b) => b.growthBytes - a.growthBytes)
  const buildLimit = /^(\d+(?:\.\d+)?)([KMGT]?)$/i.exec(host.config.build.memoryMax)
  const mult: Record<string, number> = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 }
  return {
    forecasts,
    growth,
    memory: {
      totalBytes: live?.host.memTotalBytes ?? 0,
      sumOfSiteLimits: (live?.sites ?? []).filter((x) => x.liveSlot).reduce((n, x) => n + (x.memLimitBytes ?? 0), 0),
      sumOfSiteUse: (live?.sites ?? []).reduce((n, x) => n + x.memBytes, 0),
      buildLimitBytes: buildLimit ? Math.round(Number(buildLimit[1]) * (mult[(buildLimit[2] as string).toUpperCase()] ?? 1)) : 0,
    },
  }
}

export function monthRange(month: string): { from: number; to: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  if (!m) throw new HostError('month must look like 2026-10', 400)
  const from = Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)
  const to = Date.UTC(Number(m[1]), Number(m[2]), 1) - 1
  return { from, to }
}

function usage(host: Host, month: string, now: number): UsageReport {
  const s = store(host)
  const settings = readSettings(host.config)
  const { from, to: monthEnd } = monthRange(month)
  const to = Math.min(monthEnd, now)
  if (to <= from) throw new HostError('That month has not started yet', 400)
  const hours = Math.ceil((to - from) / 3_600_000)
  const opts = { maxPoints: hours + 24, now, sampleSeconds: settings.sampleSeconds, rawHours: 0, minuteDays: settings.minuteDays }
  const q = (keys: string[]) => s.query(keys, from, to, opts)
  const total = (v: (number | null)[], stepS: number, scale = 1) => v.reduce<number>((n, x) => n + (x ?? 0) * stepS * scale, 0)
  const mean = (v: (number | null)[]) => {
    const xs = v.filter((x): x is number => x !== null)
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
  }
  const peak = (v: (number | null)[]) => v.reduce<number>((n, x) => Math.max(n, x ?? 0), 0)

  const events = queryEvents(s.db, { from, to, kinds: ['build.*'], limit: 5000 })
  const alerts = listAlerts(s.db, { state: 'all', from, to, limit: 2000 })
  const sites: SiteUsage[] = host.store.listSites().map((site) => {
    const L = site.id
    const r = q([`site.req_rate@${L}`, `site.bytes_out_bps@${L}`, `site.bytes_in_bps@${L}`, `site.cpu_pct@${L}`, `site.build_cpu_pct@${L}`,
      `site.mem_bytes@${L}`, `site.disk_bytes@${L}`, `site.up@${L}`, `site.p95_ms@${L}`, `site.err5xx_rate@${L}`])
    const [req, out, inn, cpu, bcpu, memS, disk, up, p95, e5] = r.series
    const database = host.siteDatabase(site)
    const db = database ? q([`db.size_bytes@${database}`]).series[0] : undefined
    const upMean = mean(up?.avg ?? [])
    return {
      site: site.id,
      name: site.name,
      requests: Math.round(total(req?.avg ?? [], r.step)),
      bytesOut: Math.round(total(out?.avg ?? [], r.step)),
      bytesIn: Math.round(total(inn?.avg ?? [], r.step)),
      cpuHours: Math.round(total(cpu?.avg ?? [], r.step, 1 / 100 / 3600) * 100) / 100,
      buildCpuHours: Math.round(total(bcpu?.avg ?? [], r.step, 1 / 100 / 3600) * 100) / 100,
      avgMemBytes: Math.round(mean(memS?.avg ?? []) ?? 0),
      peakMemBytes: Math.round(peak(memS?.max ?? [])),
      diskBytes: lastValue(disk?.avg ?? []),
      databaseBytes: db ? lastValue(db.avg) : null,
      uptimePct: upMean === null ? null : Math.round(upMean * 100_000) / 1000,
      p95Ms: mean(p95?.avg ?? []) === null ? null : Math.round(mean(p95?.avg ?? []) as number),
      errors5xx: Math.round(total(e5?.avg ?? [], r.step)),
      deploys: events.filter((e) => e.site === site.id && e.kind === 'build.ok').length,
      failedDeploys: events.filter((e) => e.site === site.id && e.kind === 'build.failed').length,
      incidents: alerts.filter((a) => a.site === site.id && a.startedAt >= from).length,
    }
  })
  const srv = q(['cpu.pct', 'mem.used_pct', 'net.tx_bps', 'net.rx_bps', 'uptime.s'])
  const [cpu, memP, tx, rx, upS] = srv.series
  const covered = (upS?.avg ?? []).filter((v) => v !== null).length
  return {
    month,
    from,
    to,
    sites,
    server: {
      avgCpuPct: Math.round((mean(cpu?.avg ?? []) ?? 0) * 10) / 10,
      peakCpuPct: Math.round(peak(cpu?.max ?? []) * 10) / 10,
      avgMemPct: Math.round((mean(memP?.avg ?? []) ?? 0) * 10) / 10,
      netOutBytes: Math.round(total(tx?.avg ?? [], srv.step)),
      netInBytes: Math.round(total(rx?.avg ?? [], srv.step)),
      uptimePct: srv.t.length ? Math.round((covered / srv.t.length) * 100_000) / 1000 : null,
    },
  }
}

// ── Prometheus ───────────────────────────────────────────────────────────────

function metricsTokenPath(host: Host): string {
  return join(monitorDir(host.config), 'metrics-token.json')
}

/** A new read-only token for /v1/metrics. The old one stops working. */
export function newMetricsToken(host: Host): string {
  const token = `chm_${newToken().slice('chs_'.length)}`
  writeFileAtomic(metricsTokenPath(host), JSON.stringify({ tokenHash: hashToken(token), createdAt: host.system.now() }) + '\n')
  return token
}

export function isMetricsToken(host: Host, token: string): boolean {
  try {
    const record = JSON.parse(readFileSync(metricsTokenPath(host), 'utf8')) as { tokenHash?: string }
    return Boolean(record.tokenHash && tokenMatches(token, record.tokenHash))
  } catch {
    return false
  }
}

export function prometheusText(live: LiveSnapshot): string {
  const lines: string[] = []
  const seen = new Set<string>()
  const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
  const g = (name: string, help: string, value: number | null | undefined, labels: Record<string, string> = {}) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return
    if (!seen.has(name)) {
      lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`)
      seen.add(name)
    }
    const l = Object.entries(labels).map(([k, v]) => `${k}="${esc(v)}"`).join(',')
    lines.push(`${name}${l ? `{${l}}` : ''} ${value}`)
  }
  const sv = live.server
  g('cactus_cpu_percent', 'CPU in use, percent of all cores', sv.cpu.pct)
  g('cactus_load1', 'Load average over a minute', sv.load[0])
  g('cactus_memory_used_bytes', 'Memory in use (total less available)', sv.mem.usedBytes)
  g('cactus_memory_total_bytes', 'Memory in the box', sv.mem.totalBytes)
  g('cactus_swap_used_bytes', 'Swap in use', sv.mem.swapUsedBytes)
  for (const m of sv.mounts) {
    g('cactus_disk_used_bytes', 'Space used on a filesystem', m.usedBytes, { mount: m.mount })
    g('cactus_disk_total_bytes', 'Size of a filesystem', m.totalBytes, { mount: m.mount })
  }
  for (const n of sv.interfaces) {
    g('cactus_network_receive_bytes_per_second', 'Bytes received per second', n.rxBps, { iface: n.iface })
    g('cactus_network_transmit_bytes_per_second', 'Bytes sent per second', n.txBps, { iface: n.iface })
  }
  for (const s of live.services) g('cactus_service_up', 'Whether a box service is running', s.active ? 1 : 0, { service: s.name })
  for (const s of live.sites) {
    const l = { site: s.id }
    g('cactus_site_up', 'Whether the site answers its public health check', s.up === null ? null : s.up ? 1 : 0, l)
    g('cactus_site_cpu_percent', 'CPU used by the site, 100 is one core', s.cpuPct, l)
    g('cactus_site_memory_bytes', 'Memory used by the site', s.memBytes, l)
    g('cactus_site_requests_per_second', 'Visitor requests per second', s.reqRate, l)
    g('cactus_site_5xx_percent', 'Share of requests answered with a server error', s.err5xxPct, l)
    g('cactus_site_p95_milliseconds', '95th percentile response time', s.p95Ms, l)
    g('cactus_site_bytes_out_per_second', 'Bytes sent to visitors per second', s.bytesOutBps, l)
    g('cactus_site_disk_bytes', 'Disk used by the site', s.diskBytes, l)
  }
  if (live.postgres) {
    g('cactus_postgres_connections', 'Client connections to Postgres', live.postgres.connections)
    for (const d of live.postgres.databases) g('cactus_postgres_database_bytes', 'Size of a database', d.sizeBytes, { database: d.name })
  }
  g('cactus_alerts_firing', 'Alerts currently open', live.alerts.firing)
  return lines.join('\n') + '\n'
}

// ── Routing ──────────────────────────────────────────────────────────────────

async function body(req: IncomingMessage): Promise<Json> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > 256 * 1024) throw new HostError('Request body too large', 413)
    chunks.push(chunk as Buffer)
  }
  if (!size) return {}
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error()
    return parsed as Json
  } catch {
    throw new HostError('The request body must be a JSON object', 400)
  }
}

/** Handles /v1/admin/monitor/<rest...>. */
export async function handleMonitor(host: Host, method: string, rest: string[], url: URL, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const now = host.system.now()
  const route = `${method} /${rest.map((p, i) => (i === 1 && rest[0] === 'alerts' && /^\d+$/.test(p) ? ':id' : p)).join('/')}`
  const settings = () => readSettings(host.config)

  switch (route) {
    case 'GET /live': {
      const live = readLive(host)
      if (!live) throw new HostError('Monitoring has not started yet. On the server: systemctl enable --now cactus-monitor (RUNBOOK section 14).', 503)
      return send(res, 200, { live, stale: now - live.at > Math.max(60_000, live.sampleSeconds * 3000) })
    }
    case 'GET /stream':
      return streamLive(host, req, res)
    case 'GET /catalogue':
      return send(res, 200, { series: store(host).catalogue(), sites: host.store.listSites().map((s) => ({ id: s.id, name: s.name, database: host.siteDatabase(s) })) })
    case 'GET /query': {
      const s = store(host)
      const { from, to } = range(url, now)
      const keys = new Set((url.searchParams.get('keys') ?? '').split(',').map((k) => k.trim()).filter(Boolean))
      for (const name of url.searchParams.getAll('name')) for (const k of s.keysNamed(name)) keys.add(k)
      if (!keys.size) throw new HostError('Ask for at least one series: keys=a,b or name=x', 400)
      if (keys.size > 200) throw new HostError('At most 200 series at once', 400)
      const st = settings()
      return send(res, 200, s.query([...keys], from, to, {
        maxPoints: Math.max(20, Math.min(num(url, 'points', 600), 3000)), now,
        sampleSeconds: st.sampleSeconds, rawHours: st.rawHours, minuteDays: st.minuteDays,
      }))
    }
    case 'GET /events': {
      const { from, to } = range(url, now, 86_400_000)
      const kinds = (url.searchParams.get('kinds') ?? '').split(',').map((k) => k.trim()).filter(Boolean)
      return send(res, 200, { events: queryEvents(store(host).db, { from, to, site: knownSite(host, url), kinds, limit: num(url, 'limit', 500) }) })
    }
    case 'GET /traffic': {
      const { trafficReport } = await import('./monitor-traffic.ts')
      const { from, to } = range(url, now, 86_400_000)
      return send(res, 200, trafficReport(store(host).db, knownSite(host, url), from, to))
    }
    case 'GET /postgres': {
      const s = store(host)
      const { from, to } = range(url, now, 86_400_000)
      const live = readLive(host)
      const report: PostgresReport = {
        live: live?.postgres ?? null,
        activity: s.getKv<PgActivity[]>('pg.activity')?.value ?? [],
        statements: statementsBetween(s.db, from, to, url.searchParams.get('database')),
        statementsAvailable: live?.postgres?.statementsAvailable ?? false,
      }
      return send(res, 200, report)
    }
    case 'POST /postgres/cancel': {
      const b = await body(req)
      const pid = Number(b.pid)
      const cancelled = await audited(host.config, () => now, 'admin-api', 'monitor.cancel-query', String(pid), () => new PostgresCollector(host.config, host.system).cancel(pid))
      return send(res, 200, { cancelled })
    }
    case 'GET /logs':
      return send(res, 200, await queryLogs(host, url, now))
    case 'GET /logs/stream':
      return streamLogs(host, url, req, res)
    case 'GET /alerts':
      return send(res, 200, {
        alerts: listAlerts(store(host).db, {
          state: (url.searchParams.get('state') as 'open' | 'resolved' | 'all' | null) ?? 'all',
          site: knownSite(host, url),
          limit: num(url, 'limit', 200),
          ...(url.searchParams.has('from') ? range(url, now) : {}),
        }),
      })
    case 'POST /alerts/:id/ack': {
      const b = await body(req)
      const alert = acknowledge(store(host).db, Number(rest[1]), typeof b.by === 'string' ? b.by : 'someone', now)
      if (!alert) throw new HostError('No such alert', 404)
      return send(res, 200, { alert })
    }
    case 'POST /alerts/:id/snooze': {
      const b = await body(req)
      const alert = snooze(store(host).db, Number(rest[1]), Number(b.minutes) || 0, now)
      if (!alert) throw new HostError('No such alert', 404)
      return send(res, 200, { alert })
    }
    case 'POST /alerts/:id/dismiss': {
      const alert = dismiss(store(host).db, Number(rest[1]), now)
      if (!alert) throw new HostError('No such alert', 404)
      return send(res, 200, { alert })
    }
    case 'GET /alerts/outbox':
      return send(res, 200, { notifications: outbox(store(host).db, now), settings: settings().alerts })
    case 'POST /alerts/outbox': {
      const b = await body(req)
      const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is number => Number.isInteger(x)) : []
      markSent(store(host).db, ids, now)
      return send(res, 200, { ok: true })
    }
    case 'POST /alerts/test':
      queueTest(store(host).db, now)
      return send(res, 200, { ok: true })
    case 'GET /settings':
      return send(res, 200, { settings: settings(), storeMb: existsSync(metricsDbPath(host.config.stateDir)) ? Math.round(store(host).sizeMb()) : null })
    case 'PUT /settings': {
      const b = await body(req)
      const saved = await audited(host.config, () => now, 'admin-api', 'monitor.settings', null, async () => writeSettings(host.config, b.settings ?? b))
      return send(res, 200, { settings: saved })
    }
    case 'GET /security': {
      const s = store(host)
      const snap = s.getKv<SecuritySnapshot>('security')?.value ?? null
      const report: SecurityReport = {
        at: snap?.at ?? null,
        updates: snap?.updates ?? null,
        rebootRequired: snap?.rebootRequired ?? false,
        rebootPackages: snap?.rebootPackages ?? [],
        fail2ban: snap?.fail2ban ?? null,
        ports: snap?.ports ?? [],
        ssh: snap?.ssh ?? null,
        firewall: snap?.firewall ?? { active: null },
        recentLogins: queryEvents(s.db, { from: now - 30 * 86_400_000, to: now, kinds: ['ssh.login'], limit: 50 }),
      }
      return send(res, 200, report)
    }
    case 'GET /capacity':
      return send(res, 200, capacity(host, now))
    case 'GET /usage': {
      const month = url.searchParams.get('month') ?? new Date(now).toISOString().slice(0, 7)
      return send(res, 200, usage(host, month, now))
    }
    case 'GET /slices':
      // Which sites are in their own slice yet - the Settings tab's "run site refresh" hint.
      return send(res, 200, { sites: host.store.listSites().map((s) => ({ id: s.id, slice: siteSlice(s.id), inSlice: existsSync(join('/sys/fs/cgroup/cactus.slice', siteSlice(s.id))) })) })
    default:
      return send(res, 404, { error: 'Not found' })
  }
}
