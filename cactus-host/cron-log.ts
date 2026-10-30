// What every site's cron dispatcher did, tick by tick: one JSON line per wake in
// <stateDir>/logs/<site>/cron.jsonl, written by the scheduler from the dispatcher's own
// answer. A site keeps only the last run of each job in its database, so this is the
// one place a failure from yesterday morning can still be seen. Root only, like the
// build logs beside it, and trimmed so it never grows past a few weeks of ticks.

import { appendFileSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import type { HostConfig } from './config.ts'
import type { CronOutcome, CronTickEntry } from './protocol.ts'
import { sitePaths, writeFileAtomic } from './store.ts'

/** Past this the file is cut back to its newest KEEP_LINES lines. */
const MAX_BYTES = 4 * 1024 * 1024
const KEEP_LINES = 3000
const MAX_DETAIL_CHARS = 500

const STATUSES: ReadonlyArray<CronOutcome['status']> = ['ran', 'failed', 'seeded', 'deferred']

/**
 * A tick entry from what the dispatcher sent back. Anything other than a 200 with the
 * dispatcher's JSON is a failed tick, with as much of the reason as the body gives.
 */
export function tickFromResponse(site: string, at: number, status: number | null, body: string, error: string | null = null): CronTickEntry {
  const entry: CronTickEntry = { at, site, httpStatus: status, error, elapsedMs: null, ran: 0, failed: 0, deferred: 0, seeded: 0, outcomes: [] }
  if (status === null) return entry
  let data: Record<string, unknown> | null = null
  try {
    const parsed: unknown = JSON.parse(body)
    if (parsed && typeof parsed === 'object') data = parsed as Record<string, unknown>
  } catch {
    data = null
  }
  if (status !== 200) {
    const said = typeof data?.error === 'string' ? data.error : body.replace(/\s+/g, ' ').trim()
    entry.error = `The dispatcher answered ${status}${said ? `: ${said.slice(0, MAX_DETAIL_CHARS)}` : ''}`
    return entry
  }
  if (!data || !Array.isArray(data.outcomes)) {
    entry.error = 'The dispatcher answered 200 without its report'
    return entry
  }
  const count = (key: string) => (typeof data[key] === 'number' ? (data[key] as number) : 0)
  entry.ran = count('ran')
  entry.failed = count('failed')
  entry.deferred = count('deferred')
  entry.seeded = count('seeded')
  entry.elapsedMs = typeof data.elapsedMs === 'number' ? data.elapsedMs : null
  for (const raw of data.outcomes as unknown[]) {
    const o = raw as Record<string, unknown>
    if (typeof o?.path !== 'string' || !STATUSES.includes(o.status as CronOutcome['status'])) continue
    entry.outcomes.push({
      path: o.path,
      module: typeof o.module === 'string' ? o.module : null,
      status: o.status as CronOutcome['status'],
      ...(typeof o.detail === 'string' && o.detail ? { detail: o.detail.slice(0, MAX_DETAIL_CHARS) } : {}),
    })
  }
  return entry
}

export function appendCronTick(config: HostConfig, entry: CronTickEntry): void {
  const path = sitePaths(config, entry.site).cronLog
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  appendFileSync(path, JSON.stringify(entry) + '\n', { mode: 0o600 })
  if (statSync(path).size > MAX_BYTES) {
    const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean)
    writeFileAtomic(path, lines.slice(-KEEP_LINES).join('\n') + '\n')
  }
}

export type CronLogQuery = {
  /** Only these sites; every one given when absent. */
  sites: string[]
  limit: number
  /** Only ticks that failed as a whole or had a job fail. */
  failedOnly?: boolean
  /** Only ticks strictly before this epoch ms, to page back through the log. */
  before?: number
}

export function tickFailed(entry: CronTickEntry): boolean {
  return entry.error !== null || entry.failed > 0 || entry.outcomes.some((o) => o.status === 'failed')
}

function readSiteLog(config: HostConfig, site: string): CronTickEntry[] {
  let text: string
  try {
    text = readFileSync(sitePaths(config, site).cronLog, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  const out: CronTickEntry[] = []
  for (const line of text.split('\n')) {
    if (!line) continue
    try {
      out.push(JSON.parse(line) as CronTickEntry)
    } catch {
      // A half-written line from a crash; the rest of the log still reads.
    }
  }
  return out
}

/** The newest ticks first, across the sites asked for. */
export function readCronLog(config: HostConfig, query: CronLogQuery): CronTickEntry[] {
  const all: CronTickEntry[] = []
  for (const site of query.sites) {
    for (const entry of readSiteLog(config, site)) {
      if (query.before !== undefined && entry.at >= query.before) continue
      if (query.failedOnly && !tickFailed(entry)) continue
      all.push(entry)
    }
  }
  return all.sort((a, b) => b.at - a.at).slice(0, query.limit)
}

/** The newest tick of one site, or null before its first. */
export function lastCronTick(config: HostConfig, site: string): CronTickEntry | null {
  const entries = readSiteLog(config, site)
  return entries.length > 0 ? (entries[entries.length - 1] as CronTickEntry) : null
}
