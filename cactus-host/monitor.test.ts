import { appendFileSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { siteCaddyFile } from './caddy.ts'
import { MetricsStore } from './metrics-store.ts'
import { AlertEngine, listAlerts, outbox, acknowledge, markSent } from './monitor-alerts.ts'
import { classifyJournal, insertEvent, queryEvents, siteFromUnit, siteLineIsError } from './monitor-events.ts'
import { nftRuleset, parseNftCounters } from './monitor-netacct.ts'
import {
  cpuPercent, parseDiskstats, parseIoStat, parseMdstat, parseMeminfo, parseMounts, parseNetDev, parsePressure,
  parseProcStat, parseSs, parseSystemctlShow, siteSlice, type Proc,
} from './monitor-proc.ts'
import { cleanSettings, DEFAULT_SETTINGS } from './monitor-settings.ts'
import { parseAptCheck, parseFail2banStatus, parseSshdT } from './monitor-security.ts'
import { AccessLogTailer, agentFamily, normalisePath, parseAccessLine, TrafficAggregator, trafficReport } from './monitor-traffic.ts'
import { daysUntilFull, livePath, Monitor, siteHealth } from './monitor.ts'
import { prometheusText } from './monitor-api.ts'
import { buildStepArgs, slotUnit } from './units.ts'
import { hostWithSite } from './testing.ts'
import type { SiteLive } from './monitor-protocol.ts'

function tempDb(): string {
  return join(mkdtempSync(join(tmpdir(), 'cactus-monitor-')), 'metrics.db')
}

const QUERY = { now: 0, sampleSeconds: 10, rawHours: 48, minuteDays: 35, maxPoints: 600 }

describe('the history store', () => {
  it('keeps raw samples and reads them back on the sample grid', () => {
    const store = new MetricsStore(tempDb())
    const base = 1_800_000_000 - (1_800_000_000 % 600)
    for (let i = 0; i < 30; i++) store.write(base + i * 10, new Map([['cpu.pct', i], ['disk.used_pct@/', 50]]))
    const r = store.query(['cpu.pct', 'disk.used_pct@/'], base * 1000, (base + 290) * 1000, { ...QUERY, now: (base + 300) * 1000 })
    expect(r.tier).toBe('raw')
    expect(r.step).toBe(10)
    expect(r.series[0]?.avg.slice(0, 5)).toEqual([0, 1, 2, 3, 4])
    expect(r.series[1]).toMatchObject({ name: 'disk.used_pct', label: '/' })
    expect(store.catalogue().map((s) => s.key)).toEqual(['cpu.pct', 'disk.used_pct@/'])
  })

  it('rolls minutes and hours up with their min, average and max', () => {
    const store = new MetricsStore(tempDb())
    const base = 1_800_000_000 - (1_800_000_000 % 3600)
    // Two hours and a bit of a value that climbs 0..5 every minute.
    for (let s = 0; s <= 2 * 3600 + 60; s += 10) store.write(base + s, new Map([['x', (s % 60) / 10]]))
    const now = (base + 2 * 3600 + 60) * 1000
    const minutes = store.query(['x'], base * 1000, (base + 3599) * 1000, { ...QUERY, now, rawHours: 0, maxPoints: 100 })
    expect(minutes.tier).toBe('minute')
    const hours = store.query(['x'], base * 1000, (base + 7199) * 1000, { ...QUERY, now, rawHours: 0, minuteDays: 0, maxPoints: 10 })
    expect(hours.tier).toBe('hour')
    expect(hours.series[0]?.avg[0]).toBeCloseTo(2.5)
    expect(hours.series[0]?.min[0]).toBe(0)
    expect(hours.series[0]?.max[0]).toBe(5)
  })

  it('carries on a chunk after a restart instead of starting it again', () => {
    const path = tempDb()
    const base = 1_800_000_000 - (1_800_000_000 % 600)
    const a = new MetricsStore(path)
    a.write(base, new Map([['x', 1]]))
    a.close()
    const b = new MetricsStore(path)
    b.write(base + 10, new Map([['x', 2]]))
    const r = b.query(['x'], base * 1000, (base + 10) * 1000, { ...QUERY, now: (base + 20) * 1000 })
    expect(r.series[0]?.avg.filter((v) => v !== null)).toEqual([1, 2])
  })

  it('finds every label of a name and prunes what has aged out', () => {
    const store = new MetricsStore(tempDb())
    const old = 1_700_000_000
    store.write(old, new Map([['site.cpu_pct@shop', 1], ['site.cpu_pct@blog', 2], ['site_cpu', 3]]))
    expect(store.keysNamed('site.cpu_pct').sort()).toEqual(['site.cpu_pct@blog', 'site.cpu_pct@shop'])
    store.prune({ now: (old + 3 * 86_400) * 1000, rawHours: 48, minuteDays: 35, hourDays: 730, eventDays: 730, visitorDays: 30, maxStoreMb: 2048 })
    const count = store.db.prepare('SELECT COUNT(*) AS n FROM raw').get() as { n: number }
    expect(count.n).toBe(0)
  })
})

describe('reading /proc', () => {
  it('works out CPU use between two readings', () => {
    const a = parseProcStat('cpu  100 0 100 800 0 0 0 0\ncpu0 100 0 100 800 0 0 0 0\nprocs_running 2\n')
    const b = parseProcStat('cpu  150 0 150 900 0 0 0 0\ncpu0 150 0 150 900 0 0 0 0\nprocs_running 3\n')
    expect(cpuPercent(a.total, b.total).pct).toBe(50)
    expect(b.cores).toHaveLength(1)
    expect(b.procsRunning).toBe(3)
  })

  it('reads memory, pressure, disks, mounts, RAID, network and io.stat', () => {
    expect(parseMeminfo('MemTotal:  16000 kB\nMemAvailable: 8000 kB\nHugePages_Total: 0\n')).toMatchObject({ MemTotal: 16_384_000, MemAvailable: 8_192_000, HugePages_Total: 0 })
    expect(parsePressure('some avg10=1.50 avg60=0 avg300=0 total=1\nfull avg10=0.25 avg60=0 avg300=0 total=1')).toEqual({ some: 1.5, full: 0.25 })
    const disks = parseDiskstats('   8       0 sda 100 0 2000 50 200 0 4000 70 0 120 120\n   8       1 sda1 1 0 1 1 1 0 1 1 0 1 1\n   7 0 loop0 1 0 1 1 1 0 1 1 0 1 1', new Set(['sda', 'loop0']))
    expect([...disks.keys()]).toEqual(['sda'])
    expect(disks.get('sda')).toMatchObject({ reads: 100, readSectors: 2000, writes: 200, writeSectors: 4000, ioMs: 120 })
    expect(parseMounts('/dev/md0 / ext4 rw 0 0\ntmpfs /run tmpfs rw 0 0\n/dev/md0 /var/snap ext4 rw 0 0\n/dev/sdb1 /mnt/my\\040disk xfs rw 0 0')).toEqual([
      { device: '/dev/md0', mount: '/', fsType: 'ext4' },
      { device: '/dev/sdb1', mount: '/mnt/my disk', fsType: 'xfs' },
    ])
    const md = parseMdstat('Personalities : [raid1]\nmd0 : active raid1 sdb1[1] sda1[0]\n      976630464 blocks super 1.2 [2/1] [U_]\n      [==>.......]  recovery = 12.6% (1/2) finish=60min\n\nunused devices: <none>\n')
    expect(md).toEqual([{ name: 'md0', level: 'raid1', devices: 2, active: 1, degraded: true, syncPct: 12.6, state: 'recovery' }])
    const net = parseNetDev('Inter-|   Receive\n face |bytes\n    lo: 1 1 0 0 0 0 0 0 1 1 0 0 0 0 0 0\n  eth0: 1000 10 0 1 0 0 0 0 2000 20 0 0 0 0 0 0\nveth1: 1 1 0 0 0 0 0 0 1 1 0 0 0 0 0 0')
    expect([...net.keys()]).toEqual(['eth0'])
    expect(net.get('eth0')).toMatchObject({ rxBytes: 1000, rxDrop: 1, txBytes: 2000 })
    expect(parseIoStat('8:0 rbytes=10 wbytes=20 rios=1 wios=2 dbytes=0\n9:0 rbytes=5 wbytes=5 rios=1 wios=1')).toEqual({ readBytes: 15, writeBytes: 25, readOps: 2, writeOps: 3 })
  })

  it('escapes a dash in a site slice so systemd does not file it under another site', () => {
    expect(siteSlice('shop')).toBe('cactus-shop.slice')
    expect(siteSlice('tiller-well')).toBe('cactus-tiller\\x2dwell.slice')
  })

  it('reads systemctl show and ss', () => {
    const units = parseSystemctlShow('Id=caddy.service\nActiveState=active\nSubState=running\nMemoryCurrent=52428800\nCPUUsageNSec=1000000000\nNRestarts=2\nActiveEnterTimestampMonotonic=5000000\n\nId=fail2ban.service\nActiveState=failed\nSubState=failed\nMemoryCurrent=18446744073709551615\nCPUUsageNSec=[not set]\nNRestarts=0\n', 1_000_000)
    expect(units[0]).toMatchObject({ id: 'caddy.service', active: true, memBytes: 52_428_800, cpuNsec: 1e9, restarts: 2, since: 1_005_000 })
    expect(units[1]).toMatchObject({ id: 'fail2ban.service', active: false, memBytes: null, cpuNsec: null })
    const ports = parseSs('tcp LISTEN 0 4096 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=1,fd=3))\ntcp LISTEN 0 4096 127.0.0.1:5432 0.0.0.0:* users:(("postgres",pid=2,fd=5))\ntcp LISTEN 0 4096 [::]:443 [::]:* users:(("caddy",pid=3,fd=7))')
    expect(ports).toEqual([
      { proto: 'tcp', address: '0.0.0.0', port: 22, process: 'sshd' },
      { proto: 'tcp', address: '127.0.0.1', port: 5432, process: 'postgres' },
      { proto: 'tcp', address: '::', port: 443, process: 'caddy' },
    ])
  })
})

describe('visitor traffic', () => {
  const line = (over: Record<string, unknown> = {}) => JSON.stringify({
    level: 'info', ts: 1_800_000_000.5, msg: 'handled request',
    request: { client_ip: '172.68.1.1', method: 'GET', host: 'shop.example.com', uri: '/products/123456?ref=x',
      headers: { 'User-Agent': ['Mozilla/5.0 (Macintosh) AppleWebKit Chrome/120 Safari/537'], 'Cf-Connecting-Ip': ['203.0.113.9'], 'Cf-Ipcountry': ['GB'] } },
    bytes_read: 10, duration: 0.125, size: 5000, status: 200, ...over,
  })

  it('reads a Caddy access line, taking the visitor and country from Cloudflare', () => {
    expect(parseAccessLine(line(), 'shop')).toMatchObject({ site: 'shop', at: 1_800_000_000_500, path: '/products/:id', status: 200, durationMs: 125, bytesOut: 5000, bytesIn: 10, ip: '203.0.113.9', country: 'GB', agent: 'Chrome', bot: false })
    expect(parseAccessLine('not json', 'shop')).toBeNull()
    expect(normalisePath('/_next/static/chunks/abc.js')).toBe('/_next/static/*')
    expect(agentFamily('Mozilla/5.0 (compatible; Googlebot/2.1)')).toEqual({ agent: 'Bot: Googlebot', bot: true })
    expect(agentFamily('Mozilla/5.0 (iPhone) Version/17 Mobile Safari/604')).toEqual({ agent: 'Safari (mobile)', bot: false })
  })

  it('turns records into per-sample figures and per-minute breakdowns', () => {
    const agg = new TrafficAggregator()
    const records = [200, 200, 404, 500].map((status, i) => parseAccessLine(line({ status, duration: (i + 1) / 10 }), 'shop')!)
    agg.add(records)
    const sample = agg.drain(10, ['shop', 'blog']).get('shop')!
    expect(sample).toMatchObject({ reqRate: 0.4, err4xxRate: 0.1, err5xxRate: 0.1, err5xxPct: 25, bytesOutBps: 2000 })
    expect(sample.p95Ms).toBe(400)
    const db = new MetricsStore(tempDb()).db
    agg.flush(db, 1_800_000_000_500 + 120_000)
    const report = trafficReport(db, 'shop', 1_799_999_000_000, 1_800_001_000_000)
    expect(report.totals).toMatchObject({ requests: 4, errors4xx: 1, errors5xx: 1 })
    expect(report.paths[0]).toMatchObject({ key: 'GET /products/:id', requests: 4 })
    expect(report.countries[0]?.key).toBe('GB')
    expect(report.visitors[0]?.key).toBe('203.0.113.9')
  })

  it('follows a growing log and starts again after it rolls', () => {
    const dir = mkdtempSync(join(tmpdir(), 'caddy-logs-'))
    const file = join(dir, 'shop.access.log')
    writeFileSync(file, `${line()}\n`)
    const tailer = new AccessLogTailer(dir)
    expect(tailer.poll()).toHaveLength(0)
    appendFileSync(file, `${line()}\n${line({ status: 500 })}\n{"half`)
    expect(tailer.poll().map((r) => r.status)).toEqual([200, 500])
    writeFileSync(`${file}.new`, `${line({ status: 404 })}\n`)
    renameSync(`${file}.new`, file)
    expect(tailer.poll().map((r) => r.status)).toEqual([404])
  })
})

describe('the journal', () => {
  const entry = (identifier: string, message: string, unit: string | null = null) => ({ at: 1, unit, identifier, priority: 6, message })

  it('spots out-of-memory kills, crashes, logins, bans and blocked traffic', () => {
    expect(classifyJournal(entry('kernel', 'oom-kill:constraint=CONSTRAINT_MEMCG,task_memcg=/cactus.slice/cactus-shop.slice/cactus-shop-a.service,task=node,pid=1,uid=1001'))?.event).toMatchObject({ kind: 'oom', site: 'shop' })
    expect(classifyJournal(entry('kernel', '[UFW BLOCK] IN=eth0'))?.counter).toEqual({ name: 'sec.fw_blocked' })
    expect(classifyJournal(entry('systemd', 'cactus-shop-a.service: Failed with result \'exit-code\'.'))?.event).toMatchObject({ kind: 'unit.failed', site: 'shop' })
    expect(classifyJournal(entry('systemd', 'cactus-postgres-backup.service: Failed with result \'exit-code\'.'))?.event?.kind).toBe('backup.failed')
    expect(classifyJournal(entry('sshd', 'Accepted publickey for root from 198.51.100.4 port 2 ssh2'))?.event).toMatchObject({ kind: 'ssh.login', title: 'SSH login: root from 198.51.100.4 (publickey)' })
    expect(classifyJournal(entry('sshd', 'Failed password for invalid user admin from 1.2.3.4'))?.counter?.name).toBe('sec.ssh_failed')
    expect(classifyJournal(entry('fail2ban.actions', '2026-10-30 NOTICE [sshd] Ban 1.2.3.4'))?.event?.kind).toBe('security.ban')
    expect(classifyJournal({ at: 1, unit: 'cactus-shop-b.service', identifier: 'node', priority: 6, message: 'Unhandled error in route' })?.counter).toEqual({ name: 'site.log_errors', site: 'shop' })
  })

  it('knows a site from its unit, build or slice, and a JSON log line\'s level', () => {
    expect(siteFromUnit('cactus-tiller-well-a.service')).toBe('tiller-well')
    expect(siteFromUnit('cactus-build-shop-lx3k.service')).toBe('shop')
    expect(siteFromUnit('/cactus.slice/cactus-tiller\\x2dwell.slice/x')).toBe('tiller-well')
    expect(siteLineIsError('{"level":"info","msg":"error budget fine"}')).toBe(false)
    expect(siteLineIsError('{"level":50}')).toBe(true)
  })

  it('stores events and finds them by site and kind', () => {
    const db = new MetricsStore(tempDb()).db
    insertEvent(db, { at: 10, kind: 'build.ok', severity: 'info', site: 'shop', title: 'deployed', detail: null })
    insertEvent(db, { at: 20, kind: 'server.reboot', severity: 'warning', site: null, title: 'rebooted', detail: null })
    insertEvent(db, { at: 30, kind: 'build.failed', severity: 'error', site: 'blog', title: 'failed', detail: null })
    expect(queryEvents(db, { from: 0, to: 100, site: 'shop' }).map((e) => e.kind)).toEqual(['server.reboot', 'build.ok'])
    expect(queryEvents(db, { from: 0, to: 100, kinds: ['build.*'] }).map((e) => e.site)).toEqual(['blog', 'shop'])
  })
})

describe('alerts', () => {
  const ctx = (now: number, over: Partial<typeof DEFAULT_SETTINGS> = {}) => ({
    now, settings: { ...DEFAULT_SETTINGS, ...over }, deploying: new Set<string>(), siteName: (id: string) => (id === 'shop' ? 'The Shop' : id),
  })

  it('fires after the hold time, reminds, and resolves with a notice', () => {
    const db = new MetricsStore(tempDb()).db
    const engine = new AlertEngine(db)
    const hot = new Map([['disk.used_pct@/', 90]])
    engine.evaluate(hot, ctx(0))
    expect(listAlerts(db, { state: 'open' })).toHaveLength(0)
    engine.evaluate(hot, ctx(301_000))
    const [alert] = listAlerts(db, { state: 'open' })
    expect(alert).toMatchObject({ ruleId: 'disk-warning', label: '/', title: 'Disk filling up: / (90.0%)', state: 'firing' })
    expect(outbox(db, 301_000).map((n) => n.kind)).toEqual(['firing'])
    markSent(db, outbox(db, 301_000).map((n) => n.id), 301_000)
    engine.evaluate(hot, ctx(301_000 + 61 * 60_000))
    expect(outbox(db, 0).map((n) => n.kind)).toEqual(['reminder'])
    markSent(db, outbox(db, 0).map((n) => n.id), 0)
    engine.evaluate(new Map([['disk.used_pct@/', 50]]), ctx(4_000_000))
    expect(listAlerts(db, { state: 'open' })).toHaveLength(0)
    expect(outbox(db, 0).map((n) => n.kind)).toEqual(['resolved'])
  })

  it('names the site, stays quiet while it deploys, and stops reminding once acknowledged', () => {
    const db = new MetricsStore(tempDb()).db
    const engine = new AlertEngine(db)
    const down = new Map([['site.down@shop', 1]])
    const deploying = { ...ctx(0), deploying: new Set(['shop']) }
    engine.evaluate(down, deploying)
    engine.evaluate(down, { ...deploying, now: 61_000 })
    const [alert] = listAlerts(db, { state: 'open' })
    expect(alert).toMatchObject({ title: 'Site down: The Shop (1)', site: 'shop', muted: true })
    expect(outbox(db, 61_000)).toHaveLength(0)
    // The deploy finished and it is still down: now it is worth an email.
    engine.evaluate(down, ctx(70_000))
    expect(outbox(db, 70_000).map((n) => n.kind)).toEqual(['firing'])
    markSent(db, outbox(db, 70_000).map((n) => n.id), 70_000)
    acknowledge(db, alert!.id, 'chris', 80_000)
    engine.evaluate(down, ctx(10 * 3_600_000))
    expect(outbox(db, 0)).toHaveLength(0)
  })

  it('raises one alert per matching event', () => {
    const db = new MetricsStore(tempDb()).db
    const engine = new AlertEngine(db)
    engine.onEvent({ at: 5, kind: 'build.failed', severity: 'error', site: 'shop', title: 'The Shop: deploy failed', detail: null }, ctx(5))
    engine.onEvent({ at: 5, kind: 'build.ok', severity: 'info', site: 'shop', title: 'ok', detail: null }, ctx(5))
    expect(listAlerts(db, { state: 'open' }).map((a) => a.title)).toEqual(['The Shop: deploy failed'])
  })
})

describe('settings', () => {
  it('keeps what is sensible and falls back for the rest', () => {
    const s = cleanSettings({ sampleSeconds: 1, rawHours: 1000, minuteDays: 60, hourDays: 10, alerts: { emails: ['A@Example.com', 'nope'], repeatMinutes: 30 }, heartbeatUrl: 'http://insecure', expectedPorts: [22, 22, 99999, 443], rules: [{ id: 'Bad Id' }, { id: 'mine', type: 'metric', metric: 'cpu.pct', threshold: 50 }] })
    expect(s).toMatchObject({ sampleSeconds: 5, rawHours: 168, minuteDays: 60, hourDays: 60, heartbeatUrl: null, expectedPorts: [22, 443] })
    expect(s.alerts).toMatchObject({ emails: ['a@example.com'], repeatMinutes: 30, sendResolved: true })
    expect(s.rules).toEqual([{ id: 'mine', name: 'mine', enabled: true, severity: 'warning', type: 'metric', metric: 'cpu.pct', label: null, op: '>', threshold: 50, forSeconds: 0 }])
  })
})

describe('the rest', () => {
  it('forecasts when a disk fills, and grades a site', () => {
    const t = Array.from({ length: 10 }, (_, i) => i * 86_400_000)
    expect(daysUntilFull(t, t.map((_, i) => 100 + i * 10), t.map(() => 300))).toBeCloseTo(11, 0)
    expect(daysUntilFull(t, t.map(() => 100), t.map(() => 300))).toBeNull()
    const site = { liveSlot: 'a', up: true, directUp: true, err5xxPct: 0, p95Ms: 100, oomKills: 0, tlsDays: 80 } as SiteLive
    expect(siteHealth(site, 50)).toBe('ok')
    expect(siteHealth({ ...site, err5xxPct: 5 }, 50)).toBe('warning')
    expect(siteHealth({ ...site, up: false }, 50)).toBe('down')
    expect(siteHealth({ ...site, liveSlot: null }, 50)).toBe('idle')
  })

  it('reads apt-check, fail2ban and sshd -T', () => {
    expect(parseAptCheck('12;3')).toEqual({ total: 12, security: 3 })
    expect(parseFail2banStatus('sshd', '|- Currently failed: 2\n|- Total failed: 9\n   |- Currently banned: 1\n   |- Total banned: 4')).toEqual({ jail: 'sshd', banned: 1, totalBanned: 4, failed: 2 })
    expect(parseSshdT('port 22\npasswordauthentication no\npermitrootlogin prohibit-password\n')).toEqual({ passwordAuth: false, rootLogin: 'prohibit-password' })
  })

  it('writes an nftables table that only counts, and reads its counters', () => {
    const rules = nftRuleset([{ id: 'shop', uid: 1001 }])
    expect(rules).toContain('meta skuid 1001 ct mark set 1001 counter comment "shop"')
    expect(rules).not.toMatch(/drop|reject/)
    const json = JSON.stringify({ nftables: [{ rule: { chain: 'out', comment: 'shop', expr: [{ match: {} }, { counter: { packets: 1, bytes: 500 } }] } }, { rule: { chain: 'in', comment: 'shop', expr: [{ counter: { packets: 1, bytes: 900 } }] } }] })
    expect(parseNftCounters(json).get('shop')).toEqual({ tx: 500, rx: 900 })
  })

  it('puts each site in its own slice, with its builds, and gives Caddy an access log', () => {
    const { host, site, paths } = hostWithSite()
    expect(slotUnit(host.config, site, paths, 'a')).toContain('Slice=cactus-shop.slice')
    expect(buildStepArgs(host.config, site, paths, '/r', ['npm', 'ci'])).toContain('--slice=cactus-shop.slice')
    expect(siteCaddyFile(host.config, site, paths)).toContain('output file /var/log/caddy/shop.access.log')
  })
})

describe('a whole sample', () => {
  function fakeProc(files: Record<string, string>): Proc {
    return {
      read: (p) => files[p] ?? null,
      list: (dir) => [...new Set(Object.keys(files).filter((k) => k.startsWith(`${dir}/`)).map((k) => k.slice(dir.length + 1).split('/')[0] as string))],
      statfs: (p) => (p === '/' ? { totalBytes: 100e9, availBytes: 40e9, freeBytes: 45e9, files: 1000, filesFree: 900 } : null),
      link: () => null,
    }
  }

  it('reads the server and each site, stores it, and writes the live snapshot', async () => {
    const { host, site } = hostWithSite()
    host.store.saveSite({ ...site, liveSlot: 'a' })
    const slice = '/cg/cactus.slice/cactus-shop.slice'
    const files: Record<string, string> = {
      '/proc/stat': 'cpu  100 0 100 800 0 0 0 0\ncpu0 100 0 100 800 0 0 0 0\n',
      '/proc/loadavg': '0.50 0.40 0.30 1/100 1',
      '/proc/meminfo': 'MemTotal: 1000 kB\nMemAvailable: 250 kB\nCached: 100 kB\nBuffers: 0 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n',
      '/proc/mounts': '/dev/md0 / ext4 rw 0 0\n',
      '/proc/diskstats': '9 0 md0 100 0 2000 50 200 0 4000 70 0 120 120\n',
      '/sys/block/md0': '',
      '/proc/net/dev': 'eth0: 1000 10 0 0 0 0 0 0 2000 20 0 0 0 0 0 0\n',
      '/proc/uptime': '3600.00 1000.00',
      [`${slice}/cgroup.procs`]: '1\n',
      [`${slice}/cactus-shop-a.service/memory.current`]: '104857600\n',
      [`${slice}/cactus-shop-a.service/memory.max`]: '209715200\n',
      [`${slice}/cactus-shop-a.service/cpu.stat`]: 'usage_usec 1000000\n',
    }
    const proc = fakeProc(files)
    const monitor = new Monitor(host, { proc, cgroupRoot: '/cg', accessLogDir: mkdtempSync(join(tmpdir(), 'logs-')) })
    const settings = { ...DEFAULT_SETTINGS }
    const first = await monitor.tick(settings)
    files['/proc/stat'] = 'cpu  150 0 150 900 0 0 0 0\ncpu0 150 0 150 900 0 0 0 0\n'
    files[`${slice}/cactus-shop-a.service/cpu.stat`] = 'usage_usec 6000000\n'
    ;(host.system as unknown as { clock: number }).clock += 10_000
    const live = await monitor.tick(settings)
    expect(live.server.cpu.pct).toBe(50)
    expect(live.server.mem).toMatchObject({ totalBytes: 1_024_000, availableBytes: 256_000 })
    expect(live.server.mounts[0]).toMatchObject({ mount: '/', usedBytes: 55e9 })
    const shop = live.sites[0]!
    expect(shop).toMatchObject({ id: 'shop', memBytes: 104_857_600, memLimitBytes: 209_715_200 })
    // Five seconds of CPU over however long the fake clock says passed.
    expect(shop.cpuPct).toBeCloseTo(5 / ((live.at - first.at) / 1000) * 100)
    expect(JSON.parse(readFileSync(livePath(host.config.stateDir), 'utf8')).at).toBe(live.at)
    const keys = monitor.store.catalogue().map((s) => s.key)
    expect(keys).toEqual(expect.arrayContaining(['cpu.pct', 'site.cpu_pct@shop', 'site.mem_pct@shop', 'disk.used_pct@/', 'net.rx_bps@eth0']))
    expect(prometheusText(live)).toContain('cactus_site_memory_bytes{site="shop"} 104857600')
    monitor.store.close()
  })
})
