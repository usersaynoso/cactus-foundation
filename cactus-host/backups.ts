// Automatic database backups, run by cactus-host itself on each database's own
// schedule, and the settings a site changes from its Backup & restore screen.
//
// A schedule lives beside the database's destination in databases.json (db.ts). The
// scheduler's minute tick asks whether each scheduled database has a run due; a due one
// is dumped (pg_dump -Fc, lowest priority, exactly as `cactus-host db backup`), copied
// to its destination, and copies older than its keepDays are deleted from there. Only
// one backup runs at a time, so a big database never has a small one queued behind it
// fighting over the disk, and a run that is still going is never started twice.
//
// WHERE THE COPIES GO
//
// A site picks a folder in its own bucket - the one its storage key in its env file
// opens - and never names an rclone remote. cactus-host makes a remote from that key
// (`b2-<site>` for Backblaze B2, using rclone's native b2 backend because B2's S3
// endpoint refuses writes on some accounts; `s3-<site>` for the rest) or reuses one of
// that name already holding the same key, and records `<remote>:<bucket>/<folder>`. So
// a site can only ever send its database to its own storage: the folder is the one
// thing it chooses. A remote of that name holding a DIFFERENT key is refused rather than
// rewritten, because whoever set it up by hand may have a reason.
//
// The key goes into root's rclone config by writing the file, never on a command line,
// where any user on the box could read it from the process list.
//
// A folder inside `media/` is refused: that part of a bucket is served to the public by
// the media Worker, and a backup holds every password hash and secret the site has.

import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Databases } from './db.ts'
import { parseEnv } from './env-file.ts'
import { HostError, type Host } from './host.ts'
import {
  BACKUP_EVERY,
  DEFAULT_BACKUP_SCHEDULE,
  type BackupRun,
  type BackupSchedule,
  type BackupStorage,
  type SiteBackupRequest,
  type SiteBackupState,
} from './protocol.ts'
import { writeFileAtomic, type SiteRecord } from './store.ts'
import { mustRun } from './system.ts'

/** Dumps kept on the box itself, whatever keepDays says about the destination. */
const LOCAL_KEEP_DAYS = 7

/** A slot missed by more than this (the service was down) is skipped, not run late. */
const CATCH_UP_MS = 60 * 60_000

const HOUR = 60 * 60_000

// ── Schedules ─────────────────────────────────────────────────────────────────

/** A schedule from untrusted input, or a HostError saying what is wrong with it. */
export function parseSchedule(value: unknown): BackupSchedule {
  const v = value as Partial<BackupSchedule> | null
  if (!v || typeof v !== 'object') throw new HostError('"schedule" must be an object', 400)
  if (!BACKUP_EVERY.includes(v.every as BackupSchedule['every'])) {
    throw new HostError(`"schedule.every" must be one of ${BACKUP_EVERY.join(', ')}`, 400)
  }
  const whole = (n: unknown, min: number, max: number, field: string): number => {
    if (!Number.isInteger(n) || (n as number) < min || (n as number) > max) {
      throw new HostError(`"schedule.${field}" must be a whole number from ${min} to ${max}`, 400)
    }
    return n as number
  }
  return {
    every: v.every as BackupSchedule['every'],
    hour: whole(v.hour, 0, 23, 'hour'),
    minute: whole(v.minute, 0, 59, 'minute'),
    keepDays: whole(v.keepDays, 1, 3650, 'keepDays'),
  }
}

/**
 * The most recent moment at or before `now` that the schedule names, in UTC, or null
 * for 'off'. Pure, so the tests can walk a clock through it.
 */
export function lastSlot(schedule: BackupSchedule, now: number): number | null {
  if (schedule.every === 'off') return null
  const d = new Date(now)
  const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), schedule.hour, schedule.minute)
  if (schedule.every === 'daily') return today <= now ? today : today - 24 * HOUR
  if (schedule.every === 'weekly') {
    // Sunday is day 0.
    const sunday = today - d.getUTCDay() * 24 * HOUR
    return sunday <= now ? sunday : sunday - 7 * 24 * HOUR
  }
  const step = (schedule.every === '6h' ? 6 : 12) * HOUR
  // The first run of the day may fall after midnight's later runs: 21:00 every twelve
  // hours runs at 09:00 too. So count from the day's earliest run, not from `hour`.
  const first = today - Math.floor(schedule.hour / (step / HOUR)) * step
  let slot = first + Math.floor((now - first) / step) * step
  if (slot > now) slot -= step
  return slot
}

