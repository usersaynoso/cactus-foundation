// cactus-monitor: the service that watches the box (`cactus-host monitor`,
// ops/cactus-monitor.service).
//
// A process of its own rather than part of cactus-host's: a leak or a crash in
// monitoring can never stop a deploy, and history keeps recording while
// cactus-host restarts for an update. It shares cactus-host's code, config and
// records, and writes only its own folder, <stateDir>/monitor:
//   metrics.db   history, events, alerts, traffic (metrics-store.ts)
//   live.json    the newest sample, rewritten every sample, for the live screen
//   settings.json   written by the admin API, read here every sample
//
// Each sample (every `sampleSeconds`, 10 by default) reads /proc, /sys and each
// site's cgroups, and the access logs since last time. Slower things run on their
// own clocks inside the same loop: services and Postgres every 30 s, uptime checks
// every `probeSeconds`, security every 5 minutes, disk usage per site every 15,
// disk health and forecasts hourly. Nothing slow is awaited by the sample itself.

import { connect as tlsConnect } from 'node:tls'
import { cpus, hostname, release } from 'node:os'
import { join } from 'node:path'
import type { Host } from './host.ts'
import { AlertEngine, counts as alertCounts, type AlertContext } from './monitor-alerts.ts'
import { classifyJournal, hostHistoryEvents, insertEvent, JournalFollower, type NewEvent } from './monitor-events.ts'
import { NetAccounting } from './monitor-netacct.ts'
import { PostgresCollector } from './monitor-postgres.ts'
import {
  addCgroups, cpuPercent, parseDiskstats, parseLoadavg, parseMdstat, parseMeminfo, parseMounts, parseNetDev,
  parsePressure, parseProcStat, parseSockstat, parseSystemctlShow, readCgroup, readTemps, realProc, siteSlice,
  type CgroupReading, type DiskCounters, type NetCounters, type Proc, type ProcStat,
} from './monitor-proc.ts'
import type { CollectorState, ListeningPort, LiveSnapshot, MonitorSettings, PgActivity, ServiceLive, SiteHealth, SiteLive, SmartLive } from './monitor-protocol.ts'
import { SecurityCollector } from './monitor-security.ts'
import { monitorDir, readSettings } from './monitor-settings.ts'
import { AccessLogTailer, TrafficAggregator, type SiteTrafficSample } from './monitor-traffic.ts'
import { MetricsStore } from './metrics-store.ts'
import { ACCESS_LOG_DIR } from './caddy.ts'
import { siteDatabase } from './create.ts'
import { writeFileAtomic } from './store.ts'

export const CGROUP_ROOT = '/sys/fs/cgroup'

export function metricsDbPath(stateDir: string): string {
  return join(stateDir, 'monitor', 'metrics.db')
}

export function livePath(stateDir: string): string {
  return join(stateDir, 'monitor', 'live.json')
}

/** The units shown on the Server view. `critical` ones alert when they stop. */
const SERVICES: { id: string; label: string; critical: boolean }[] = [
  { id: 'caddy.service', label: 'Caddy (web server)', critical: true },
  { id: 'cactus-host.service', label: 'cactus-host', critical: true },
  { id: 'cactus-monitor.service', label: 'cactus-monitor', critical: false },
  { id: 'ssh.service', label: 'SSH', critical: true },
  { id: 'fail2ban.service', label: 'fail2ban', critical: true },
  { id: 'ufw.service', label: 'Firewall (ufw)', critical: false },
  { id: 'cron.service', label: 'cron', critical: false },
  { id: 'unattended-upgrades.service', label: 'Automatic updates', critical: false },
  { id: 'cockpit.socket', label: 'Cockpit', critical: false },
  { id: 'cactus-postgres-backup.timer', label: 'Nightly database backup', critical: false },
]

type SitePrev = { slots: CgroupReading | null; builds: CgroupReading | null }

type ProbeResult = { up: boolean | null; ms: number | null; directUp: boolean | null; directMs: number | null; tlsDays: number | null; at: number }

function every(last: number, now: number, ms: number): boolean {
  return now - last >= ms
}

function memLimitBytes(value: string): number | null {
  const m = /^(\d+(?:\.\d+)?)([KMGT]?)$/i.exec(value.trim())
  if (!m) return null
  const mult: Record<string, number> = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 }
  return Math.round(Number(m[1]) * (mult[(m[2] as string).toUpperCase()] ?? 1))
}

export class Monitor {
  readonly host: Host
  readonly store: MetricsStore
  private readonly proc: Proc
  private readonly cgroupRoot: string
  private readonly tailer: AccessLogTailer
  private readonly traffic = new TrafficAggregator()
  private readonly pg: PostgresCollector
  private readonly netacct: NetAccounting
  private readonly security: SecurityCollector
  private readonly alerts: AlertEngine
  private journal: JournalFollower | null = null
  private timer: NodeJS.Timeout | null = null
  private stopped = false

