// Alerts: rules checked by cactus-monitor at every sample, so they work with no
// browser open anywhere.
//
// A metric rule fires once its series has been past the threshold for the rule's
// `forSeconds`, and resolves on the first sample back inside it. An event rule
// fires once per matching event and stays until somebody acknowledges it (or six
// hours pass).
//
// Sending is not done here. Each notification goes into an outbox table, and the
// Oasis site collects it once a minute and emails it through its own mailer -
// cactus-host has no mail of its own and should not grow one. If the Oasis site is
// down, the outside heartbeat is what notices.

import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import { splitKey } from './metrics-store.ts'
import type { AlertNotification, AlertRule, MonitorAlert, MonitorEvent, MonitorSettings } from './monitor-protocol.ts'

type AlertRow = {
  id: number
  rule_id: string
  label: string | null
  site: string | null
  title: string
  severity: string
  state: string
  started_at: number
  acknowledged_at: number | null
  acknowledged_by: string | null
  resolved_at: number | null
  snoozed_until: number | null
  value: number | null
  last_notified_at: number | null
  muted: number
  detail: string | null
}

function toAlert(r: AlertRow): MonitorAlert {
  return {
    id: r.id,
    ruleId: r.rule_id,
    label: r.label,
    site: r.site,
    title: r.title,
    severity: r.severity === 'critical' ? 'critical' : 'warning',
    state: r.state === 'acknowledged' ? 'acknowledged' : r.state === 'resolved' ? 'resolved' : 'firing',
    startedAt: r.started_at,
    acknowledgedAt: r.acknowledged_at,
    acknowledgedBy: r.acknowledged_by,
    resolvedAt: r.resolved_at,
    snoozedUntil: r.snoozed_until,
    value: r.value,
    muted: r.muted === 1,
    detail: r.detail,
  }
}

