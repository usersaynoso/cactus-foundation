// Is a freshly started release fit to take traffic?
//
// Two requests, both straight to the release's own port, both carrying the site's
// real Host header so the site answers as it would to a visitor:
//   - /api/health must answer 200, which means the app is up AND can reach its
//     database;
//   - the home page must answer with anything below 500 - a redirect to the setup
//     wizard counts, a crash does not.
// A site that has no DATABASE_URL yet (its very first build, before setup) cannot
// pass the first, so there any well-formed answer from /api/health is accepted: the
// release is serving, which is all that can be asked of it.
//
// Three passes in a row are needed, a second apart, so a process that answers once
// and then falls over is not mistaken for a working one.

import type { System } from './system.ts'

export type HealthTarget = {
  port: number
  host: string
  /** False before setup has written DATABASE_URL. */
  expectsDatabase: boolean
}

export type HealthResult = { healthy: true } | { healthy: false; reason: string }

const PASSES_NEEDED = 3

async function probeOnce(system: System, target: HealthTarget): Promise<string | null> {
  const headers = { Host: target.host, 'X-Forwarded-Proto': 'https', 'User-Agent': 'cactus-host-health/1' }
  try {
    const health = await system.local({ port: target.port, path: '/api/health', headers, timeoutMs: 10_000 })
    let status: unknown
    try {
      status = (JSON.parse(health.body) as { status?: unknown }).status
    } catch {
      status = undefined
    }
    if (target.expectsDatabase ? health.status !== 200 : typeof status !== 'string') {
      return `/api/health answered ${health.status}${typeof status === 'string' ? ` (${status})` : ''}`
    }
    const home = await system.local({ port: target.port, path: '/', headers, timeoutMs: 60_000 })
    if (home.status >= 500) return `the home page answered ${home.status}`
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

export async function waitUntilHealthy(
  system: System,
  target: HealthTarget,
  timeoutMs: number,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<HealthResult> {
  const deadline = system.now() + timeoutMs
  let passes = 0
  let lastReason = 'it never answered'
  while (system.now() < deadline) {
    const failure = await probeOnce(system, target)
    if (failure === null) {
      passes++
      if (passes >= PASSES_NEEDED) return { healthy: true }
    } else {
      passes = 0
      lastReason = failure
    }
    await sleep(1_000)
  }
  return { healthy: false, reason: lastReason }
}
