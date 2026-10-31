// Reading the box: /proc, /sys and the cgroup tree, as plain text in and numbers
// out. Every parser here is pure, so the tests hand in fixture files; the one place
// that touches the real filesystem is `realProc`.
//
// Counters (CPU jiffies, bytes, operations) are returned as they stand. Turning two
// readings into a rate is the sampler's job, because only it knows how long it was
// between them.

import { readdirSync, readFileSync, readlinkSync, statfsSync } from 'node:fs'

/** The filesystem as the monitor sees it. Null for a file that is not there. */
export type Proc = {
  read(path: string): string | null
  list(dir: string): string[]
  statfs(path: string): { totalBytes: number; availBytes: number; freeBytes: number; files: number; filesFree: number } | null
  link(path: string): string | null
}

export const realProc: Proc = {
  read(path) {
    try {
      return readFileSync(path, 'utf8')
    } catch {
      return null
    }
  },
  list(dir) {
    try {
      return readdirSync(dir)
    } catch {
      return []
    }
  },
  statfs(path) {
    try {
      const s = statfsSync(path)
      return {
        totalBytes: s.blocks * s.bsize,
        availBytes: s.bavail * s.bsize,
        freeBytes: s.bfree * s.bsize,
        files: s.files,
        filesFree: s.ffree,
      }
    } catch {
      return null
    }
  },
  link(path) {
    try {
      return readlinkSync(path)
    } catch {
      return null
    }
  },
}

// ── CPU ──────────────────────────────────────────────────────────────────────

export type CpuTimes = { user: number; nice: number; system: number; idle: number; iowait: number; irq: number; softirq: number; steal: number }

export type ProcStat = { total: CpuTimes; cores: CpuTimes[]; procsRunning: number; procsBlocked: number }

export function parseProcStat(text: string): ProcStat {
  let total: CpuTimes | null = null
  const cores: CpuTimes[] = []
  let procsRunning = 0
  let procsBlocked = 0
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/)
    const head = parts[0] ?? ''
    if (head.startsWith('cpu')) {
      const n = parts.slice(1).map(Number)
      const times: CpuTimes = {
        user: n[0] ?? 0, nice: n[1] ?? 0, system: n[2] ?? 0, idle: n[3] ?? 0,
        iowait: n[4] ?? 0, irq: n[5] ?? 0, softirq: n[6] ?? 0, steal: n[7] ?? 0,
      }
      if (head === 'cpu') total = times
      else cores.push(times)
    } else if (head === 'procs_running') procsRunning = Number(parts[1]) || 0
    else if (head === 'procs_blocked') procsBlocked = Number(parts[1]) || 0
  }
  return { total: total ?? { user: 0, nice: 0, system: 0, idle: 0, iowait: 0, irq: 0, softirq: 0, steal: 0 }, cores, procsRunning, procsBlocked }
}

function cpuSum(t: CpuTimes): number {
  return t.user + t.nice + t.system + t.idle + t.iowait + t.irq + t.softirq + t.steal
}

/** Percentages of the time between two readings. */
export function cpuPercent(a: CpuTimes, b: CpuTimes): { pct: number; user: number; system: number; iowait: number; steal: number } {
  const total = cpuSum(b) - cpuSum(a)
  if (total <= 0) return { pct: 0, user: 0, system: 0, iowait: 0, steal: 0 }
  const pct = (v: number) => Math.max(0, Math.min(100, (v / total) * 100))
  const idle = b.idle + b.iowait - (a.idle + a.iowait)
  return {
    pct: pct(total - idle),
    user: pct(b.user + b.nice - a.user - a.nice),
    system: pct(b.system + b.irq + b.softirq - a.system - a.irq - a.softirq),
    iowait: pct(b.iowait - a.iowait),
    steal: pct(b.steal - a.steal),
  }
}

// ── Memory, load, pressure ───────────────────────────────────────────────────

/** /proc/meminfo, in bytes. */
export function parseMeminfo(text: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const line of text.split('\n')) {
    const m = /^([\w()]+):\s+(\d+)(?:\s+kB)?/.exec(line)
    if (m) out[m[1] as string] = Number(m[2]) * (line.includes('kB') ? 1024 : 1)
  }
  return out
}

export function parseLoadavg(text: string): [number, number, number] {
  const [a, b, c] = text.trim().split(/\s+/).map(Number)
  return [a ?? 0, b ?? 0, c ?? 0]
}

