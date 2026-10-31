// The monitor's own settings: <stateDir>/monitor.json, written by the admin API
// (Oasis's Settings > Server tab) and read by cactus-monitor at every sample, so a
// change takes effect within one sample without a restart.
//
// Anything missing or out of range falls back to the default rather than stopping
// the monitor: a bad number typed into a settings screen must never be the reason
// the server stops recording.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HostConfig } from './config.ts'
import type { AlertRule, MaintenanceWindow, MonitorSettings } from './monitor-protocol.ts'
import { writeFileAtomic } from './store.ts'

/** What each setting may be set to. The settings screen reads the same limits. */
export const SETTING_LIMITS = {
  sampleSeconds: [5, 60],
  rawHours: [6, 168],
  minuteDays: [7, 120],
  hourDays: [30, 1825],
  maxStoreMb: [256, 20_480],
  probeSeconds: [15, 300],
  visitorDays: [1, 90],
  eventDays: [30, 1825],
  repeatMinutes: [0, 1440],
} as const

export const DEFAULT_RULES: AlertRule[] = [
  { id: 'disk-warning', name: 'Disk filling up', enabled: true, severity: 'warning', type: 'metric', metric: 'disk.used_pct', label: null, op: '>', threshold: 85, forSeconds: 300 },
  { id: 'disk-critical', name: 'Disk nearly full', enabled: true, severity: 'critical', type: 'metric', metric: 'disk.used_pct', label: null, op: '>', threshold: 95, forSeconds: 60 },
  { id: 'disk-forecast', name: 'Disk full within 14 days', enabled: true, severity: 'warning', type: 'metric', metric: 'disk.days_left', label: null, op: '<', threshold: 14, forSeconds: 3600 },
  { id: 'memory-low', name: 'Memory running low', enabled: true, severity: 'warning', type: 'metric', metric: 'mem.available_pct', label: null, op: '<', threshold: 10, forSeconds: 300 },
  { id: 'cpu-high', name: 'CPU flat out', enabled: true, severity: 'warning', type: 'metric', metric: 'cpu.pct', label: null, op: '>', threshold: 90, forSeconds: 900 },
  { id: 'site-memory', name: 'Site near its memory limit', enabled: true, severity: 'warning', type: 'metric', metric: 'site.mem_pct', label: null, op: '>', threshold: 90, forSeconds: 300 },
  { id: 'site-down', name: 'Site down', enabled: true, severity: 'critical', type: 'metric', metric: 'site.down', label: null, op: '>', threshold: 0.5, forSeconds: 60 },
  { id: 'site-5xx', name: 'Site returning errors', enabled: true, severity: 'warning', type: 'metric', metric: 'site.err5xx_pct', label: null, op: '>', threshold: 2, forSeconds: 300 },
  { id: 'site-slow', name: 'Site slow', enabled: true, severity: 'warning', type: 'metric', metric: 'site.p95_ms', label: null, op: '>', threshold: 2000, forSeconds: 600 },
  { id: 'tls-expiring', name: 'Certificate running out', enabled: true, severity: 'warning', type: 'metric', metric: 'site.tls_days', label: null, op: '<', threshold: 14, forSeconds: 0 },
  { id: 'raid-degraded', name: 'RAID degraded', enabled: true, severity: 'critical', type: 'metric', metric: 'raid.degraded', label: null, op: '>', threshold: 0.5, forSeconds: 0 },
  { id: 'service-down', name: 'Server service stopped', enabled: true, severity: 'critical', type: 'metric', metric: 'svc.down', label: null, op: '>', threshold: 0.5, forSeconds: 60 },
  { id: 'pg-connections', name: 'Postgres connections nearly used up', enabled: true, severity: 'warning', type: 'metric', metric: 'pg.conn_pct', label: null, op: '>', threshold: 80, forSeconds: 120 },
  { id: 'unexpected-port', name: 'Unexpected port open', enabled: true, severity: 'warning', type: 'metric', metric: 'sec.unexpected_ports', label: null, op: '>', threshold: 0.5, forSeconds: 0 },
  { id: 'smart-failing', name: 'Disk health check failing', enabled: true, severity: 'critical', type: 'metric', metric: 'smart.failing', label: null, op: '>', threshold: 0.5, forSeconds: 0 },
  { id: 'deploy-failed', name: 'Deploy failed', enabled: true, severity: 'warning', type: 'event', kinds: ['build.failed'] },
  { id: 'cron-failed', name: 'Scheduled job failed', enabled: true, severity: 'warning', type: 'event', kinds: ['cron.failed'] },
  { id: 'backup-failed', name: 'Backup failed', enabled: true, severity: 'critical', type: 'event', kinds: ['backup.failed'] },
  { id: 'oom', name: 'Out of memory kill', enabled: true, severity: 'critical', type: 'event', kinds: ['oom'] },
  { id: 'unit-failed', name: 'Process crashed', enabled: true, severity: 'warning', type: 'event', kinds: ['unit.failed'] },
  { id: 'reboot', name: 'Server restarted', enabled: true, severity: 'warning', type: 'event', kinds: ['server.reboot'] },
]

