// Things that happened, on one timeline: deploys, rollbacks, crashes, out-of-memory
// kills, restarts, backups, failed cron jobs, logins, bans, reboots. Every chart in
// Oasis draws them as markers, which is usually what explains a spike.
//
// Two feeds:
//   - the journal, followed live (`journalctl -f -o json`) and classified line by
//     line here;
//   - cactus-host's own records - builds, the admin audit log, the cron log - read
//     once a minute for anything new since last time.

import { spawn, type ChildProcess } from 'node:child_process'
import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import { readAudit } from './audit.ts'
import { readCronLog } from './cron-log.ts'
import type { Host } from './host.ts'
import type { EventSeverity, MonitorEvent } from './monitor-protocol.ts'
import type { MetricsStore } from './metrics-store.ts'

export type NewEvent = Omit<MonitorEvent, 'id'>

export function insertEvent(db: DatabaseSync, e: NewEvent): void {
  db.prepare('INSERT INTO events (at, kind, severity, site, title, detail) VALUES (?, ?, ?, ?, ?, ?)')
    .run(e.at, e.kind, e.severity, e.site, e.title.slice(0, 300), e.detail ? e.detail.slice(0, 4000) : null)
}

export function queryEvents(db: DatabaseSync, q: { from: number; to: number; site?: string | null; kinds?: string[]; limit?: number; afterId?: number }): MonitorEvent[] {
  const where = ['at >= ?', 'at <= ?']
  const params: SQLInputValue[] = [q.from, q.to]
  if (q.site) {
    // A site's own events, and the server-wide ones that touch every site.
    where.push('(site = ? OR site IS NULL)')
    params.push(q.site)
  }
  if (q.kinds?.length) {
    where.push(`(${q.kinds.map(() => 'kind LIKE ?').join(' OR ')})`)
    params.push(...q.kinds.map((k) => (k.endsWith('*') ? `${k.slice(0, -1)}%` : k)))
  }
  if (q.afterId) {
    where.push('id > ?')
    params.push(q.afterId)
  }
  const limit = Math.max(1, Math.min(q.limit ?? 500, 5000))
  return db.prepare(`SELECT id, at, kind, severity, site, title, detail FROM events WHERE ${where.join(' AND ')} ORDER BY at DESC LIMIT ${limit}`)
    .all(...params) as MonitorEvent[]
}

// ── The journal ──────────────────────────────────────────────────────────────

export type JournalEntry = {
  at: number
  unit: string | null
  identifier: string | null
  priority: number
  message: string
}

/** What one journal line means to the monitor: an event, a counter to bump, or both. */
export type Classified = { event?: NewEvent; counter?: { name: string; site?: string } }

export function parseJournalJson(line: string): JournalEntry | null {
  let e: Record<string, unknown>
  try {
    e = JSON.parse(line) as Record<string, unknown>
  } catch {
    return null
  }
  const message = Array.isArray(e.MESSAGE) ? Buffer.from(e.MESSAGE as number[]).toString('utf8') : typeof e.MESSAGE === 'string' ? e.MESSAGE : ''
  return {
    at: Math.round(Number(e.__REALTIME_TIMESTAMP) / 1000) || Date.now(),
    unit: typeof e._SYSTEMD_UNIT === 'string' ? e._SYSTEMD_UNIT : typeof e.UNIT === 'string' ? e.UNIT : null,
    identifier: typeof e.SYSLOG_IDENTIFIER === 'string' ? e.SYSLOG_IDENTIFIER : null,
    priority: Number(e.PRIORITY ?? 6),
    message,
  }
}

/** The site a unit or cgroup path belongs to, if it is one of cactus-host's. */
export function siteFromUnit(unit: string | null): string | null {
  if (!unit) return null
  const slot = /^cactus-([a-z0-9-]+)-[ab]\.service$/.exec(unit)
  if (slot) return slot[1] as string
  const build = /^cactus-build-([a-z0-9-]+)-[a-z0-9]+\.service$/.exec(unit)
  if (build) return build[1] as string
  const slice = /cactus-([a-z0-9\\x]+)\.slice/.exec(unit)
  return slice ? (slice[1] as string).replace(/\\x2d/g, '-') : null
}

const SITE_ERROR = /\b(error|exception|unhandled|uncaught|fatal|ECONNREFUSED|ETIMEDOUT|EPIPE)\b/i

