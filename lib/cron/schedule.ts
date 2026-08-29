// A five-field cron matcher, deliberately small and dependency-free.
//
// Core does not schedule anything with Vercel any more except the dispatcher (see
// lib/cron/jobs.ts for why). That means every other schedule - core's own and every
// module's - has to be evaluated here instead, so this file is the thing standing
// between "the site's retention policy runs nightly" and "it doesn't".
//
// Supports the subset every Cactus manifest and every Vercel cron expression has ever
// used: `*`, a number, a `a-b` range, a `a,b,c` list, and a `*/n` or `a-b/n` step, in
// the standard minute / hour / day-of-month / month / day-of-week order. Names (`MON`,
// `JAN`), `?`, `L`, `#` and seconds are not supported and are rejected loudly rather
// than quietly matching nothing - a schedule that never fires is the failure mode this
// whole change exists to remove.
//
// Everything is UTC, because Vercel triggers crons in UTC and a job that drifts by an
// hour twice a year is a bug nobody reports and everybody notices.

export class InvalidCronExpressionError extends Error {}

type Field = { values: Set<number>; restricted: boolean }

const RANGES: Array<{ name: string; min: number; max: number }> = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day-of-month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day-of-week', min: 0, max: 7 },
]

function parseField(raw: string, index: number): Field {
  const { name, min, max } = RANGES[index]!
  const values = new Set<number>()
  let restricted = false

  for (const part of raw.split(',')) {
    const [rangePart, stepPart] = part.split('/')
    if (stepPart !== undefined && !/^\d+$/.test(stepPart)) {
      throw new InvalidCronExpressionError(`Bad step in ${name} field: "${part}"`)
    }
    const step = stepPart === undefined ? 1 : Number(stepPart)
    if (step < 1) throw new InvalidCronExpressionError(`Step must be 1 or more in ${name} field: "${part}"`)

    let from: number
    let to: number
    if (rangePart === '*') {
      from = min
      to = max
      if (step !== 1) restricted = true
    } else if (/^\d+$/.test(rangePart ?? '')) {
      from = Number(rangePart)
      to = from
      restricted = true
    } else if (/^\d+-\d+$/.test(rangePart ?? '')) {
      const [a, b] = rangePart!.split('-').map(Number) as [number, number]
      from = a
      to = b
      restricted = true
    } else {
      throw new InvalidCronExpressionError(`Unsupported ${name} field: "${part}"`)
    }

    if (from < min || to > max || from > to) {
      throw new InvalidCronExpressionError(`${name} field out of range (${min}-${max}): "${part}"`)
    }
    for (let v = from; v <= to; v += step) values.add(v)
  }

  // Cron's ancient wart: Sunday is both 0 and 7. Normalise so a match test only ever
  // has to look for one of them.
  if (index === 4 && values.has(7)) values.add(0)

  if (values.size === 0) throw new InvalidCronExpressionError(`Empty ${name} field`)
  return { values, restricted }
}

export interface ParsedCron {
  minute: Field
  hour: Field
  dayOfMonth: Field
  month: Field
  dayOfWeek: Field
}

export function parseCronExpression(expression: string): ParsedCron {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) {
    throw new InvalidCronExpressionError(
      `Expected 5 cron fields, got ${fields.length}: "${expression}"`,
    )
  }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields.map((f, i) => parseField(f!, i)) as [
    Field, Field, Field, Field, Field,
  ]
  return { minute, hour, dayOfMonth, month, dayOfWeek }
}

// Does this expression fire at this exact minute?
//
// The day-of-month / day-of-week pair is the other cron wart: when BOTH are restricted
// they are ORed, not ANDed, so `0 0 1 * 1` means "the 1st, and every Monday". When only
// one is restricted the unrestricted one is ignored.
export function matchesMinute(parsed: ParsedCron, at: Date): boolean {
  if (!parsed.minute.values.has(at.getUTCMinutes())) return false
  if (!parsed.hour.values.has(at.getUTCHours())) return false
  if (!parsed.month.values.has(at.getUTCMonth() + 1)) return false

  const domHit = parsed.dayOfMonth.values.has(at.getUTCDate())
  const dowHit = parsed.dayOfWeek.values.has(at.getUTCDay())
  if (parsed.dayOfMonth.restricted && parsed.dayOfWeek.restricted) return domHit || dowHit
  if (parsed.dayOfMonth.restricted) return domHit
  if (parsed.dayOfWeek.restricted) return dowHit
  return true
}

// How far back a single tick will ever look. A site that has been asleep for a month
// should not walk 44,000 minutes per job to rediscover that yes, the nightly purge is
// due; and a job that missed thirty runs still only needs to run once now.
export const MAX_LOOKBACK_MS = 8 * 24 * 60 * 60 * 1000

// Did this expression fire at any point in (after, until]? That window - rather than
// "does it match right now" - is the whole point: the dispatcher is woken on Vercel's
// schedule, not on the job's, and on a Hobby plan that is once a day. Asking what the
// job would have done since it last ran is the only question that gives the same answer
// on both plans.
export function firedBetween(expression: string, after: Date, until: Date): boolean {
  const parsed = parseCronExpression(expression)
  const end = until.getTime()
  const start = Math.max(after.getTime(), end - MAX_LOOKBACK_MS)
  if (end <= start) return false

  // Walk whole minutes, starting at the first minute strictly after `after` and ending
  // at `until` inclusive.
  const first = Math.floor(start / 60_000) * 60_000 + 60_000
  for (let t = first; t <= end; t += 60_000) {
    if (matchesMinute(parsed, new Date(t))) return true
  }
  return false
}

// Cheap validity check for manifest review and tests.
export function isValidCronExpression(expression: string): boolean {
  try {
    parseCronExpression(expression)
    return true
  } catch {
    return false
  }
}

// The shortest gap between two consecutive fires, in whole minutes.
//
// This is what decides how often Vercel has to wake the dispatcher: a site whose
// fastest job runs every five minutes needs a five-minute tick, and one whose fastest
// is nightly is well served by the hourly tick it has always had. See
// dispatchScheduleForInterval in vercel-file.ts for the other half.
//
// Walked rather than reasoned about, because the fields interact (`*/20` in an hour
// field restricted to `0-6` is not a 20-minute job) and a wrong answer here means a
// job the owner asked for every minute quietly runs once an hour. Eight days is the
// window: enough to see two of anything weekly, and 11,520 cheap iterations of a set
// lookup, run only when the schedule set changes.
export const NO_REPEAT_MINUTES = 8 * 24 * 60

export function minIntervalMinutes(expression: string): number {
  const parsed = parseCronExpression(expression)
  // A fixed UTC Monday, so the answer never depends on the day this is asked. Leap
  // years and month lengths do not change the shortest gap of any expression this
  // parser accepts.
  const start = Date.UTC(2001, 0, 1)
  let previous: number | null = null
  let shortest = NO_REPEAT_MINUTES

  for (let minute = 0; minute < NO_REPEAT_MINUTES; minute += 1) {
    if (!matchesMinute(parsed, new Date(start + minute * 60_000))) continue
    if (previous !== null) {
      const gap = minute - previous
      if (gap < shortest) shortest = gap
      // Nothing can beat one minute, and most of the walk is spent proving that it
      // cannot. Stop as soon as the answer cannot improve.
      if (shortest === 1) return 1
    }
    previous = minute
  }
  return shortest
}