/** A PSI file (/proc/pressure/* or a cgroup's *.pressure): avg10 of "some" and "full", in percent. */
export function parsePressure(text: string | null): { some: number; full: number } {
  if (!text) return { some: 0, full: 0 }
  const pick = (kind: string) => {
    const m = new RegExp(`^${kind} avg10=([\\d.]+)`, 'm').exec(text)
    return m ? Number(m[1]) : 0
  }
  return { some: pick('some'), full: pick('full') }
}

// ── Disks ────────────────────────────────────────────────────────────────────

export type DiskCounters = { reads: number; readSectors: number; readMs: number; writes: number; writeSectors: number; writeMs: number; ioMs: number }

/** /proc/diskstats, keeping only whole devices that /sys/block lists (no partitions, loops or ram disks). */
export function parseDiskstats(text: string, wholeDevices: Set<string>): Map<string, DiskCounters> {
  const out = new Map<string, DiskCounters>()
  for (const line of text.split('\n')) {
    const f = line.trim().split(/\s+/)
    const name = f[2]
    if (!name || !wholeDevices.has(name) || /^(loop|ram|zram|sr|fd)/.test(name)) continue
    const n = f.map(Number)
    out.set(name, {
      reads: n[3] ?? 0, readSectors: n[5] ?? 0, readMs: n[6] ?? 0,
      writes: n[7] ?? 0, writeSectors: n[9] ?? 0, writeMs: n[10] ?? 0,
      ioMs: n[12] ?? 0,
    })
  }
  return out
}

const REAL_FS = new Set(['ext4', 'ext3', 'ext2', 'xfs', 'btrfs', 'zfs', 'f2fs', 'vfat', 'jfs', 'reiserfs'])

export type Mount = { device: string; mount: string; fsType: string }

/** Real filesystems from /proc/mounts, one entry per device (the first mount wins). */
export function parseMounts(text: string): Mount[] {
  const seen = new Set<string>()
  const out: Mount[] = []
  for (const line of text.split('\n')) {
    const [device, mount, fsType] = line.split(' ')
    if (!device || !mount || !fsType || !REAL_FS.has(fsType)) continue
    // Octal escapes, as the kernel writes spaces in paths.
    const path = mount.replace(/\\(\d{3})/g, (_, o: string) => String.fromCharCode(parseInt(o, 8)))
    if (seen.has(device) || path.startsWith('/snap/')) continue
    seen.add(device)
    out.push({ device, mount: path, fsType })
  }
  return out
}

export type RaidArray = { name: string; level: string; devices: number; active: number; degraded: boolean; syncPct: number | null; state: string }

/** /proc/mdstat: each array, how many of its disks are up, and any rebuild in progress. */
export function parseMdstat(text: string | null): RaidArray[] {
  if (!text) return []
  const out: RaidArray[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const head = /^(md\d+)\s*:\s*(\w+)\s+(?:\((?:auto-)?read-only\)\s+)?(\w+)/.exec(lines[i] ?? '')
    if (!head) continue
    const status = /\[(\d+)\/(\d+)\]\s*\[([U_]+)\]/.exec(lines[i + 1] ?? '')
    const sync = /(recovery|resync|reshape|check)\s*=\s*([\d.]+)%/.exec(lines[i + 2] ?? '')
    const devices = status ? Number(status[1]) : 0
    const active = status ? Number(status[2]) : 0
    out.push({
      name: head[1] as string,
      level: head[2] === 'active' ? (head[3] as string) : (head[2] as string),
      devices,
      active,
      degraded: Boolean(status && (status[3] as string).includes('_')),
      syncPct: sync ? Number(sync[2]) : null,
      state: sync ? (sync[1] as string) : head[2] === 'active' ? 'active' : (head[2] as string),
    })
  }
  return out
}

// ── Network ──────────────────────────────────────────────────────────────────

export type NetCounters = { rxBytes: number; rxPackets: number; rxErrors: number; rxDrop: number; txBytes: number; txPackets: number; txErrors: number; txDrop: number }

/** /proc/net/dev, without loopback and the container plumbing nobody wants charted. */
export function parseNetDev(text: string): Map<string, NetCounters> {
  const out = new Map<string, NetCounters>()
  for (const line of text.split('\n')) {
    const m = /^\s*([^:\s]+):\s*(.*)$/.exec(line)
    if (!m) continue
    const iface = m[1] as string
    if (iface === 'lo' || /^(veth|docker|br-|virbr|tun|tap)/.test(iface)) continue
    const n = (m[2] as string).trim().split(/\s+/).map(Number)
    out.set(iface, {
      rxBytes: n[0] ?? 0, rxPackets: n[1] ?? 0, rxErrors: n[2] ?? 0, rxDrop: n[3] ?? 0,
      txBytes: n[8] ?? 0, txPackets: n[9] ?? 0, txErrors: n[10] ?? 0, txDrop: n[11] ?? 0,
    })
  }
  return out
}