/** Whether a line from a site's process reads as an error. Node writes everything at priority 6, so this looks at the words. */
export function siteLineIsError(message: string): boolean {
  if (message.startsWith('{')) {
    try {
      const parsed = JSON.parse(message) as { level?: unknown }
      if (typeof parsed.level === 'string') return /error|fatal/i.test(parsed.level)
      if (typeof parsed.level === 'number') return parsed.level >= 50
    } catch {
      // Not JSON after all; fall through to the words.
    }
  }
  return SITE_ERROR.test(message)
}

export function classifyJournal(e: JournalEntry): Classified | null {
  const m = e.message
  const ev = (kind: string, severity: EventSeverity, title: string, site: string | null = null, detail: string | null = null): NewEvent =>
    ({ at: e.at, kind, severity, site, title, detail })

  if (e.identifier === 'kernel') {
    if (/\[UFW BLOCK\]/.test(m)) return { counter: { name: 'sec.fw_blocked' } }
    const oom = /Out of memory: Killed process \d+ \(([^)]+)\)|oom-kill:.*task_memcg=([^,]+).*task=([^,]+)/.exec(m)
    if (oom) {
      const site = siteFromUnit(oom[2] ?? null)
      return { event: ev('oom', 'error', `Out of memory: the kernel killed ${oom[1] ?? oom[3] ?? 'a process'}${site ? ` (${site})` : ''}`, site, m), counter: site ? { name: 'site.oom', site } : undefined }
    }
    return null
  }

  if (e.identifier === 'sshd' || e.unit === 'ssh.service' || e.unit === 'sshd.service') {
    if (/^(Failed password|Invalid user|Connection closed by authenticating user|Disconnected from authenticating user)/.test(m)) return { counter: { name: 'sec.ssh_failed' } }
    const ok = /^Accepted (\S+) for (\S+) from (\S+)/.exec(m)
    if (ok) return { event: ev('ssh.login', 'info', `SSH login: ${ok[2]} from ${ok[3]} (${ok[1]})`) }
    return null
  }

  if (e.identifier === 'fail2ban.actions' || e.unit === 'fail2ban.service') {
    const ban = /\[(\S+)\]\s+Ban\s+(\S+)/.exec(m)
    if (ban) return { event: ev('security.ban', 'info', `fail2ban banned ${ban[2]} (${ban[1]})`), counter: { name: 'sec.bans' } }
    return null
  }

  if (e.identifier === 'systemd' || e.unit === 'init.scope') {
    const unitMatch = /^([\w@\\.-]+\.(?:service|timer|socket)): (.*)$/.exec(m)
    if (!unitMatch) return null
    const [, unit, rest] = unitMatch as unknown as [string, string, string]
    const site = siteFromUnit(unit)
    if (unit.startsWith('cactus-postgres-backup') && /Failed with result/.test(rest)) {
      return { event: ev('backup.failed', 'error', 'The nightly database backup failed', null, rest) }
    }
    if (/Failed with result/.test(rest) && !unit.startsWith('cactus-build-')) {
      return { event: ev('unit.failed', 'error', `${site ? `${site}: ` : ''}${unit} stopped with an error`, site, rest) }
    }
    if (/Scheduled restart job, restart counter is at (\d+)/.test(rest)) {
      return { event: ev('unit.restart', 'warning', `${site ? `${site}: ` : ''}${unit} restarted`, site, rest) }
    }
    return null
  }

  const site = siteFromUnit(e.unit)
  if (site && e.unit && !e.unit.startsWith('cactus-build-') && siteLineIsError(m)) return { counter: { name: 'site.log_errors', site } }
  if (e.unit === 'caddy.service' && e.priority <= 3) return { counter: { name: 'caddy.errors' } }
  if (e.unit?.startsWith('postgresql') && /\b(ERROR|FATAL|PANIC)\b/.test(m)) return { counter: { name: 'pg.errors' } }
  return null
}

/**
 * Follows the journal for as long as the monitor runs, handing each classified
 * line to `onLine`. Restarts journalctl if it ever exits.
 */
export class JournalFollower {
  private child: ChildProcess | null = null
  private stopped = false
  private readonly onEntry: (e: JournalEntry) => void

  constructor(onEntry: (e: JournalEntry) => void) {
    this.onEntry = onEntry
  }

  start(): void {
    if (this.stopped) return
    const child = spawn('journalctl', ['-f', '-n', '0', '-o', 'json', '--output-fields=MESSAGE,_SYSTEMD_UNIT,UNIT,SYSLOG_IDENTIFIER,PRIORITY'], { stdio: ['ignore', 'pipe', 'ignore'] })
    this.child = child
    let partial = ''
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      partial += chunk
      const lines = partial.split('\n')
      partial = lines.pop() ?? ''
      for (const line of lines) {
        const entry = parseJournalJson(line)
        if (entry) this.onEntry(entry)
      }
    })
    child.on('error', () => undefined)
    child.on('close', () => {
      this.child = null
      if (!this.stopped) setTimeout(() => this.start(), 10_000).unref()
    })
  }

  stop(): void {
    this.stopped = true
    this.child?.kill('SIGTERM')
  }
}

