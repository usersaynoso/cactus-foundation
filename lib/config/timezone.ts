// Pure timezone maths and formatting. NOTHING in this file may reach the
// database: it is imported by client components (an inbox list, an order card),
// and one import of `@/lib/config/site` from here drags Prisma into their
// bundle - which is exactly what the module build gate caught on the first
// attempt at this. The reader that looks the site's zone UP lives next door in
// `timezone.server.ts`.
// The fallback when a site has never picked one, and the answer whenever a
// stored value is not a zone this runtime knows. Never throw over a setting:
// a bad zone name should cost the reader an hour, not the whole page.
export const DEFAULT_TIMEZONE = 'UTC'

export function normaliseTimezone(value: string | null | undefined): string {
  if (!value) return DEFAULT_TIMEZONE
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value })
    return value
  } catch {
    return DEFAULT_TIMEZONE
  }
}

export function formatInSiteTimezone(
  date: Date | string | number,
  timezone: string,
  options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }
): string {
  const value = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(value.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    ...options,
    timeZone: normaliseTimezone(timezone),
  }).format(value)
}

// The calendar date an instant falls on in a timezone, as "YYYY-MM-DD". en-CA
// formats that way directly. Comparing two of these is how "is this today?" and
// "is this the same year?" get answered without a zone nudging either side of
// midnight - `Date#toDateString()` and `getFullYear()` both answer in the
// server's own zone, which is UTC and almost never the one being asked about.
export function calendarDateIn(date: Date | string | number, timezone: string): string {
  const value = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(value.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: normaliseTimezone(timezone) }).format(value)
}

// The offset (ms) a timezone was at on a given instant, derived by reading the
// instant back as wall-clock parts and diffing. Positive east of UTC.
function zoneOffsetMs(timezone: string, at: Date): number {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(at)
  } catch {
    return 0
  }
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - at.getTime()
}

// The instant a wall-clock "HH:MM" on calendar date `dateStr` ("YYYY-MM-DD")
// falls at in a timezone. Interprets the wall time as UTC, then corrects by the
// zone's offset at that instant - exact outside the one ambiguous hour of a DST
// change, which nothing here deliberately schedules into. Use it whenever a
// time of day has to mean the same thing to a reader as it does in the data:
// `setHours(9, 0, 0, 0)` on the server means 9am UTC, which is 10am in London
// for two thirds of the year.
export function instantAtWallClock(dateStr: string, hhmm: string, timezone: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = hhmm.split(':').map(Number)
  const guess = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0)
  const zone = normaliseTimezone(timezone)
  return new Date(guess - zoneOffsetMs(zone, new Date(guess)))
}

// Same instant, `days` whole calendar days later in the zone, at `hhmm`.
export function wallClockDaysAhead(from: Date, days: number, hhmm: string, timezone: string): Date {
  const [y, m, d] = calendarDateIn(from, timezone).split('-').map(Number)
  const shifted = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days))
  return instantAtWallClock(new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(shifted), hhmm, timezone)
}
