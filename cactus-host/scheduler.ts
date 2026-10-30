// Wakes each live site's cron dispatcher on the schedule its release asks for.
//
// Checked at the top of every minute. A site's request goes straight to its live
// slot's port - not through Cloudflare or Caddy, so a busy CDN never costs a tick -
// with the site's own Host header and `Authorization: Bearer $CRON_SECRET`, exactly
// the request Vercel's cron makes. A site whose last tick is still running is
// skipped rather than doubled up: the dispatcher's own budget decides how long a
// tick takes, and two at once would only fight over the same jobs.
//
// Whatever the dispatcher answers is kept in the site's cron log (cron-log.ts), job by
// job, which is what the Oasis Server screen's Scheduled Tasks tab reads.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cronMatches, DISPATCH_PATH, parseCron, readReleaseSchedule } from './cron.ts'
import { appendCronTick, tickFromResponse } from './cron-log.ts'
import { parseEnv } from './env-file.ts'
import type { Host } from './host.ts'
import type { CronJobSummary } from './protocol.ts'
import type { SiteRecord } from './store.ts'

/** Ticks are given this long before cactus-host stops waiting; the site carries on regardless. */
const TICK_TIMEOUT_MS = 15 * 60_000

/** Where a site's own job list is, from the Cactus that added it (app/api/cron/jobs). */
export const JOBS_PATH = '/api/cron/jobs'

/** The live release's CRON_SECRET, or undefined before a release that has one. */
function cronSecret(releaseDir: string): string | undefined {
  try {
    return parseEnv(readFileSync(join(releaseDir, '.cactus-env'), 'utf8')).get('CRON_SECRET') || undefined
  } catch {
    return undefined
  }
}

/** The headers Vercel's cron would send, so the site cannot tell cactus-host from it. */
function cronHeaders(site: SiteRecord, secret: string): Record<string, string> {
  return {
    Host: site.domains[0] ?? '127.0.0.1',
    'X-Forwarded-Proto': 'https',
    Authorization: `Bearer ${secret}`,
    'User-Agent': 'cactus-host-cron/1',
  }
}

const epoch = (value: unknown): number | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}
const textOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/**
 * A live site's scheduled jobs, asked of the site itself with its CRON_SECRET. Throws
 * with a plain reason when the site is not live, has no secret yet, or runs a Cactus
 * that predates the job list.
 */
export async function siteCronJobs(host: Host, site: SiteRecord): Promise<{ tick: { schedule: string; label: string } | null; jobs: CronJobSummary[] }> {
  if (!site.liveSlot) throw new Error('Not live')
  const secret = cronSecret(host.store.paths(site.id).slot(site.liveSlot))
  if (!secret) throw new Error('CRON_SECRET is not set in the live release yet')
  const res = await host.system.local({ port: site.ports[site.liveSlot], path: JOBS_PATH, headers: cronHeaders(site, secret), timeoutMs: 15_000 })
  if (res.status === 404) throw new Error('This site runs a Cactus too old to list its jobs. Update it to see them here.')
  type Report = { tick?: { schedule?: unknown; label?: unknown }; jobs?: unknown; error?: unknown }
  let data: Report | null
  try {
    data = JSON.parse(res.body) as Report | null
  } catch {
    data = null
  }
  if (res.status !== 200 || !data || !Array.isArray(data.jobs)) {
    throw new Error(typeof data?.error === 'string' ? data.error : `The site answered ${res.status}`)
  }
  const tick = typeof data.tick?.schedule === 'string'
    ? { schedule: data.tick.schedule, label: typeof data.tick.label === 'string' ? data.tick.label : data.tick.schedule }
    : null
  const jobs: CronJobSummary[] = []
  for (const raw of data.jobs as Array<Record<string, unknown>>) {
    if (typeof raw?.path !== 'string' || typeof raw.schedule !== 'string') continue
    jobs.push({
      path: raw.path,
      module: textOrNull(raw.module),
      schedule: raw.schedule,
      label: textOrNull(raw.label) ?? raw.schedule,
      frequency: textOrNull(raw.frequency),
      lastRunAt: epoch(raw.lastRunAt),
      lastStatus: textOrNull(raw.lastStatus),
      lastError: textOrNull(raw.lastError),
      nextDueAt: epoch(raw.nextDueAt),
    })
  }
  return { tick, jobs }
}

export class Scheduler {
  private readonly host: Host
  private readonly inFlight = new Set<string>()
  private timer: NodeJS.Timeout | null = null
  private readonly log: (message: string) => void

  constructor(host: Host, log: (message: string) => void = (m) => console.log(m)) {
    this.host = host
    this.log = log
  }

  start(): void {
    const schedule = () => {
      const now = Date.now()
      const untilNextMinute = 60_000 - (now % 60_000) + 50
      this.timer = setTimeout(() => {
        void this.tick(new Date())
        schedule()
      }, untilNextMinute)
    }
    schedule()
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  /** One pass over every site. Exposed for the tests. */
  async tick(at: Date): Promise<string[]> {
    const woken: string[] = []
    const jobs: Promise<void>[] = []
    for (const site of this.host.store.listSites()) {
      if (!site.liveSlot || this.inFlight.has(site.id)) continue
      const releaseDir = this.host.store.paths(site.id).slot(site.liveSlot)
      const schedule = readReleaseSchedule(releaseDir, (m) => this.log(`[${site.id}] ${m}`))
      if (!cronMatches(parseCron(schedule), at)) continue
      woken.push(site.id)
      jobs.push(this.wake(site, releaseDir, at.getTime()))
    }
    await Promise.all(jobs)
    return woken
  }

  private async wake(site: SiteRecord, releaseDir: string, at: number): Promise<void> {
    const secret = cronSecret(releaseDir)
    if (!secret) {
      this.log(`[${site.id}] cron: CRON_SECRET is not set in the live release yet - nothing to wake`)
      return
    }
    const port = site.ports[site.liveSlot as 'a' | 'b']
    this.inFlight.add(site.id)
    try {
      const res = await this.host.system.local({ port, path: DISPATCH_PATH, headers: cronHeaders(site, secret), timeoutMs: TICK_TIMEOUT_MS })
      this.log(`[${site.id}] cron: dispatcher answered ${res.status}`)
      this.record(tickFromResponse(site.id, at, res.status, res.body))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.log(`[${site.id}] cron: ${message}`)
      this.record(tickFromResponse(site.id, at, null, '', `The dispatcher did not answer: ${message}`))
    } finally {
      this.inFlight.delete(site.id)
    }
  }

  /** A log that cannot be written costs the history, never the tick. */
  private record(entry: ReturnType<typeof tickFromResponse>): void {
    try {
      appendCronTick(this.host.config, entry)
    } catch (err) {
      this.log(`[${entry.site}] cron: could not write the cron log: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