// ── cactus-host's own records ────────────────────────────────────────────────

type Seen = { builds: Record<string, string[]>; audit: number; cron: number }

const AUDIT_TITLES: Record<string, string> = {
  'site.rollback': 'Rolled back',
  'site.rollback.database': 'Rolled back, with the database',
  'site.create': 'Site created',
  'site.rename': 'Site renamed',
  'site.domain.add': 'Domain added',
  'site.domain.remove': 'Domain removed',
  'site.domain.primary': 'Primary domain changed',
  'site.certificate': 'Certificate issued',
  'site.certificate.renew': 'Certificate renewed',
  'site.edit': 'Site settings changed',
  'site.update': 'Update requested',
  'db.create': 'Database created',
  'db.backup': 'Database backed up',
  'db.destination': 'Backup destination changed',
  'monitor.settings': 'Monitoring settings changed',
  'monitor.cancel-query': 'Database query cancelled',
}

/** Anything new in cactus-host's builds, audit log and cron log since the last call, as events. */
export function hostHistoryEvents(host: Host, store: MetricsStore, now: number): NewEvent[] {
  const seen = store.getKv<Seen>('events.seen')?.value ?? null
  const out: NewEvent[] = []
  const next: Seen = { builds: {}, audit: seen?.audit ?? now, cron: seen?.cron ?? now }

  for (const site of host.store.listSites()) {
    const builds = host.store.listBuilds(site.id)
    const finished = builds.filter((b) => b.finishedAt !== null)
    next.builds[site.id] = finished.slice(0, 30).map((b) => b.id)
    // The first time round, everything already there counts as seen.
    if (!seen) continue
    const before = new Set(seen.builds[site.id] ?? [])
    for (const b of finished) {
      if (before.has(b.id) || (b.finishedAt ?? 0) < now - 86_400_000) continue
      const seconds = b.startedAt && b.finishedAt ? Math.round((b.finishedAt - b.startedAt) / 1000) : null
      if (b.state === 'ready') {
        out.push({ at: b.finishedAt as number, kind: b.trigger === 'rollback' ? 'build.rollback' : 'build.ok', severity: 'info', site: site.id,
          title: b.trigger === 'rollback' ? `${site.name}: rolled back to ${b.sha.slice(0, 7)}` : `${site.name}: deployed ${b.sha.slice(0, 7)}${seconds ? ` in ${seconds}s` : ''}`, detail: b.ref })
      } else if (b.state === 'error') {
        out.push({ at: b.finishedAt as number, kind: 'build.failed', severity: 'error', site: site.id, title: `${site.name}: deploy failed`, detail: b.error })
      }
    }
  }

  if (seen) {
    for (const entry of readAudit(host.config, 200)) {
      if (entry.at <= seen.audit || entry.action === 'site.build') continue
      const site = entry.target?.split(' ')[0] ?? null
      const known = site && host.store.getSite(site) ? site : null
      out.push({
        at: entry.at,
        kind: entry.ok ? `admin.${entry.action}` : 'admin.failed',
        severity: entry.ok ? 'info' : 'warning',
        site: known,
        title: `${AUDIT_TITLES[entry.action] ?? entry.action}${entry.target ? `: ${entry.target}` : ''}${entry.ok ? '' : ' (failed)'}`,
        detail: entry.error,
      })
      next.audit = Math.max(next.audit, entry.at)
    }
    const sites = host.store.listSites().map((s) => s.id)
    for (const tick of readCronLog(host.config, { sites, limit: 200, failedOnly: true })) {
      if (tick.at <= seen.cron) continue
      const jobs = tick.outcomes.filter((o) => o.status === 'failed').map((o) => o.path)
      out.push({ at: tick.at, kind: 'cron.failed', severity: 'warning', site: tick.site,
        title: `${tick.site}: ${jobs.length ? `${jobs.length} scheduled job${jobs.length === 1 ? '' : 's'} failed` : 'scheduled jobs did not run'}`,
        detail: tick.error ?? jobs.join('\n') })
      next.cron = Math.max(next.cron, tick.at)
    }
    // Keep the newest seen times even with nothing new, so the next read is short.
    next.audit = Math.max(next.audit, seen.audit)
    next.cron = Math.max(next.cron, seen.cron)
  }
  store.setKv('events.seen', next, now)
  return out
}
