// Wakes each live site's cron dispatcher on the schedule its release asks for.
//
// Checked at the top of every minute. A site's request goes straight to its live
// slot's port - not through Cloudflare or Caddy, so a busy CDN never costs a tick -
// with the site's own Host header and `Authorization: Bearer $CRON_SECRET`, exactly
// the request Vercel's cron makes. A site whose last tick is still running is
// skipped rather than doubled up: the dispatcher's own budget decides how long a
// tick takes, and two at once would only fight over the same jobs.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cronMatches, DISPATCH_PATH, parseCron, readReleaseSchedule } from './cron.ts'
import { parseEnv } from './env-file.ts'
import type { Host } from './host.ts'
import type { SiteRecord } from './store.ts'

/** Ticks are given this long before cactus-host stops waiting; the site carries on regardless. */
const TICK_TIMEOUT_MS = 15 * 60_000

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
      jobs.push(this.wake(site, releaseDir))
    }
    await Promise.all(jobs)
    return woken
  }

  private async wake(site: SiteRecord, releaseDir: string): Promise<void> {
    let secret: string | undefined
    try {
      secret = parseEnv(readFileSync(join(releaseDir, '.cactus-env'), 'utf8')).get('CRON_SECRET')
    } catch {
      secret = undefined
    }
    if (!secret) {
      this.log(`[${site.id}] cron: CRON_SECRET is not set in the live release yet - nothing to wake`)
      return
    }
    const port = site.ports[site.liveSlot as 'a' | 'b']
    this.inFlight.add(site.id)
    try {
      const res = await this.host.system.local({
        port,
        path: DISPATCH_PATH,
        headers: {
          Host: site.domains[0] ?? '127.0.0.1',
          'X-Forwarded-Proto': 'https',
          Authorization: `Bearer ${secret}`,
          'User-Agent': 'cactus-host-cron/1',
        },
        timeoutMs: TICK_TIMEOUT_MS,
      })
      this.log(`[${site.id}] cron: dispatcher answered ${res.status}`)
    } catch (err) {
      this.log(`[${site.id}] cron: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      this.inFlight.delete(site.id)
    }
  }
}