export const DEFAULT_SETTINGS: MonitorSettings = {
  sampleSeconds: 10,
  rawHours: 48,
  minuteDays: 35,
  hourDays: 730,
  maxStoreMb: 2048,
  probeSeconds: 30,
  visitorDays: 30,
  eventDays: 730,
  alerts: { emails: [], repeatMinutes: 60, sendResolved: true, muteWhileDeploying: true },
  heartbeatUrl: null,
  expectedPorts: [22, 80, 443],
  rules: DEFAULT_RULES,
  maintenance: [],
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RULE_ID = /^[a-z0-9][a-z0-9-]{0,40}$/

type Json = Record<string, unknown>

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function int(v: unknown, [min, max]: readonly [number, number], fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback
}

function cleanRule(raw: unknown): AlertRule | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || !RULE_ID.test(raw.id)) return null
  const base = {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : raw.id,
    enabled: raw.enabled !== false,
    severity: raw.severity === 'critical' ? 'critical' as const : 'warning' as const,
  }
  if (raw.type === 'event') {
    const kinds = Array.isArray(raw.kinds) ? raw.kinds.filter((k): k is string => typeof k === 'string' && /^[a-z0-9.-]+$/.test(k)) : []
    return kinds.length ? { ...base, type: 'event', kinds } : null
  }
  if (typeof raw.metric !== 'string' || !/^[a-z0-9_.]+$/.test(raw.metric)) return null
  if (typeof raw.threshold !== 'number' || !Number.isFinite(raw.threshold)) return null
  return {
    ...base,
    type: 'metric',
    metric: raw.metric,
    label: typeof raw.label === 'string' && raw.label ? raw.label : null,
    op: raw.op === '<' ? '<' : '>',
    threshold: raw.threshold,
    forSeconds: int(raw.forSeconds, [0, 86_400], 0),
  }
}

function cleanWindow(raw: unknown): MaintenanceWindow | null {
  if (!isObject(raw) || typeof raw.from !== 'number' || typeof raw.to !== 'number' || raw.to <= raw.from) return null
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 40) : `w${raw.from}`,
    site: typeof raw.site === 'string' && raw.site ? raw.site : null,
    from: raw.from,
    to: raw.to,
    note: typeof raw.note === 'string' ? raw.note.slice(0, 200) : '',
  }
}

/** Settings from untrusted JSON (the file, or a PUT body), every field checked. */
export function cleanSettings(raw: unknown): MonitorSettings {
  const d = DEFAULT_SETTINGS
  const s = isObject(raw) ? raw : {}
  const alerts = isObject(s.alerts) ? s.alerts : {}
  const L = SETTING_LIMITS
  const heartbeat = typeof s.heartbeatUrl === 'string' && /^https:\/\/[^\s]+$/.test(s.heartbeatUrl.trim()) ? s.heartbeatUrl.trim() : null
  const rules = Array.isArray(s.rules) ? s.rules.map(cleanRule).filter((r): r is AlertRule => r !== null) : d.rules
  const minuteDays = int(s.minuteDays, L.minuteDays, d.minuteDays)
  return {
    sampleSeconds: int(s.sampleSeconds, L.sampleSeconds, d.sampleSeconds),
    rawHours: int(s.rawHours, L.rawHours, d.rawHours),
    minuteDays,
    // Hourly history that ends before the per-minute history would leave a hole.
    hourDays: Math.max(minuteDays, int(s.hourDays, L.hourDays, d.hourDays)),
    maxStoreMb: int(s.maxStoreMb, L.maxStoreMb, d.maxStoreMb),
    probeSeconds: int(s.probeSeconds, L.probeSeconds, d.probeSeconds),
    visitorDays: int(s.visitorDays, L.visitorDays, d.visitorDays),
    eventDays: int(s.eventDays, L.eventDays, d.eventDays),
    alerts: {
      emails: Array.isArray(alerts.emails)
        ? [...new Set(alerts.emails.filter((e): e is string => typeof e === 'string').map((e) => e.trim().toLowerCase()).filter((e) => EMAIL.test(e)))].slice(0, 10)
        : d.alerts.emails,
      repeatMinutes: int(alerts.repeatMinutes, L.repeatMinutes, d.alerts.repeatMinutes),
      sendResolved: typeof alerts.sendResolved === 'boolean' ? alerts.sendResolved : d.alerts.sendResolved,
      muteWhileDeploying: typeof alerts.muteWhileDeploying === 'boolean' ? alerts.muteWhileDeploying : d.alerts.muteWhileDeploying,
    },
    heartbeatUrl: heartbeat,
    expectedPorts: Array.isArray(s.expectedPorts)
      ? [...new Set(s.expectedPorts.filter((p): p is number => Number.isInteger(p) && (p as number) > 0 && (p as number) < 65536))].sort((a, b) => a - b)
      : d.expectedPorts,
    rules: [...new Map(rules.map((r) => [r.id, r])).values()],
    maintenance: Array.isArray(s.maintenance) ? s.maintenance.map(cleanWindow).filter((w): w is MaintenanceWindow => w !== null).slice(0, 50) : [],
  }
}

export function monitorDir(config: HostConfig): string {
  return join(config.stateDir, 'monitor')
}

function settingsPath(config: HostConfig): string {
  return join(monitorDir(config), 'settings.json')
}

export function readSettings(config: HostConfig): MonitorSettings {
  try {
    return cleanSettings(JSON.parse(readFileSync(settingsPath(config), 'utf8')) as unknown)
  } catch {
    return cleanSettings({})
  }
}

export function writeSettings(config: HostConfig, raw: unknown): MonitorSettings {
  const settings = cleanSettings(raw)
  writeFileAtomic(settingsPath(config), JSON.stringify(settings, null, 2) + '\n')
  return settings
}