export function parseSockstat(text: string | null): { inUse: number; timeWait: number } {
  if (!text) return { inUse: 0, timeWait: 0 }
  const m = /^TCP: inuse (\d+) orphan \d+ tw (\d+)/m.exec(text)
  return m ? { inUse: Number(m[1]), timeWait: Number(m[2]) } : { inUse: 0, timeWait: 0 }
}

// ── cgroups ──────────────────────────────────────────────────────────────────

export type CgroupReading = {
  cpuUsec: number
  throttledUsec: number
  memBytes: number
  /** memory.max, or null for "max". */
  memMax: number | null
  anonBytes: number
  fileBytes: number
  oomKills: number
  readBytes: number
  writeBytes: number
  readOps: number
  writeOps: number
  procs: number
  psiCpu: number
  psiMem: number
  psiIo: number
}

function keyed(text: string | null): Record<string, number> {
  const out: Record<string, number> = {}
  for (const line of (text ?? '').split('\n')) {
    const [k, v] = line.trim().split(/\s+/)
    if (k && v !== undefined) out[k] = Number(v)
  }
  return out
}

/** io.stat summed over every device: "8:0 rbytes=1 wbytes=2 rios=3 wios=4 ...". */
export function parseIoStat(text: string | null): { readBytes: number; writeBytes: number; readOps: number; writeOps: number } {
  const sum = { readBytes: 0, writeBytes: 0, readOps: 0, writeOps: 0 }
  for (const line of (text ?? '').split('\n')) {
    for (const [, k, v] of line.matchAll(/(\w+)=(\d+)/g)) {
      if (k === 'rbytes') sum.readBytes += Number(v)
      else if (k === 'wbytes') sum.writeBytes += Number(v)
      else if (k === 'rios') sum.readOps += Number(v)
      else if (k === 'wios') sum.writeOps += Number(v)
    }
  }
  return sum
}

/** One cgroup directory, or null when it does not exist (a site not yet in its slice, a stopped unit). */
export function readCgroup(proc: Proc, dir: string): CgroupReading | null {
  const memCurrent = proc.read(`${dir}/memory.current`)
  if (memCurrent === null) return null
  const cpu = keyed(proc.read(`${dir}/cpu.stat`))
  const mem = keyed(proc.read(`${dir}/memory.stat`))
  const events = keyed(proc.read(`${dir}/memory.events`))
  const max = (proc.read(`${dir}/memory.max`) ?? 'max').trim()
  const io = parseIoStat(proc.read(`${dir}/io.stat`))
  return {
    cpuUsec: cpu.usage_usec ?? 0,
    throttledUsec: cpu.throttled_usec ?? 0,
    memBytes: Number(memCurrent.trim()) || 0,
    memMax: max === 'max' ? null : Number(max) || null,
    anonBytes: mem.anon ?? 0,
    fileBytes: mem.file ?? 0,
    oomKills: events.oom_kill ?? 0,
    ...io,
    procs: Number((proc.read(`${dir}/pids.current`) ?? '0').trim()) || 0,
    psiCpu: parsePressure(proc.read(`${dir}/cpu.pressure`)).some,
    psiMem: parsePressure(proc.read(`${dir}/memory.pressure`)).some,
    psiIo: parsePressure(proc.read(`${dir}/io.pressure`)).some,
  }
}

export function addCgroups(a: CgroupReading | null, b: CgroupReading | null): CgroupReading | null {
  if (!a) return b
  if (!b) return a
  return {
    cpuUsec: a.cpuUsec + b.cpuUsec,
    throttledUsec: a.throttledUsec + b.throttledUsec,
    memBytes: a.memBytes + b.memBytes,
    memMax: a.memMax ?? b.memMax,
    anonBytes: a.anonBytes + b.anonBytes,
    fileBytes: a.fileBytes + b.fileBytes,
    oomKills: a.oomKills + b.oomKills,
    readBytes: a.readBytes + b.readBytes,
    writeBytes: a.writeBytes + b.writeBytes,
    readOps: a.readOps + b.readOps,
    writeOps: a.writeOps + b.writeOps,
    procs: a.procs + b.procs,
    psiCpu: Math.max(a.psiCpu, b.psiCpu),
    psiMem: Math.max(a.psiMem, b.psiMem),
    psiIo: Math.max(a.psiIo, b.psiIo),
  }
}