/** A value as a person would say it, by what the series measures. */
export function formatValue(metric: string, v: number): string {
  if (metric.endsWith('_pct') || metric === 'cpu.pct') return `${v.toFixed(1)}%`
  if (metric.endsWith('_ms')) return v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`
  if (metric.endsWith('days_left') || metric.endsWith('tls_days')) return `${Math.max(0, Math.floor(v))} days`
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

const EVENT_ALERT_HOURS = 6

export type AlertContext = {
  now: number
  settings: MonitorSettings
  /** Sites with a build running right now. */
  deploying: Set<string>
  /** A display name for a site id. */
  siteName: (id: string) => string
  /** What a metric alert is about in plain words (which port, which service), when the rule's value alone does not say. */
  describe?: (metric: string, label: string | null) => string | null
}

const OPS = { '>': 'above', '<': 'below' } as const

/** The rule in words, with the value that tripped it. */
function ruleDetail(rule: Extract<AlertRule, { type: 'metric' }>, value: number, extra: string | null): string {
  const limit = rule.metric.endsWith('_pct') ? `${rule.threshold}%` : formatValue(rule.metric, rule.threshold)
  const lasted = rule.forSeconds >= 60 ? ` for ${Math.round(rule.forSeconds / 60)} min` : rule.forSeconds > 0 ? ` for ${rule.forSeconds}s` : ''
  const rest = `${rule.name}: it read ${formatValue(rule.metric, value)}, ${OPS[rule.op]} the limit of ${limit}${lasted}.`
  return extra ? `${extra}\n${rest}` : rest
}

export class AlertEngine {
  private readonly db: DatabaseSync
  private readonly pending = new Map<string, number>()

  constructor(db: DatabaseSync) {
    this.db = db
  }

  private open(ruleId: string, label: string | null): AlertRow | undefined {
    return this.db.prepare("SELECT * FROM alerts WHERE rule_id = ? AND label IS ? AND state <> 'resolved' ORDER BY id DESC LIMIT 1")
      .get(ruleId, label) as AlertRow | undefined
  }

  private muted(site: string | null, ctx: AlertContext): boolean {
    const inWindow = ctx.settings.maintenance.some((w) => w.from <= ctx.now && ctx.now <= w.to && (w.site === null || w.site === site))
    return inWindow || Boolean(site && ctx.settings.alerts.muteWhileDeploying && ctx.deploying.has(site))
  }

  private queue(alertId: number | null, kind: AlertNotification['kind'], now: number): void {
    this.db.prepare('INSERT INTO notifications (alert_id, kind, created_at) VALUES (?, ?, ?)').run(alertId, kind, now)
    if (alertId !== null) this.db.prepare('UPDATE alerts SET last_notified_at = ? WHERE id = ?').run(now, alertId)
  }

  private fire(rule: AlertRule, label: string | null, site: string | null, title: string, value: number | null, detail: string | null, ctx: AlertContext): void {
    const muted = this.muted(site, ctx)
    const result = this.db.prepare(`INSERT INTO alerts (rule_id, label, site, title, severity, state, started_at, value, muted, detail)
      VALUES (?, ?, ?, ?, ?, 'firing', ?, ?, ?, ?)`).run(rule.id, label, site, title, rule.severity, ctx.now, value, muted ? 1 : 0, detail)
    if (!muted) this.queue(Number(result.lastInsertRowid), 'firing', ctx.now)
  }

  private resolve(row: AlertRow, ctx: AlertContext): void {
    this.db.prepare("UPDATE alerts SET state = 'resolved', resolved_at = ? WHERE id = ?").run(ctx.now, row.id)
    if (ctx.settings.alerts.sendResolved && row.last_notified_at !== null) this.queue(row.id, 'resolved', ctx.now)
  }

  /** Checks every metric rule against the newest sample. */
  evaluate(values: Map<string, number>, ctx: AlertContext): void {
    const byName = new Map<string, { key: string; label: string | null; value: number }[]>()
    for (const [key, value] of values) {
      const { name, label } = splitKey(key)
      const list = byName.get(name) ?? []
      list.push({ key, label, value })
      byName.set(name, list)
    }
    const activeRuleIds = new Set<string>()
    for (const rule of ctx.settings.rules) {
      if (!rule.enabled || rule.type !== 'metric') continue
      activeRuleIds.add(rule.id)
      const seen = new Set<string | null>()
      for (const s of byName.get(rule.metric) ?? []) {
        if (rule.label && s.label !== rule.label) continue
        seen.add(s.label)
        const pendingKey = `${rule.id}|${s.label ?? ''}`
        const breach = rule.op === '>' ? s.value > rule.threshold : s.value < rule.threshold
        const existing = this.open(rule.id, s.label)
        if (!breach) {
          this.pending.delete(pendingKey)
          if (existing) this.resolve(existing, ctx)
          continue
        }
        const since = this.pending.get(pendingKey) ?? ctx.now
        this.pending.set(pendingKey, since)
        if (existing) {
          this.db.prepare('UPDATE alerts SET value = ? WHERE id = ?').run(s.value, existing.id)
          continue
        }
        if (ctx.now - since < rule.forSeconds * 1000) continue
        const site = rule.metric.startsWith('site.') ? s.label : null
        const what = site ? ctx.siteName(site) : s.label
        this.fire(rule, s.label, site, `${rule.name}${what ? `: ${what}` : ''} (${formatValue(rule.metric, s.value)})`, s.value, ruleDetail(rule, s.value, ctx.describe?.(rule.metric, s.label) ?? null), ctx)
      }
      // A series that has gone (a site removed, a disk unmounted) cannot stay alerting.
      const stale = this.db.prepare("SELECT * FROM alerts WHERE rule_id = ? AND state <> 'resolved'").all(rule.id) as AlertRow[]
      for (const row of stale) if (!seen.has(row.label)) this.resolve(row, ctx)
    }
    // Rules switched off or deleted take their alerts with them; event alerts age out.
    const open = this.db.prepare("SELECT * FROM alerts WHERE state <> 'resolved'").all() as AlertRow[]
    const eventRules = new Set(ctx.settings.rules.filter((r) => r.enabled && r.type === 'event').map((r) => r.id))
    for (const row of open) {
      if (eventRules.has(row.rule_id)) {
        if (ctx.now - row.started_at > EVENT_ALERT_HOURS * 3_600_000) {
          this.db.prepare("UPDATE alerts SET state = 'resolved', resolved_at = ? WHERE id = ?").run(ctx.now, row.id)
        }
      } else if (!activeRuleIds.has(row.rule_id) && row.rule_id !== 'test') {
        this.resolve(row, ctx)
      }
    }
    this.remind(ctx)
  }

  /** One alert per matching event rule. */
  onEvent(event: Omit<MonitorEvent, 'id'>, ctx: AlertContext): void {
    for (const rule of ctx.settings.rules) {
      if (!rule.enabled || rule.type !== 'event' || !rule.kinds.includes(event.kind)) continue
      // Something failing over and over (a job every minute) is one alert, not one a minute.
      const open = this.open(rule.id, event.site)
      if (open) {
        this.db.prepare('UPDATE alerts SET value = COALESCE(value, 1) + 1 WHERE id = ?').run(open.id)
        continue
      }
      this.fire(rule, event.site, event.site, event.title, null, event.detail, ctx)
    }
  }

  /** Reminders for what is still firing, and the first email for anything whose mute has ended. */
  private remind(ctx: AlertContext): void {
    const repeat = ctx.settings.alerts.repeatMinutes * 60_000
    const rows = this.db.prepare("SELECT * FROM alerts WHERE state = 'firing'").all() as AlertRow[]
    for (const row of rows) {
      const muted = this.muted(row.site, ctx) || (row.snoozed_until !== null && row.snoozed_until > ctx.now)
      if (muted !== (row.muted === 1)) this.db.prepare('UPDATE alerts SET muted = ? WHERE id = ?').run(muted ? 1 : 0, row.id)
      if (muted) continue
      if (row.last_notified_at === null) this.queue(row.id, 'firing', ctx.now)
      else if (repeat > 0 && ctx.now - row.last_notified_at >= repeat) this.queue(row.id, 'reminder', ctx.now)
    }
  }
}

export function counts(db: DatabaseSync): { firing: number; critical: number; warning: number } {
  const rows = db.prepare("SELECT severity, COUNT(*) AS n FROM alerts WHERE state <> 'resolved' GROUP BY severity").all() as { severity: string; n: number }[]
  const critical = rows.find((r) => r.severity === 'critical')?.n ?? 0
  const warning = rows.find((r) => r.severity === 'warning')?.n ?? 0
  return { firing: critical + warning, critical, warning }
}

export function listAlerts(db: DatabaseSync, q: { state?: 'open' | 'resolved' | 'all'; site?: string | null; limit?: number; from?: number; to?: number }): MonitorAlert[] {
  const where: string[] = []
  const params: SQLInputValue[] = []
  if (q.state === 'open') where.push("state <> 'resolved'")
  else if (q.state === 'resolved') where.push("state = 'resolved'")
  if (q.site) {
    where.push('site = ?')
    params.push(q.site)
  }
  if (q.from !== undefined) {
    where.push('(resolved_at IS NULL OR resolved_at >= ?)')
    params.push(q.from)
  }
  if (q.to !== undefined) {
    where.push('started_at <= ?')
    params.push(q.to)
  }
  const limit = Math.max(1, Math.min(q.limit ?? 200, 2000))
  const rows = db.prepare(`SELECT * FROM alerts ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY started_at DESC LIMIT ${limit}`).all(...params) as AlertRow[]
  return rows.map(toAlert)
}

export function acknowledge(db: DatabaseSync, id: number, by: string, now: number): MonitorAlert | null {
  db.prepare("UPDATE alerts SET state = 'acknowledged', acknowledged_at = ?, acknowledged_by = ? WHERE id = ? AND state = 'firing'").run(now, by.slice(0, 120), id)
  const row = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id) as AlertRow | undefined
  return row ? toAlert(row) : null
}

export function snooze(db: DatabaseSync, id: number, minutes: number, now: number): MonitorAlert | null {
  const until = minutes > 0 ? now + Math.min(minutes, 7 * 1440) * 60_000 : null
  db.prepare('UPDATE alerts SET snoozed_until = ?, muted = ? WHERE id = ?').run(until, until ? 1 : 0, id)
  const row = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id) as AlertRow | undefined
  return row ? toAlert(row) : null
}

/** Closes an alert by hand - for an event alert somebody has dealt with. */
export function dismiss(db: DatabaseSync, id: number, now: number): MonitorAlert | null {
  db.prepare("UPDATE alerts SET state = 'resolved', resolved_at = ? WHERE id = ? AND state <> 'resolved'").run(now, id)
  const row = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id) as AlertRow | undefined
  return row ? toAlert(row) : null
}

export function queueTest(db: DatabaseSync, now: number): void {
  db.prepare("INSERT INTO notifications (alert_id, kind, created_at) VALUES (NULL, 'test', ?)").run(now)
}

/** Notifications not yet sent, oldest first. Ones older than a day are dropped rather than sent late. */
export function outbox(db: DatabaseSync, now: number): AlertNotification[] {
  db.prepare('UPDATE notifications SET sent_at = ? WHERE sent_at IS NULL AND created_at < ?').run(now, now - 86_400_000)
  const rows = db.prepare('SELECT id, alert_id, kind, created_at FROM notifications WHERE sent_at IS NULL ORDER BY id LIMIT 100')
    .all() as { id: number; alert_id: number | null; kind: AlertNotification['kind']; created_at: number }[]
  const alertById = db.prepare('SELECT * FROM alerts WHERE id = ?')
  return rows.map((n) => {
    const alert = n.alert_id !== null ? (alertById.get(n.alert_id) as AlertRow | undefined) : undefined
    return { id: n.id, kind: n.kind, createdAt: n.created_at, alert: alert ? toAlert(alert) : null }
  })
}

export function markSent(db: DatabaseSync, ids: number[], now: number): void {
  const put = db.prepare('UPDATE notifications SET sent_at = ? WHERE id = ?')
  for (const id of ids) put.run(now, id)
}
