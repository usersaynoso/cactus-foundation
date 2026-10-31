// The wire shapes of the monitoring API (/v1/admin/monitor/...), kept apart from
// protocol.ts because they are a subject of their own and the Oasis module copies
// this file whole into its lib/monitor-types.ts.
//
// History is stored as named series. A series key is `name` or `name@label`, where
// the label is a site, a mount point, a disk, a network interface, a database or a
// service - whichever the name is about. Every value is a gauge: anything the box
// counts (bytes, requests, ticks) is turned into a per-second rate before it is
// stored, so an average over any window is still a rate.

/** How the monitor runs, kept in <stateDir>/monitor/settings.json and changed from Oasis's settings. */
export type MonitorSettings = {
  /** Seconds between samples. */
  sampleSeconds: number
  /** Hours each raw sample is kept. */
  rawHours: number
  /** Days the per-minute averages are kept. */
  minuteDays: number
  /** Days the per-hour averages are kept. */
  hourDays: number
  /** The history file is trimmed, oldest raw data first, once it passes this. */
  maxStoreMb: number
  /** Seconds between uptime checks of each site. */
  probeSeconds: number
  /** Days per-visitor detail (addresses) from the access logs is kept. */
  visitorDays: number
  /** Days events are kept. */
  eventDays: number
  alerts: {
    /** Who gets alert emails. Empty means the Oasis module's own default. */
    emails: string[]
    /** Minutes between reminders while an alert is still firing and nobody has acknowledged it. 0 for none. */
    repeatMinutes: number
    /** Whether a "resolved" email is sent when an alert clears. */
    sendResolved: boolean
    /** Alerts for a site wait while it is deploying. */
    muteWhileDeploying: boolean
  }
  /** An outside check (healthchecks.io and the like) pinged once a minute, or null for none. */
  heartbeatUrl: string | null
  /** Ports that may listen on a public address. Anything else is flagged. */
  expectedPorts: number[]
  rules: AlertRule[]
  maintenance: MaintenanceWindow[]
}

export type AlertSeverity = 'warning' | 'critical'

/**
 * One alert rule. A `metric` rule fires when the newest value of a series has been
 * past the threshold for `forSeconds`; an `event` rule fires once for each new event
 * of the given kind.
 */
export type AlertRule = {
  id: string
  name: string
  enabled: boolean
  severity: AlertSeverity
} & (
  | {
      type: 'metric'
      /** A series name, e.g. `disk.used_pct`. Every label of it is checked separately. */
      metric: string
      /** Only this label (a site, a mount...), or null for every label. */
      label: string | null
      op: '>' | '<'
      threshold: number
      forSeconds: number
    }
  | {
      type: 'event'
      /** Event kinds, e.g. `build.failed`. */
      kinds: string[]
    }
)

export type MaintenanceWindow = {
  id: string
  /** A site, or null for the whole server. */
  site: string | null
  /** Epoch ms. */
  from: number
  to: number
  note: string
}

// ── Live ─────────────────────────────────────────────────────────────────────

export type MountLive = { mount: string; device: string; fsType: string; totalBytes: number; usedBytes: number; inodesPct: number; daysLeft: number | null }
export type DeviceLive = { device: string; readBps: number; writeBps: number; readIops: number; writeIops: number; utilPct: number; latencyMs: number }
export type InterfaceLive = { iface: string; rxBps: number; txBps: number; rxPps: number; txPps: number; errorsPs: number }
export type RaidLive = { name: string; level: string; devices: number; active: number; degraded: boolean; syncPct: number | null; state: string }
export type ServiceLive = { name: string; label: string; active: boolean; state: string; memBytes: number | null; cpuPct: number | null; restarts: number; since: number | null }
export type SmartLive = { device: string; healthy: boolean | null; tempC: number | null; powerOnHours: number | null; wearPct: number | null; reallocated: number | null }

export type SiteHealth = 'ok' | 'warning' | 'down' | 'idle'

export type SiteLive = {
  id: string
  name: string
  domains: string[]
  database: string | null
  liveSlot: 'a' | 'b' | null
  building: boolean
  health: SiteHealth
  cpuPct: number
  buildCpuPct: number
  memBytes: number
  memLimitBytes: number | null
  buildMemBytes: number
  readBps: number
  writeBps: number
  procs: number
  psiCpu: number
  psiMem: number
  psiIo: number
  /** Traffic the site's own processes send and receive over the network (Stripe, email APIs...), not visitors. */
  netTxBps: number
  netRxBps: number
  /** Visitor requests through Caddy. */
  reqRate: number
  err4xxRate: number
  err5xxRate: number
  err5xxPct: number
  p50Ms: number | null
  p95Ms: number | null
  bytesOutBps: number
  bytesInBps: number
  diskBytes: number | null
  /** Public uptime check: null before the first. */
  up: boolean | null
  probeMs: number | null
  directUp: boolean | null
  directMs: number | null
  tlsDays: number | null
  oomKills: number
  logErrorsPm: number
}

export type PostgresLive = {
  connections: number
  maxConnections: number
  active: number
  idleInTransaction: number
  waiting: number
  longestQuerySeconds: number
  walBps: number | null
  statementsAvailable: boolean
  databases: { name: string; sizeBytes: number; backends: number; tps: number; cacheHitPct: number | null; rowsReadPs: number; rowsWrittenPs: number; deadlocks: number; tempBps: number }[]
}

export type CollectorState = { ok: boolean; error: string | null; at: number }