  private prev: { at: number; stat: ProcStat; disks: Map<string, DiskCounters>; net: Map<string, NetCounters>; sites: Map<string, SitePrev> } | null = null
  private readonly counters = new Map<string, number>()
  private readonly eventBudget = new Map<string, { minute: number; n: number }>()
  private readonly collectors: Record<string, CollectorState> = {}
  private readonly clocks: Record<string, number> = {}
  private services: ServiceLive[] = []
  private servicePrev = new Map<string, number>()
  private pgLive: LiveSnapshot['postgres'] = null
  private probes = new Map<string, ProbeResult>()
  private tlsDays = new Map<string, number | null>()
  private du = new Map<string, { total: number; releases: number; static: number; home: number }>()
  private smart: SmartLive[] = []
  private forecasts = new Map<string, number>()
  private netSites = new Map<string, { txBps: number; rxBps: number }>()
  private postgresUnit: string | null = null
  private busy = new Set<string>()

  constructor(host: Host, opts: { proc?: Proc; cgroupRoot?: string; accessLogDir?: string; storePath?: string } = {}) {
    this.host = host
    this.proc = opts.proc ?? realProc
    this.cgroupRoot = opts.cgroupRoot ?? CGROUP_ROOT
    this.store = new MetricsStore(opts.storePath ?? metricsDbPath(host.config.stateDir))
    this.tailer = new AccessLogTailer(opts.accessLogDir ?? ACCESS_LOG_DIR)
    this.pg = new PostgresCollector(host.config, host.system)
    this.netacct = new NetAccounting(host.system)
    this.security = new SecurityCollector(host.system, this.proc)
    this.alerts = new AlertEngine(this.store.db)
  }

  start(): void {
    this.noteReboot()
    this.journal = new JournalFollower((entry) => {
      const c = classifyJournal(entry)
      if (!c) return
      if (c.counter) {
        const key = c.counter.site ? `${c.counter.name}@${c.counter.site}` : c.counter.name
        this.counters.set(key, (this.counters.get(key) ?? 0) + 1)
      }
      if (c.event) this.recordEvent(c.event)
    })
    this.journal.start()
    const loop = async () => {
      if (this.stopped) return
      const settings = readSettings(this.host.config)
      try {
        await this.tick(settings)
      } catch (err) {
        console.error(`[cactus-monitor] sample failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`)
      }
      if (this.stopped) return
      const period = settings.sampleSeconds * 1000
      // Lined up on the clock, so samples land on round seconds and chunks line up.
      this.timer = setTimeout(() => void loop(), period - (Date.now() % period))
    }
    void loop()
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.journal?.stop()
    this.store.close()
  }

  private now(): number {
    return this.host.system.now()
  }

  private ok(name: string, now: number): void {
    this.collectors[name] = { ok: true, error: null, at: now }
  }

  private failed(name: string, err: unknown, now: number): void {
    const message = err instanceof Error ? err.message : String(err)
    const before = this.collectors[name]
    if (!before || before.ok || before.error !== message) console.error(`[cactus-monitor] ${name}: ${message}`)
    this.collectors[name] = { ok: false, error: message, at: now }
  }

  /** Runs `work` in the background unless the last one is still going; the sample never waits for it. */
  private background(name: string, work: () => Promise<void>): void {
    if (this.busy.has(name)) return
    this.busy.add(name)
    const now = this.now()
    work()
      .then(() => this.ok(name, now))
      .catch((err: unknown) => this.failed(name, err, now))
      .finally(() => this.busy.delete(name))
  }

  private due(name: string, now: number, ms: number): boolean {
    if (!every(this.clocks[name] ?? 0, now, ms)) return false
    this.clocks[name] = now
    return true
  }