/** Whether a run is due now: a slot has passed since the last attempt, and not long ago. */
export function isDue(schedule: BackupSchedule, lastRunAt: number | null, now: number): boolean {
  const slot = lastSlot(schedule, now)
  if (slot === null) return false
  if (now - slot > CATCH_UP_MS) return false
  return lastRunAt === null || lastRunAt < slot
}

// ── Folders and destinations ──────────────────────────────────────────────────

/**
 * A folder inside a bucket, tidied ("/Backups/db/" is "Backups/db"), or a HostError.
 * The same characters rclone destinations may carry here (db.ts), so it always fits.
 */
export function checkFolder(raw: unknown): string {
  if (typeof raw !== 'string') throw new HostError('"folder" must be text', 400)
  const folder = raw.trim().replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/')
  if (!folder) throw new HostError('Pick a folder: backups are not kept loose at the top of the bucket', 400)
  const parts = folder.split('/')
  if (parts.some((p) => p === '.' || p === '..' || !/^[A-Za-z0-9_.-]+$/.test(p))) {
    throw new HostError('Folder names may use letters, digits, dots, dashes and underscores only', 400)
  }
  if (parts[0] === 'media') {
    throw new HostError('Everything under "media" is shown to the public. Pick a folder outside it: a backup holds every password and secret the site has.', 400)
  }
  return folder
}

/** `remote:bucket/folder` taken apart, or null for a destination of another shape. */
export function parseDestination(dest: string | null): SiteBackupState['location'] {
  if (!dest) return null
  const m = /^([^:]+):([^/]+)\/(.+)$/.exec(dest)
  return m ? { remote: m[1] as string, bucket: m[2] as string, folder: m[3] as string } : null
}

// ── rclone remotes ────────────────────────────────────────────────────────────

type RemoteSpec = {
  name: string
  bucket: string
  /** The section's settings, in order. */
  fields: Array<[string, string]>
  /** The setting that says whose key it is: a remote holding another key is not this site's. */
  identity: string
}

const BUCKET_PATTERN = /^[A-Za-z0-9._-]{3,63}$/

/** What rclone needs for a site's storage, from its env file. Throws a HostError naming what is missing. */
export function remoteSpec(siteId: string, storage: BackupStorage, env: Map<string, string>): RemoteSpec {
  const need = (key: string): string => {
    const value = (env.get(key) ?? '').trim()
    if (!value) throw new HostError(`${key} is not set in this site's settings on the server`, 400)
    if (/[\r\n]/.test(value)) throw new HostError(`${key} has a line break in it`, 400)
    return value
  }
  const named = (bucketKey: string, fields: Array<[string, string]>, identity: string): RemoteSpec => {
    const bucket = need(bucketKey)
    if (!BUCKET_PATTERN.test(bucket)) throw new HostError(`${bucketKey} is not a bucket name cactus-host can use`, 400)
    return { name: `${storage === 'B2' ? 'b2' : 's3'}-${siteId}`, bucket, fields, identity }
  }
  const s3 = (provider: string, prefix: string, extra: Array<[string, string]>): RemoteSpec =>
    named(`${prefix}_BUCKET_NAME`, [
      ['type', 's3'],
      ['provider', provider],
      ['access_key_id', need(`${prefix}_ACCESS_KEY_ID`)],
      ['secret_access_key', need(`${prefix}_SECRET_ACCESS_KEY`)],
      ...extra,
    ], 'access_key_id')

  switch (storage) {
    case 'B2':
      return named('B2_BUCKET_NAME', [
        ['type', 'b2'],
        ['account', need('B2_APPLICATION_KEY_ID')],
        ['key', need('B2_APPLICATION_KEY')],
        ['hard_delete', 'false'],
      ], 'account')
    case 'R2':
      return s3('Cloudflare', 'R2', [['endpoint', `https://${need('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`]])
    case 'S3':
      return s3('AWS', 'S3', [['region', (env.get('S3_REGION') ?? '').trim() || 'us-east-1']])
    case 'SPACES':
      return s3('DigitalOcean', 'SPACES', [['endpoint', `${need('SPACES_REGION')}.digitaloceanspaces.com`]])
    case 'WASABI':
      return s3('Wasabi', 'WASABI', [['endpoint', `s3.${need('WASABI_REGION')}.wasabisys.com`]])
    case 'MINIO':
      return s3('Minio', 'MINIO', [['endpoint', need('MINIO_ENDPOINT')]])
    default:
      throw new HostError('That storage cannot hold backups from this server', 400)
  }
}