export type LiveSnapshot = {
  /** Epoch ms of the sample. */
  at: number
  sampleSeconds: number
  host: { hostname: string; kernel: string; os: string; cores: number; memTotalBytes: number; uptimeSeconds: number; bootAt: number }
  server: {
    cpu: { pct: number; user: number; system: number; iowait: number; steal: number; cores: number[] }
    load: [number, number, number]
    psi: { cpu: number; mem: number; io: number; memFull: number; ioFull: number }
    mem: { totalBytes: number; usedBytes: number; cacheBytes: number; availableBytes: number; swapTotalBytes: number; swapUsedBytes: number }
    mounts: MountLive[]
    devices: DeviceLive[]
    interfaces: InterfaceLive[]
    net: { rxBps: number; txBps: number }
    tcp: { inUse: number; timeWait: number }
    filesOpen: number
    temps: { chip: string; c: number }[]
    raid: RaidLive[]
    smart: SmartLive[]
  }
  services: ServiceLive[]
  sites: SiteLive[]
  postgres: PostgresLive | null
  alerts: { firing: number; critical: number; warning: number }
  collectors: Record<string, CollectorState>
}

// ── History ──────────────────────────────────────────────────────────────────

export type SeriesInfo = { key: string; name: string; label: string | null }

/** Values aligned on `t`. A gap is null. `min` and `max` are present when a bucket covers more than one sample. */
export type SeriesQueryResult = {
  from: number
  to: number
  /** Seconds each point covers. */
  step: number
  tier: 'raw' | 'minute' | 'hour'
  t: number[]
  series: { key: string; name: string; label: string | null; avg: (number | null)[]; min: (number | null)[]; max: (number | null)[] }[]
}

export type EventSeverity = 'info' | 'warning' | 'error'

export type MonitorEvent = {
  id: number
  /** Epoch ms. */
  at: number
  kind: string
  severity: EventSeverity
  site: string | null
  title: string
  detail: string | null
}

// ── Traffic ──────────────────────────────────────────────────────────────────

export type TrafficRow = { key: string; requests: number; bytes: number; errors: number; avgMs: number; maxMs: number }

export type TrafficReport = {
  from: number
  to: number
  totals: { requests: number; bytes: number; errors4xx: number; errors5xx: number; bots: number; avgMs: number }
  paths: TrafficRow[]
  slowPaths: TrafficRow[]
  errorPaths: TrafficRow[]
  countries: TrafficRow[]
  visitors: TrafficRow[]
  agents: TrafficRow[]
  status: TrafficRow[]
}

// ── Postgres detail ──────────────────────────────────────────────────────────

export type PgActivity = { pid: number; database: string | null; user: string | null; state: string | null; wait: string | null; seconds: number | null; query: string }

export type PgStatement = { database: string; queryId: string; query: string; calls: number; totalMs: number; meanMs: number; rows: number }

export type PostgresReport = {
  live: PostgresLive | null
  activity: PgActivity[]
  statements: PgStatement[]
  /** False until pg_stat_statements is loaded (RUNBOOK section 14). */
  statementsAvailable: boolean
}

// ── Logs ─────────────────────────────────────────────────────────────────────

export type LogSource = 'site' | 'access' | 'caddy' | 'postgres' | 'cactus' | 'security' | 'system'

export type LogLevel = 'error' | 'warning' | 'info' | 'debug'

export type LogLine = { at: number; source: LogSource; unit: string | null; site: string | null; level: LogLevel; message: string; cursor: string | null }

export type LogQueryResult = { lines: LogLine[]; more: boolean }

// ── Alerts ───────────────────────────────────────────────────────────────────

export type AlertState = 'firing' | 'acknowledged' | 'resolved'

export type MonitorAlert = {
  id: number
  ruleId: string
  /** The site, mount, service... it is about, or null. */
  label: string | null
  site: string | null
  title: string
  severity: AlertSeverity
  state: AlertState
  startedAt: number
  acknowledgedAt: number | null
  acknowledgedBy: string | null
  resolvedAt: number | null
  snoozedUntil: number | null
  value: number | null
  muted: boolean
}

export type AlertNotification = {
  id: number
  kind: 'firing' | 'reminder' | 'resolved' | 'test'
  createdAt: number
  alert: MonitorAlert | null
}

// ── Security, capacity, usage ────────────────────────────────────────────────

export type ListeningPort = { proto: string; address: string; port: number; process: string | null; expected: boolean }

export type SecurityReport = {
  at: number | null
  updates: { total: number; security: number } | null
  rebootRequired: boolean
  rebootPackages: string[]
  fail2ban: { jail: string; banned: number; totalBanned: number; failed: number } [] | null
  ports: ListeningPort[]
  ssh: { passwordAuth: boolean | null; rootLogin: string | null } | null
  recentLogins: MonitorEvent[]
  firewall: { active: boolean | null }
}

export type Forecast = { label: string; kind: 'disk' | 'database' | 'site'; usedBytes: number; totalBytes: number | null; growthBytesPerDay: number; daysLeft: number | null }

export type CapacityReport = {
  forecasts: Forecast[]
  growth: { site: string; bytesNow: number; bytes30DaysAgo: number | null; growthBytes: number }[]
  memory: { totalBytes: number; sumOfSiteLimits: number; sumOfSiteUse: number; buildLimitBytes: number }
}

export type SiteUsage = {
  site: string
  name: string
  requests: number
  bytesOut: number
  bytesIn: number
  cpuHours: number
  buildCpuHours: number
  avgMemBytes: number
  peakMemBytes: number
  diskBytes: number | null
  databaseBytes: number | null
  uptimePct: number | null
  p95Ms: number | null
  errors5xx: number
  deploys: number
  failedDeploys: number
  incidents: number
}

export type UsageReport = {
  /** YYYY-MM. */
  month: string
  from: number
  to: number
  sites: SiteUsage[]
  server: { avgCpuPct: number; peakCpuPct: number; avgMemPct: number; netOutBytes: number; netInBytes: number; uptimePct: number | null }
}