  private recordEvent(e: NewEvent): void {
    // A crash loop must not write ten thousand events: thirty of a kind a minute is plenty to see it.
    const minute = Math.floor(e.at / 60_000)
    const budget = this.eventBudget.get(e.kind)
    if (budget && budget.minute === minute && budget.n >= 30) return
    this.eventBudget.set(e.kind, { minute, n: budget && budget.minute === minute ? budget.n + 1 : 1 })
    try {
      insertEvent(this.store.db, e)
      this.alerts.onEvent(e, this.alertContext(readSettings(this.host.config), this.now()))
    } catch (err) {
      console.error(`[cactus-monitor] could not record an event: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private alertContext(settings: MonitorSettings, now: number): AlertContext {
    const deploying = new Set<string>()
    const names = new Map<string, string>()
    for (const site of this.host.store.listSites()) {
      names.set(site.id, site.name)
      const latest = this.host.store.listBuilds(site.id)[0]
      if (latest && (latest.state === 'queued' || latest.state === 'building')) deploying.add(site.id)
    }
    return { now, settings, deploying, siteName: (id) => names.get(id) ?? id, describe: (metric, label) => this.describeMetric(metric, label) }
  }

  /** Which port, which service: the part of a metric alert that its number cannot say. */
  private describeMetric(metric: string, label: string | null): string | null {
    if (metric === 'sec.unexpected_ports') {
      const ports = this.store.getKv<{ ports: ListeningPort[] }>('security')?.value.ports.filter((p) => !p.expected) ?? []
      if (!ports.length) return null
      const byPort = new Map<string, ListeningPort[]>()
      for (const p of ports) byPort.set(`${p.proto} ${p.port}`, [...(byPort.get(`${p.proto} ${p.port}`) ?? []), p])
      return [...byPort.values()].map((list) => {
        const p = list[0] as ListeningPort
        return `Port ${p.port}/${p.proto.replace(/\d$/, '')} is open to the internet, opened by ${p.process ?? 'a process we could not identify'}, listening on ${list.map((l) => l.address).join(' and ')}. If it should be open, add ${p.port} to the expected ports in Settings > Server.`
      }).join('\n')
    }
    if (metric === 'svc.down' && label) return `The ${label} service is not running.`
    return null
  }

  private noteReboot(): void {
    const bootId = (this.proc.read('/proc/sys/kernel/random/boot_id') ?? '').trim()
    if (!bootId) return
    const known = this.store.getKv<string>('boot_id')
    if (known && known.value !== bootId) {
      const uptime = Number((this.proc.read('/proc/uptime') ?? '0').split(' ')[0])
      this.recordEvent({ at: this.now() - uptime * 1000, kind: 'server.reboot', severity: 'warning', site: null, title: 'The server restarted', detail: null })
    }
    this.store.setKv('boot_id', bootId, this.now())
  }

  /** One sample. Public so the tests can drive it. */
  async tick(settings: MonitorSettings): Promise<LiveSnapshot> {
    const now = this.now()
    const values = new Map<string, number>()
    const prev = this.prev
    const secs = prev ? Math.max(0.5, (now - prev.at) / 1000) : settings.sampleSeconds
    const sites = this.host.store.listSites()

    // ── Server ──
    const stat = parseProcStat(this.proc.read('/proc/stat') ?? '')
    const cpu = prev ? cpuPercent(prev.stat.total, stat.total) : { pct: 0, user: 0, system: 0, iowait: 0, steal: 0 }
    const coreUse = stat.cores.map((c, i) => (prev?.stat.cores[i] ? cpuPercent(prev.stat.cores[i] as typeof c, c).pct : 0))
    values.set('cpu.pct', cpu.pct)
    values.set('cpu.user', cpu.user)
    values.set('cpu.system', cpu.system)
    values.set('cpu.iowait', cpu.iowait)
    values.set('cpu.steal', cpu.steal)
    coreUse.forEach((pct, i) => values.set(`cpu.core_pct@${i}`, pct))

    const load = parseLoadavg(this.proc.read('/proc/loadavg') ?? '0 0 0')
    const cores = stat.cores.length || cpus().length || 1
    values.set('load.1', load[0])
    values.set('load.5', load[1])
    values.set('load.15', load[2])
    values.set('load.per_core', load[0] / cores)

    const psi = {
      cpu: parsePressure(this.proc.read('/proc/pressure/cpu')),
      mem: parsePressure(this.proc.read('/proc/pressure/memory')),
      io: parsePressure(this.proc.read('/proc/pressure/io')),
    }
    values.set('psi.cpu', psi.cpu.some)
    values.set('psi.mem', psi.mem.some)
    values.set('psi.io', psi.io.some)
    values.set('psi.mem_full', psi.mem.full)
    values.set('psi.io_full', psi.io.full)

    const mi = parseMeminfo(this.proc.read('/proc/meminfo') ?? '')
    const mem = {
      totalBytes: mi.MemTotal ?? 0,
      availableBytes: mi.MemAvailable ?? 0,
      cacheBytes: (mi.Cached ?? 0) + (mi.Buffers ?? 0) + (mi.SReclaimable ?? 0),
      usedBytes: Math.max(0, (mi.MemTotal ?? 0) - (mi.MemAvailable ?? 0)),
      swapTotalBytes: mi.SwapTotal ?? 0,
      swapUsedBytes: Math.max(0, (mi.SwapTotal ?? 0) - (mi.SwapFree ?? 0)),
    }
    values.set('mem.total_bytes', mem.totalBytes)
    values.set('mem.used_bytes', mem.usedBytes)
    values.set('mem.cache_bytes', mem.cacheBytes)
    values.set('mem.available_bytes', mem.availableBytes)
    values.set('mem.available_pct', mem.totalBytes ? (mem.availableBytes / mem.totalBytes) * 100 : 0)
    values.set('mem.used_pct', mem.totalBytes ? (mem.usedBytes / mem.totalBytes) * 100 : 0)
    values.set('swap.used_bytes', mem.swapUsedBytes)
    values.set('swap.used_pct', mem.swapTotalBytes ? (mem.swapUsedBytes / mem.swapTotalBytes) * 100 : 0)

    const mounts = parseMounts(this.proc.read('/proc/mounts') ?? '').map((m) => {
      const fs = this.proc.statfs(m.mount)
      const used = fs ? fs.totalBytes - fs.freeBytes : 0
      const usable = fs ? used + fs.availBytes : 0
      const inodesPct = fs && fs.files ? ((fs.files - fs.filesFree) / fs.files) * 100 : 0
      if (fs) {
        values.set(`disk.used_bytes@${m.mount}`, used)
        values.set(`disk.total_bytes@${m.mount}`, usable)
        values.set(`disk.used_pct@${m.mount}`, usable ? (used / usable) * 100 : 0)
        values.set(`disk.inodes_pct@${m.mount}`, inodesPct)
      }
      const daysLeft = this.forecasts.get(m.mount) ?? null
      if (daysLeft !== null) values.set(`disk.days_left@${m.mount}`, daysLeft)
      return { mount: m.mount, device: m.device, fsType: m.fsType, totalBytes: usable, usedBytes: used, inodesPct, daysLeft }
    })

    const whole = new Set(this.proc.list('/sys/block'))
    const disks = parseDiskstats(this.proc.read('/proc/diskstats') ?? '', whole)
    const devices = [...disks].map(([device, d]) => {
      const p = prev?.disks.get(device)
      const delta = (a: number, b: number | undefined) => (b !== undefined && a >= b ? a - b : 0)
      const reads = delta(d.reads, p?.reads)
      const writes = delta(d.writes, p?.writes)
      const ios = reads + writes
      const row = {
        device,
        readBps: (delta(d.readSectors, p?.readSectors) * 512) / secs,
        writeBps: (delta(d.writeSectors, p?.writeSectors) * 512) / secs,
        readIops: reads / secs,
        writeIops: writes / secs,
        utilPct: Math.min(100, (delta(d.ioMs, p?.ioMs) / (secs * 1000)) * 100),
        latencyMs: ios ? (delta(d.readMs, p?.readMs) + delta(d.writeMs, p?.writeMs)) / ios : 0,
      }
      values.set(`disk.read_bps@${device}`, row.readBps)
      values.set(`disk.write_bps@${device}`, row.writeBps)
      values.set(`disk.read_iops@${device}`, row.readIops)
      values.set(`disk.write_iops@${device}`, row.writeIops)
      values.set(`disk.util_pct@${device}`, row.utilPct)
      values.set(`disk.latency_ms@${device}`, row.latencyMs)
      return row
    })

    const net = parseNetDev(this.proc.read('/proc/net/dev') ?? '')
    let rxTotal = 0
    let txTotal = 0
    const interfaces = [...net].map(([iface, n]) => {
      const p = prev?.net.get(iface)
      const delta = (a: number, b: number | undefined) => (b !== undefined && a >= b ? a - b : 0)
      const row = {
        iface,
        rxBps: delta(n.rxBytes, p?.rxBytes) / secs,
        txBps: delta(n.txBytes, p?.txBytes) / secs,
        rxPps: delta(n.rxPackets, p?.rxPackets) / secs,
        txPps: delta(n.txPackets, p?.txPackets) / secs,
        errorsPs: (delta(n.rxErrors + n.rxDrop + n.txErrors + n.txDrop, p ? p.rxErrors + p.rxDrop + p.txErrors + p.txDrop : undefined)) / secs,
      }
      rxTotal += row.rxBps
      txTotal += row.txBps
      values.set(`net.rx_bps@${iface}`, row.rxBps)
      values.set(`net.tx_bps@${iface}`, row.txBps)
      values.set(`net.rx_pps@${iface}`, row.rxPps)
      values.set(`net.tx_pps@${iface}`, row.txPps)
      values.set(`net.errors_ps@${iface}`, row.errorsPs)
      return row
    })
    values.set('net.rx_bps', rxTotal)
    values.set('net.tx_bps', txTotal)

    const tcp = parseSockstat(this.proc.read('/proc/net/sockstat'))
    values.set('tcp.inuse', tcp.inUse)
    values.set('tcp.timewait', tcp.timeWait)
    const filesOpen = Number((this.proc.read('/proc/sys/fs/file-nr') ?? '0').trim().split(/\s+/)[0]) || 0
    values.set('files.open', filesOpen)
    const temps = readTemps(this.proc)
    for (const t of temps) values.set(`temp.c@${t.chip}`, t.c)
    const raid = parseMdstat(this.proc.read('/proc/mdstat'))
    for (const r of raid) {
      values.set(`raid.degraded@${r.name}`, r.degraded ? 1 : 0)
      if (r.syncPct !== null) values.set(`raid.sync_pct@${r.name}`, r.syncPct)
    }
    const uptime = Number((this.proc.read('/proc/uptime') ?? '0').split(' ')[0]) || 0
    values.set('uptime.s', uptime)
    const bootAt = now - uptime * 1000

    // ── Traffic ──
    const records = this.tailer.poll()
    this.traffic.add(records)
    const trafficBySite = this.traffic.drain(secs, sites.map((s) => s.id))
    try {
      this.traffic.flush(this.store.db, now)
      this.ok('access-logs', now)
    } catch (err) {
      this.failed('access-logs', err, now)
    }

    // ── Sites ──
    const sitePrev = new Map<string, SitePrev>()
    const siteRows: SiteLive[] = []
    const defaultLimit = memLimitBytes(this.host.config.site.memoryMax)
    for (const site of sites) {
      // A site refreshed since its last deploy has its builds in its own slice and its
      // running copy still in system.slice, until the next deploy moves it. So each unit is
      // looked for in both, slice first.
      const homes = [join(this.cgroupRoot, 'cactus.slice', siteSlice(site.id)), join(this.cgroupRoot, 'system.slice')]
      const unit = (name: string) => homes.map((h) => readCgroup(this.proc, `${h}/${name}`)).find((r) => r !== null) ?? null
      const slotA = unit(`cactus-${site.id}-a.service`)
      const slotB = unit(`cactus-${site.id}-b.service`)
      const slots = addCgroups(slotA, slotB)
      let builds: CgroupReading | null = null
      const prefix = `cactus-build-${site.id}-`
      for (const home of homes) {
        for (const name of this.proc.list(home)) {
          if (!name.startsWith(prefix) || !/^[a-z0-9]+\.service$/.test(name.slice(prefix.length))) continue
          builds = addCgroups(builds, readCgroup(this.proc, `${home}/${name}`))
        }
      }
      sitePrev.set(site.id, { slots, builds })
      const p = prev?.sites.get(site.id)
      const rate = (a: number | undefined, b: number | undefined) => (a !== undefined && b !== undefined && a >= b ? (a - b) / secs : 0)
      const cpuPct = rate(slots?.cpuUsec, p?.slots?.cpuUsec) / 10_000
      const buildCpuPct = rate(builds?.cpuUsec, p?.builds?.cpuUsec) / 10_000
      const live = site.liveSlot === 'a' ? slotA : site.liveSlot === 'b' ? slotB : null
      const limit = live?.memMax ?? defaultLimit
      const oomKills = slots && p?.slots && slots.oomKills > p.slots.oomKills ? slots.oomKills - p.slots.oomKills : 0
      const t: SiteTrafficSample | undefined = trafficBySite.get(site.id)
      const probe = this.probes.get(site.id)
      const du = this.du.get(site.id)
      const latest = this.host.store.listBuilds(site.id)[0]
      const building = Boolean(latest && (latest.state === 'queued' || latest.state === 'building'))
      const netUse = this.netSites.get(site.id)
      const memBytes = slots?.memBytes ?? 0
      const memPct = limit ? (memBytes / limit) * 100 : 0
      const logErrors = this.counters.get(`site.log_errors@${site.id}`) ?? 0

      const row: SiteLive = {
        id: site.id,
        name: site.name,
        domains: site.domains,
        database: siteDatabase(this.host, site),
        liveSlot: site.liveSlot,
        building,
        health: 'ok',
        cpuPct,
        buildCpuPct,
        memBytes,
        memLimitBytes: limit,
        buildMemBytes: builds?.memBytes ?? 0,
        readBps: rate(slots?.readBytes, p?.slots?.readBytes),
        writeBps: rate(slots?.writeBytes, p?.slots?.writeBytes),
        procs: slots?.procs ?? 0,
        psiCpu: slots?.psiCpu ?? 0,
        psiMem: slots?.psiMem ?? 0,
        psiIo: slots?.psiIo ?? 0,
        netTxBps: netUse?.txBps ?? 0,
        netRxBps: netUse?.rxBps ?? 0,
        reqRate: t?.reqRate ?? 0,
        err4xxRate: t?.err4xxRate ?? 0,
        err5xxRate: t?.err5xxRate ?? 0,
        err5xxPct: t?.err5xxPct ?? 0,
        p50Ms: t?.p50Ms ?? null,
        p95Ms: t?.p95Ms ?? null,
        bytesOutBps: t?.bytesOutBps ?? 0,
        bytesInBps: t?.bytesInBps ?? 0,
        diskBytes: du?.total ?? null,
        up: probe?.up ?? null,
        probeMs: probe?.ms ?? null,
        directUp: probe?.directUp ?? null,
        directMs: probe?.directMs ?? null,
        tlsDays: this.tlsDays.get(site.id) ?? null,
        oomKills,
        logErrorsPm: (logErrors * 60) / secs,
      }
      row.health = siteHealth(row, memPct)
      siteRows.push(row)

      const L = site.id
      values.set(`site.cpu_pct@${L}`, cpuPct)
      values.set(`site.build_cpu_pct@${L}`, buildCpuPct)
      values.set(`site.mem_bytes@${L}`, memBytes)
      if (limit) values.set(`site.mem_pct@${L}`, memPct)
      values.set(`site.build_mem_bytes@${L}`, row.buildMemBytes)
      values.set(`site.read_bps@${L}`, row.readBps)
      values.set(`site.write_bps@${L}`, row.writeBps)
      values.set(`site.procs@${L}`, row.procs)
      values.set(`site.psi_cpu@${L}`, row.psiCpu)
      values.set(`site.psi_mem@${L}`, row.psiMem)
      values.set(`site.psi_io@${L}`, row.psiIo)
      values.set(`site.oom_kills@${L}`, oomKills)
      values.set(`site.net_tx_bps@${L}`, row.netTxBps)
      values.set(`site.net_rx_bps@${L}`, row.netRxBps)
      values.set(`site.log_errors_pm@${L}`, row.logErrorsPm)
      values.set(`site.building@${L}`, building ? 1 : 0)
      if (t) {
        values.set(`site.req_rate@${L}`, t.reqRate)
        values.set(`site.err4xx_rate@${L}`, t.err4xxRate)
        values.set(`site.err5xx_rate@${L}`, t.err5xxRate)
        values.set(`site.err5xx_pct@${L}`, t.err5xxPct)
        values.set(`site.bytes_out_bps@${L}`, t.bytesOutBps)
        values.set(`site.bytes_in_bps@${L}`, t.bytesInBps)
        values.set(`site.bot_rate@${L}`, t.botRate)
        if (t.p50Ms !== null) values.set(`site.p50_ms@${L}`, t.p50Ms)
        if (t.p95Ms !== null) values.set(`site.p95_ms@${L}`, t.p95Ms)
        if (t.p99Ms !== null) values.set(`site.p99_ms@${L}`, t.p99Ms)
      }
      if (du) {
        values.set(`site.disk_bytes@${L}`, du.total)
        values.set(`site.disk_releases_bytes@${L}`, du.releases)
        values.set(`site.disk_static_bytes@${L}`, du.static)
        values.set(`site.disk_home_bytes@${L}`, du.home)
      }
      if (probe && site.liveSlot) {
        if (probe.up !== null) values.set(`site.up@${L}`, probe.up ? 1 : 0)
        if (probe.ms !== null) values.set(`site.probe_ms@${L}`, probe.ms)
        if (probe.directUp !== null) values.set(`site.direct_up@${L}`, probe.directUp ? 1 : 0)
        if (probe.directMs !== null) values.set(`site.direct_ms@${L}`, probe.directMs)
        values.set(`site.down@${L}`, probe.up === false || probe.directUp === false ? 1 : 0)
      }
      const tls = this.tlsDays.get(site.id)
      if (tls !== null && tls !== undefined) values.set(`site.tls_days@${L}`, tls)
    }

    // ── Services, Postgres, network accounting, probes: on their own clocks ──
    if (this.due('services', now, 30_000)) this.background('services', () => this.sampleServices(now, bootAt))
    for (const s of this.services) {
      const def = SERVICES.find((d) => d.id === s.name)
      values.set(`svc.up@${s.name}`, s.active ? 1 : 0)
      if (def?.critical || s.name === this.postgresUnit) values.set(`svc.down@${s.name}`, s.active ? 0 : 1)
      if (s.memBytes !== null) values.set(`svc.mem_bytes@${s.name}`, s.memBytes)
      if (s.cpuPct !== null) values.set(`svc.cpu_pct@${s.name}`, s.cpuPct)
    }

    if (this.due('postgres', now, 30_000)) {
      this.background('postgres', async () => {
        const sample = await this.pg.sample(now)
        this.pgLive = sample.live
        this.store.setKv('pg.activity', sample.activity satisfies PgActivity[], now)
        this.pgValues = sample.values
      })
    }
    for (const [k, v] of this.pgValues) values.set(k, v)
    if (this.pgLive?.statementsAvailable && this.due('pg-statements', now, 300_000)) {
      this.background('pg-statements', () => this.pg.snapshotStatements(this.store.db, now))
    }

    this.background('network-accounting', async () => {
      const accounted = sites.flatMap((s) => {
        const user = this.host.system.lookupUser(s.user)
        return user ? [{ id: s.id, uid: user.uid }] : []
      })
      this.netSites = await this.netacct.sample(accounted, now)
    })

    if (this.due('probes', now, settings.probeSeconds * 1000)) this.background('probes', () => this.runProbes(now))
    if (this.due('tls', now, 3_600_000)) this.background('tls', () => this.checkTls())
    if (this.due('disk-usage', now, 900_000)) this.background('disk-usage', () => this.measureSites())
    if (this.due('smart', now, 3_600_000)) this.background('smart', () => this.checkSmart())
    for (const s of this.smart) {
      if (s.healthy !== null) values.set(`smart.failing@${s.device}`, s.healthy ? 0 : 1)
      if (s.tempC !== null) values.set(`smart.temp_c@${s.device}`, s.tempC)
      if (s.wearPct !== null) values.set(`smart.wear_pct@${s.device}`, s.wearPct)
    }
    if (this.due('security', now, 300_000)) {
      this.background('security', async () => {
        const snapshot = await this.security.collect(now, settings.expectedPorts)
        this.store.setKv('security', snapshot, now)
      })
    }
    const security = this.store.getKv<{ updates: { total: number; security: number } | null; rebootRequired: boolean; ports: { expected: boolean }[] }>('security')?.value
    if (security) {
      if (security.updates) {
        values.set('sec.updates', security.updates.total)
        values.set('sec.security_updates', security.updates.security)
      }
      values.set('sec.reboot_required', security.rebootRequired ? 1 : 0)
      values.set('sec.unexpected_ports', security.ports.filter((p) => !p.expected).length)
    }
    if (this.due('history', now, 60_000)) {
      try {
        for (const e of hostHistoryEvents(this.host, this.store, now)) this.recordEvent(e)
        this.ok('history', now)
      } catch (err) {
        this.failed('history', err, now)
      }
    }
    if (this.due('forecast', now, 3_600_000)) this.forecast(settings, now, mounts.map((m) => m.mount))
    if (settings.heartbeatUrl && this.due('heartbeat', now, 60_000)) {
      const url = settings.heartbeatUrl
      this.background('heartbeat', async () => {
        const res = await this.host.system.fetch(url, { signal: AbortSignal.timeout(10_000) })
        if (!res.ok) throw new Error(`the heartbeat check answered ${res.status}`)
      })
    }

    // ── Journal counters, turned into per-minute figures ──
    for (const [key, n] of this.counters) {
      if (key.startsWith('site.log_errors@')) continue
      values.set(key.replace(/^site\.oom@/, 'site.oom_events@'), (n * 60) / secs)
    }
    for (const name of ['sec.ssh_failed', 'sec.fw_blocked', 'sec.bans', 'caddy.errors', 'pg.errors']) {
      if (!values.has(name)) values.set(name, 0)
    }
    this.counters.clear()

    // ── Store, alert, publish ──
    this.store.write(now / 1000, values)
    this.ok('store', now)
    try {
      this.alerts.evaluate(values, this.alertContext(settings, now))
      this.ok('alerts', now)
    } catch (err) {
      this.failed('alerts', err, now)
    }
    if (this.due('prune', now, 3_600_000)) {
      try {
        this.store.prune({ now, ...settings })
        this.ok('prune', now)
      } catch (err) {
        this.failed('prune', err, now)
      }
    }

    this.prev = { at: now, stat, disks, net, sites: sitePrev }
    const snapshot: LiveSnapshot = {
      at: now,
      sampleSeconds: settings.sampleSeconds,
      host: {
        hostname: hostname(),
        kernel: release(),
        os: /PRETTY_NAME="([^"]+)"/.exec(this.proc.read('/etc/os-release') ?? '')?.[1] ?? 'Linux',
        cores,
        memTotalBytes: mem.totalBytes,
        uptimeSeconds: uptime,
        bootAt,
      },
      server: {
        cpu: { ...cpu, cores: coreUse },
        load,
        psi: { cpu: psi.cpu.some, mem: psi.mem.some, io: psi.io.some, memFull: psi.mem.full, ioFull: psi.io.full },
        mem,
        mounts,
        devices,
        interfaces,
        net: { rxBps: rxTotal, txBps: txTotal },
        tcp,
        filesOpen,
        temps,
        raid,
        smart: this.smart,
      },
      services: this.services,
      sites: siteRows,
      postgres: this.pgLive,
      alerts: alertCounts(this.store.db),
      collectors: { ...this.collectors },
    }
    try {
      writeFileAtomic(livePath(this.host.config.stateDir), JSON.stringify(snapshot), 0o600)
    } catch (err) {
      this.failed('live', err, now)
    }
    return snapshot
  }

  private pgValues = new Map<string, number>()

  private async sampleServices(now: number, bootAt: number): Promise<void> {
    if (!this.postgresUnit || this.due('postgres-unit', now, 3_600_000)) {
      const found = await this.host.system.run('systemctl', ['list-units', '--plain', '--no-legend', '--all', 'postgresql@*.service'], { timeoutMs: 10_000 })
      this.postgresUnit = /^(postgresql@\S+\.service)/m.exec(found.output)?.[1] ?? 'postgresql.service'
    }
    const ids = [...SERVICES.map((s) => s.id), this.postgresUnit]
    const result = await this.host.system.run('systemctl', ['show', '-p', 'Id,ActiveState,SubState,MemoryCurrent,CPUUsageNSec,NRestarts,ActiveEnterTimestampMonotonic', ...ids], { timeoutMs: 10_000 })
    if (result.code !== 0 && !result.output.includes('Id=')) throw new Error('systemctl show failed')
    const units = parseSystemctlShow(result.output, bootAt)
    const before = this.servicePrev
    const elapsed = this.clocks.servicesPrevAt ? (now - this.clocks.servicesPrevAt) / 1000 : 0
    this.clocks.servicesPrevAt = now
    const nextPrev = new Map<string, number>()
    this.services = units.map((u) => {
      const def = SERVICES.find((s) => s.id === u.id)
      const label = def?.label ?? (u.id === this.postgresUnit ? 'PostgreSQL' : u.id)
      let cpuPct: number | null = null
      if (u.cpuNsec !== null) {
        nextPrev.set(u.id, u.cpuNsec)
        const p = before.get(u.id)
        if (p !== undefined && elapsed > 0 && u.cpuNsec >= p) cpuPct = ((u.cpuNsec - p) / 1e9 / elapsed) * 100
      }
      // A oneshot that has run (ufw) sits in active/exited, which is fine.
      return { name: u.id, label, active: u.active, state: u.state, memBytes: u.memBytes, cpuPct, restarts: u.restarts, since: u.since }
    })
    this.servicePrev = nextPrev
  }

  private async runProbes(now: number): Promise<void> {
    const sites = this.host.store.listSites().filter((s) => s.liveSlot && s.domains.length)
    await Promise.all(sites.map(async (site) => {
      const domain = site.domains[0] as string
      const result: ProbeResult = { up: null, ms: null, directUp: null, directMs: null, tlsDays: null, at: now }
      const started = Date.now()
      try {
        const res = await this.host.system.fetch(`https://${domain}/api/health`, { redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'cactus-monitor/1' } })
        result.ms = Date.now() - started
        result.up = res.status > 0 && res.status < 500
        await res.body?.cancel().catch(() => undefined)
      } catch {
        result.ms = null
        result.up = false
      }
      const directStart = Date.now()
      try {
        const res = await this.host.system.local({
          port: site.ports[site.liveSlot as 'a' | 'b'],
          path: '/api/health',
          headers: { Host: domain, 'X-Forwarded-Proto': 'https', 'User-Agent': 'cactus-monitor/1' },
          timeoutMs: 10_000,
        })
        result.directMs = Date.now() - directStart
        result.directUp = res.status > 0 && res.status < 500
      } catch {
        result.directUp = false
      }
      const before = this.probes.get(site.id)
      this.probes.set(site.id, result)
      if (before && before.up !== false && result.up === false) {
        this.recordEvent({ at: now, kind: 'site.down', severity: 'error', site: site.id, title: `${site.name} stopped answering${result.directUp ? ' from outside (the site itself is fine)' : ''}`, detail: null })
      } else if (before?.up === false && result.up) {
        this.recordEvent({ at: now, kind: 'site.up', severity: 'info', site: site.id, title: `${site.name} is answering again`, detail: null })
      }
    }))
  }

  private async checkTls(): Promise<void> {
    const sites = this.host.store.listSites().filter((s) => s.liveSlot && s.domains.length)
    await Promise.all(sites.map(async (site) => {
      const domain = site.domains[0] as string
      const days = await new Promise<number | null>((resolve) => {
        const socket = tlsConnect({ host: domain, port: 443, servername: domain, timeout: 10_000 }, () => {
          const cert = socket.getPeerCertificate()
          socket.end()
          const until = cert?.valid_to ? Date.parse(cert.valid_to) : NaN
          resolve(Number.isFinite(until) ? (until - Date.now()) / 86_400_000 : null)
        })
        socket.on('error', () => resolve(null))
        socket.on('timeout', () => {
          socket.destroy()
          resolve(null)
        })
      })
      this.tlsDays.set(site.id, days)
    }))
  }

  private async measureSites(): Promise<void> {
    for (const site of this.host.store.listSites()) {
      const paths = this.host.store.paths(site.id)
      const dirs = { releases: paths.releases, static: paths.static, home: paths.home }
      const result = await this.host.system.run('nice', ['-n', '19', 'ionice', '-c3', 'du', '-s', '-B1', '-x', ...Object.values(dirs)], { timeoutMs: 600_000 })
      const sizes: Record<string, number> = {}
      for (const line of result.output.split('\n')) {
        const m = /^(\d+)\s+(.+)$/.exec(line.trim())
        if (m) sizes[m[2] as string] = Number(m[1])
      }
      const row = { releases: sizes[dirs.releases] ?? 0, static: sizes[dirs.static] ?? 0, home: sizes[dirs.home] ?? 0, total: 0 }
      row.total = row.releases + row.static + row.home
      if (row.total > 0) this.du.set(site.id, row)
    }
  }

  private async checkSmart(): Promise<void> {
    const scan = await this.host.system.run('smartctl', ['--scan', '-j'], { timeoutMs: 20_000 })
    if (scan.code === 127) {
      this.smart = []
      throw new Error('smartctl is not installed (apt install smartmontools)')
    }
    let devices: string[] = []
    try {
      devices = ((JSON.parse(scan.output) as { devices?: { name: string }[] }).devices ?? []).map((d) => d.name)
    } catch {
      devices = []
    }
    const out: SmartLive[] = []
    for (const device of devices) {
      const lines: string[] = []
      await this.host.system.run('smartctl', ['-a', '-j', device], { timeoutMs: 30_000, onLine: (l) => lines.push(l) })
      try {
        const j = JSON.parse(lines.join('\n')) as {
          smart_status?: { passed?: boolean }
          temperature?: { current?: number }
          power_on_time?: { hours?: number }
          nvme_smart_health_information_log?: { percentage_used?: number }
          ata_smart_attributes?: { table?: { id: number; raw?: { value?: number } }[] }
        }
        out.push({
          device: device.replace(/^\/dev\//, ''),
          healthy: typeof j.smart_status?.passed === 'boolean' ? j.smart_status.passed : null,
          tempC: j.temperature?.current ?? null,
          powerOnHours: j.power_on_time?.hours ?? null,
          wearPct: j.nvme_smart_health_information_log?.percentage_used ?? null,
          reallocated: j.ata_smart_attributes?.table?.find((a) => a.id === 5)?.raw?.value ?? null,
        })
      } catch {
        // A device smartctl cannot read (a RAID array itself) is simply left out.
      }
    }
    this.smart = out
  }

  /** "Full in N days" for each disk, from the last fortnight of hourly figures. */
  private forecast(settings: MonitorSettings, now: number, mounts: string[]): void {
    for (const mount of mounts) {
      const result = this.store.query([`disk.used_bytes@${mount}`, `disk.total_bytes@${mount}`], now - 14 * 86_400_000, now, {
        maxPoints: 400, now, sampleSeconds: settings.sampleSeconds, rawHours: settings.rawHours, minuteDays: settings.minuteDays,
      })
      const days = daysUntilFull(result.t, result.series[0]?.avg ?? [], result.series[1]?.avg ?? [])
      if (days === null) this.forecasts.delete(mount)
      else this.forecasts.set(mount, days)
    }
  }
}