/** rclone's ini file: section name to its settings. Comments and blank lines carry nothing. */
export function parseRcloneConfig(text: string): Map<string, Map<string, string>> {
  const sections = new Map<string, Map<string, string>>()
  let current: Map<string, string> | null = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) continue
    const header = /^\[(.+)\]$/.exec(line)
    if (header) {
      current = new Map()
      sections.set(header[1] as string, current)
      continue
    }
    const eq = line.indexOf('=')
    if (current && eq > 0) current.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim())
  }
  return sections
}

/**
 * The remote for a site's own storage: an existing one of the right name holding the
 * same key, or a new one written into root's rclone config. Throws when the name is
 * taken by a remote holding some other key.
 */
export function ensureRemote(configPath: string, spec: RemoteSpec): { name: string; created: boolean } {
  let text = ''
  try {
    text = readFileSync(configPath, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
  const existing = parseRcloneConfig(text).get(spec.name)
  const identity = spec.fields.find(([k]) => k === spec.identity)?.[1]
  if (existing) {
    if (existing.get(spec.identity) === identity) return { name: spec.name, created: false }
    throw new HostError(
      `This server already has a storage connection called ${spec.name} that uses a different key. Whoever runs the server needs to remove or rename it (rclone config) before this site can use its own.`,
      409
    )
  }
  const section = `[${spec.name}]\n${spec.fields.map(([k, v]) => `${k} = ${v}`).join('\n')}\n`
  const joined = text && !text.endsWith('\n') ? `${text}\n` : text
  writeFileAtomic(configPath, `${joined}${joined ? '\n' : ''}${section}`, 0o600)
  return { name: spec.name, created: true }
}

// ── The runner ────────────────────────────────────────────────────────────────

const runners = new WeakMap<Host, Backups>()

/** The one runner for a host, shared by the API and the scheduler so "is one running" has one answer. */
export function backupsFor(host: Host): Backups {
  let runner = runners.get(host)
  if (!runner) {
    runner = new Backups(host)
    runners.set(host, runner)
  }
  return runner
}

export class Backups {
  private readonly host: Host
  private readonly databases: Databases
  private readonly log: (message: string) => void
  private readonly queue: Array<{ name: string; trigger: BackupRun['trigger'] }> = []
  private readonly pending = new Set<string>()
  private running: string | null = null
  private idle: Promise<void> = Promise.resolve()

  constructor(host: Host, log: (message: string) => void = (m) => console.log(m)) {
    this.host = host
    this.databases = new Databases(host.config, host.system)
    this.log = log
  }

  /** Queues every scheduled database with a run due. Called by the scheduler each minute. */
  tick(at: Date): string[] {
    const queued: string[] = []
    for (const { name, schedule, lastRun } of this.databases.scheduled()) {
      if (isDue(schedule, lastRun?.at ?? null, at.getTime()) && this.enqueue(name, 'schedule')) queued.push(name)
    }
    return queued
  }

  /** Whether a backup of `name` is running or waiting to. */
  busy(name: string): boolean {
    return this.running === name || this.pending.has(name)
  }

  /** Resolves when nothing is running or queued. For the tests and a clean shutdown. */
  whenIdle(): Promise<void> {
    return this.idle
  }

  /** Queues one run of `name`. False when one is already running or waiting. */
  enqueue(name: string, trigger: BackupRun['trigger']): boolean {
    if (this.busy(name)) return false
    this.pending.add(name)
    this.queue.push({ name, trigger })
    if (this.running === null) this.idle = this.drain()
    return true
  }

  private async drain(): Promise<void> {
    for (let next = this.queue.shift(); next; next = this.queue.shift()) {
      this.pending.delete(next.name)
      this.running = next.name
      try {
        await this.runOne(next.name, next.trigger)
      } finally {
        this.running = null
      }
    }
  }

  private async runOne(name: string, trigger: BackupRun['trigger']): Promise<void> {
    const at = this.host.system.now()
    let run: BackupRun
    try {
      const { file, copiedTo } = await this.databases.backup(name)
      const sizeBytes = statSync(file).size
      const schedule = this.databases.schedule(name)
      await this.databases.pruneDestination(name, schedule.keepDays)
      this.pruneLocal(name)
      run = { at, finishedAt: this.host.system.now(), ok: true, sizeBytes, copiedTo, error: null, trigger }
      this.log(`[backup] ${name}: ${(sizeBytes / 1_048_576).toFixed(1)} MB${copiedTo ? `, copied to ${copiedTo}` : ', kept on this server only'}`)
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      run = { at, finishedAt: this.host.system.now(), ok: false, sizeBytes: null, copiedTo: null, error: error.slice(0, 2000), trigger }
      this.log(`[backup] ${name}: failed: ${error}`)
    }
    try {
      this.databases.recordRun(name, run)
    } catch (err) {
      this.log(`[backup] ${name}: could not record the run: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /** This database's dumps on the box older than LOCAL_KEEP_DAYS. Everyone else's are left alone. */
  private pruneLocal(name: string): void {
    const dir = this.host.config.backupDir
    const cutoff = this.host.system.now() - LOCAL_KEEP_DAYS * 24 * HOUR
    const pattern = new RegExp(`^${name}-\\d{8}T\\d{6}Z\\.dump$`)
    for (const file of readdirSync(dir)) {
      if (!pattern.test(file)) continue
      const path = join(dir, file)
      if (statSync(path).mtimeMs < cutoff) rmSync(path, { force: true })
    }
  }

  // ── A site's own settings ──────────────────────────────────────────────────

  private requireDatabase(site: SiteRecord): string {
    const database = this.host.siteDatabase(site)
    if (!database) throw new HostError("This site's database is not on this server, so the server cannot back it up", 409)
    return database
  }

  state(site: SiteRecord): SiteBackupState {
    const database = this.host.siteDatabase(site)
    if (!database) {
      return { database: null, destination: null, location: null, schedule: DEFAULT_BACKUP_SCHEDULE, lastRun: null, running: false }
    }
    const destination = this.databases.destination(database)
    return {
      database,
      destination,
      location: parseDestination(destination),
      schedule: this.databases.schedule(database),
      lastRun: this.databases.lastRun(database),
      running: this.busy(database),
    }
  }

  async save(site: SiteRecord, body: SiteBackupRequest): Promise<SiteBackupState> {
    const database = this.requireDatabase(site)
    // Everything is checked before anything is written, so a bad schedule never
    // leaves a new remote or destination behind it.
    const schedule = body.schedule === undefined ? null : parseSchedule(body.schedule)
    if (body.folder !== undefined) {
      if (!body.storage) throw new HostError('"storage" is needed with "folder": it says whose key opens the bucket', 400)
      const folder = checkFolder(body.folder)
      const env = parseEnv(readFileSync(this.host.store.paths(site.id).env, 'utf8'))
      const spec = remoteSpec(site.id, body.storage, env)
      const remote = ensureRemote(this.host.config.rcloneConfig, spec)
      // Proves the key opens the bucket before anything relies on it.
      await mustRun(this.host.system, `Checking ${remote.name} can reach ${spec.bucket}`, 'rclone', [
        'lsf', '--max-depth', '1', '--dirs-only', `${remote.name}:${spec.bucket}`,
      ]).catch((err: unknown) => {
        throw new HostError(err instanceof Error ? err.message : String(err), 400)
      })
      this.databases.setDestination(database, `${remote.name}:${spec.bucket}/${folder}`)
      this.log(`[backup] ${database}: destination is now ${remote.name}:${spec.bucket}/${folder}${remote.created ? ` (new remote ${remote.name})` : ''}`)
    }
    if (schedule) this.databases.setSchedule(database, schedule)
    return this.state(site)
  }

  /** Starts one backup of the site's database now. False when one is already under way. */
  runNow(site: SiteRecord): boolean {
    return this.enqueue(this.requireDatabase(site), 'manual')
  }
}