/**
 * The systemd slice a site's units and builds run in: cactus-<site>.slice under
 * cactus.slice. A dash in a slice name means "child of", so a site called
 * tiller-well has its dash escaped - otherwise it would be filed under a slice
 * called cactus-tiller, which is another site's.
 */
export function siteSlice(siteId: string): string {
  return `cactus-${siteId.replace(/-/g, '\\x2d')}.slice`
}

// ── Temperatures ─────────────────────────────────────────────────────────────

/** The hottest sensor of each hwmon chip, in °C. */
export function readTemps(proc: Proc): { chip: string; c: number }[] {
  const out: { chip: string; c: number }[] = []
  for (const hw of proc.list('/sys/class/hwmon')) {
    const dir = `/sys/class/hwmon/${hw}`
    const chip = (proc.read(`${dir}/name`) ?? hw).trim()
    let hottest = -Infinity
    for (const file of proc.list(dir)) {
      if (!/^temp\d+_input$/.test(file)) continue
      const milli = Number((proc.read(`${dir}/${file}`) ?? '').trim())
      if (Number.isFinite(milli) && milli > 0 && milli < 150_000) hottest = Math.max(hottest, milli / 1000)
    }
    if (hottest > -Infinity) out.push({ chip, c: Math.round(hottest * 10) / 10 })
  }
  return out
}

// ── systemctl show ───────────────────────────────────────────────────────────

export type UnitState = { id: string; active: boolean; state: string; memBytes: number | null; cpuNsec: number | null; restarts: number; since: number | null }

/** `systemctl show -p Id,ActiveState,SubState,MemoryCurrent,CPUUsageNSec,NRestarts,ActiveEnterTimestampMonotonic a b c`. */
export function parseSystemctlShow(text: string, bootAtMs: number): UnitState[] {
  const out: UnitState[] = []
  for (const block of text.split(/\n\s*\n/)) {
    const f: Record<string, string> = {}
    for (const line of block.split('\n')) {
      const eq = line.indexOf('=')
      if (eq > 0) f[line.slice(0, eq)] = line.slice(eq + 1)
    }
    if (!f.Id) continue
    const num = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : null)
    const mono = num(f.ActiveEnterTimestampMonotonic)
    out.push({
      id: f.Id,
      active: f.ActiveState === 'active',
      state: f.SubState ? `${f.ActiveState}/${f.SubState}` : (f.ActiveState ?? 'unknown'),
      // systemd says 18446744073709551615 ("[not set]") when it does not track it.
      memBytes: f.MemoryCurrent && f.MemoryCurrent.length < 19 ? num(f.MemoryCurrent) : null,
      cpuNsec: f.CPUUsageNSec && f.CPUUsageNSec.length < 19 ? num(f.CPUUsageNSec) : null,
      restarts: num(f.NRestarts) ?? 0,
      since: mono && mono > 0 ? Math.round(bootAtMs + mono / 1000) : null,
    })
  }
  return out
}

// ── ss ───────────────────────────────────────────────────────────────────────

/** `ss -H -tulpn`: everything listening, with the program when ss can tell. */
export function parseSs(text: string): { proto: string; address: string; port: number; process: string | null }[] {
  const out: { proto: string; address: string; port: number; process: string | null }[] = []
  const seen = new Set<string>()
  for (const line of text.split('\n')) {
    const f = line.trim().split(/\s+/)
    if (f.length < 5) continue
    const proto = f[0] as string
    const local = f[4] as string
    const colon = local.lastIndexOf(':')
    if (colon < 0) continue
    const address = local.slice(0, colon).replace(/^\[|\]$/g, '').replace(/%.*$/, '')
    const port = Number(local.slice(colon + 1))
    if (!Number.isInteger(port)) continue
    const program = /users:\(\("([^"]+)"/.exec(line)
    const key = `${proto}:${address}:${port}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ proto, address, port, process: program ? (program[1] as string) : null })
  }
  return out
}

/** Whether an address only the box itself can reach. */
export function isLoopback(address: string): boolean {
  return address.startsWith('127.') || address === '::1' || address === 'localhost'
}