/** Least-squares growth of `used` against time, and how long until it meets `total`. Null when it is not growing. */
export function daysUntilFull(t: number[], used: (number | null)[], total: (number | null)[]): number | null {
  const pts: [number, number][] = []
  t.forEach((at, i) => {
    const u = used[i]
    if (u !== null && u !== undefined) pts.push([at / 86_400_000, u])
  })
  if (pts.length < 6) return null
  const n = pts.length
  const mx = pts.reduce((s, p) => s + p[0], 0) / n
  const my = pts.reduce((s, p) => s + p[1], 0) / n
  const num = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0)
  const den = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0)
  if (den === 0) return null
  const slope = num / den
  const cap = [...total].reverse().find((v) => v !== null && v !== undefined)
  const last = pts[n - 1]?.[1]
  if (slope <= 0 || !cap || last === undefined) return null
  return Math.max(0, Math.min(3650, (cap - last) / slope))
}

export function siteHealth(row: SiteLive, memPct: number): SiteHealth {
  if (!row.liveSlot) return 'idle'
  if (row.up === false || row.directUp === false) return 'down'
  if (row.err5xxPct > 2 || memPct > 90 || (row.p95Ms ?? 0) > 2000 || row.oomKills > 0 || (row.tlsDays !== null && row.tlsDays < 14)) return 'warning'
  return 'ok'
}
