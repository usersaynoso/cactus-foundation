// The dispatcher tick, cactus-host's twin of Vercel's cron and Netlify's scheduled
// function. Each site has exactly one scheduled request - GET /api/cron/dispatch
// with `Authorization: Bearer $CRON_SECRET` - and the site's dispatcher decides
// everything else. How often it is woken comes from cactus-host.json in the RELEASE
// being served (Cactus writes it; lib/cron/server-file.ts), or, for a site moved off
// Vercel that has not written one yet, from the release's own vercel.json, so a tick change goes
// live with the build that carries it, as it does on the other two hosts.
//
// Only the five-field subset Cactus ever writes is needed (`*/N * * * *`, `* * * * *`),
// but the parser takes ordinary numbers, lists and ranges too, so a hand-written
// schedule in a test or an emergency means what it says. Times are UTC, as on Vercel.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const CRON_FILE = 'cactus-host.json'
export const DEFAULT_SCHEDULE = '*/30 * * * *'
export const DISPATCH_PATH = '/api/cron/dispatch'

type Field = Set<number>
export type CronExpression = { minute: Field; hour: Field; dom: Field; month: Field; dow: Field; domStar: boolean; dowStar: boolean }

const RANGES: Array<[number, number]> = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
]

function parseField(text: string, [min, max]: [number, number]): Field {
  const out = new Set<number>()
  for (const part of text.split(',')) {
    const [range = '', stepText] = part.split('/')
    const step = stepText === undefined ? 1 : Number(stepText)
    if (!Number.isInteger(step) || step < 1) throw new Error(`bad step in "${part}"`)
    let lo: number
    let hi: number
    if (range === '*') {
      lo = min
      hi = max
    } else if (range.includes('-')) {
      const [a, b] = range.split('-').map(Number)
      if (a === undefined || b === undefined) throw new Error(`bad range "${range}"`)
      lo = a
      hi = b
    } else {
      lo = Number(range)
      hi = stepText === undefined ? lo : max
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) {
      throw new Error(`"${part}" is out of range ${min}-${max}`)
    }
    for (let v = lo; v <= hi; v += step) out.add(v)
  }
  return out
}

export function parseCron(expression: string): CronExpression {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) throw new Error(`"${expression}" needs five fields`)
  const parsed = fields.map((f, i) => parseField(f, RANGES[i] as [number, number]))
  const dow = parsed[4] as Field
  if (dow.has(7)) dow.add(0)
  return {
    minute: parsed[0] as Field,
    hour: parsed[1] as Field,
    dom: parsed[2] as Field,
    month: parsed[3] as Field,
    dow,
    domStar: fields[2] === '*',
    dowStar: fields[4] === '*',
  }
}

/** Whether the expression fires in the UTC minute containing `at`. */
export function cronMatches(cron: CronExpression, at: Date): boolean {
  if (!cron.minute.has(at.getUTCMinutes()) || !cron.hour.has(at.getUTCHours())) return false
  if (!cron.month.has(at.getUTCMonth() + 1)) return false
  const domOk = cron.dom.has(at.getUTCDate())
  const dowOk = cron.dow.has(at.getUTCDay())
  // Standard cron: when both day fields are restricted, either may match.
  if (cron.domStar && cron.dowStar) return true
  if (cron.domStar) return dowOk
  if (cron.dowStar) return domOk
  return domOk || dowOk
}

/** A moved site's own Vercel cron file, which every Cactus install repo carries. */
export const VERCEL_FILE = 'vercel.json'

function scheduleIn(text: string): string {
  const data = JSON.parse(text) as { crons?: Array<{ path?: unknown; schedule?: unknown }> }
  const entry = data.crons?.find((c) => c.path === DISPATCH_PATH)
  if (typeof entry?.schedule !== 'string') throw new Error(`no ${DISPATCH_PATH} entry`)
  parseCron(entry.schedule)
  return entry.schedule
}

function readFileOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/**
 * The dispatcher schedule a release asks for. cactus-host.json wins. A release without
 * one - a site that has just moved off Vercel and has not had its first update on a
 * server write the file yet - keeps the cadence it already had, taken from the
 * release's own vercel.json. Nothing readable in either gets the default, so a site is
 * never left with no tick at all.
 */
export function readReleaseSchedule(releaseDir: string, warn: (message: string) => void = () => {}): string {
  for (const file of [CRON_FILE, VERCEL_FILE]) {
    const text = readFileOrNull(join(releaseDir, file))
    if (text === null) continue
    try {
      return scheduleIn(text)
    } catch (err) {
      // A cactus-host.json that is there but broken is a fault worth the default; a
      // vercel.json with no dispatcher entry (or none we can read) just means "no
      // cadence on record", so carry on quietly.
      if (file === CRON_FILE) {
        warn(`${CRON_FILE} in ${releaseDir} could not be read (${err instanceof Error ? err.message : err}); using ${DEFAULT_SCHEDULE}`)
        return DEFAULT_SCHEDULE
      }
      warn(`${VERCEL_FILE} in ${releaseDir} has no usable dispatcher schedule (${err instanceof Error ? err.message : err}); using ${DEFAULT_SCHEDULE}`)
    }
  }
  return DEFAULT_SCHEDULE
}
