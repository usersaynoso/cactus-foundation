// The frequency vocabulary the admin picks from, and the translation between it and
// the five-field cron expressions everything else in this folder speaks.
//
// WHY A VOCABULARY RATHER THAN A CRON BOX
//
// Every scheduled job on the site - core's five and each module's - ships with a
// schedule its author chose. That default is usually right, and where it isn't, the
// owner wants "check my mail more often", not "write me a cron expression". So the
// admin picks from this fixed list, core stores the CHOICE (`'15m'`), and the actual
// expression is rebuilt from the choice each time it is needed.
//
// Storing the choice rather than the expression matters on update: a module that
// changes its default from 03:40 to 04:10 moves the owner's "once a day" with it,
// because the anchor below is read from whatever the manifest currently declares. Had
// we stored `40 3 * * *`, the owner would have silently kept the old author's timing
// for ever.
//
// WHAT AN ANCHOR IS
//
// A job declared `40 3 * * *` wants to run at 40 minutes past, at 3am. Set it to "every
// 6 hours" and it should run at 03:40, 09:40, 15:40, 21:40 - not on the hour, and not
// at some time this file invented. So the minute-of-hour and hour-of-day are lifted out
// of the declared default and reused. Below the hour there is nowhere left to put the
// hour anchor, and at "every minute" nowhere to put either; that is the nature of the
// choice, not a shortcoming of the code.

import { parseCronExpression, InvalidCronExpressionError } from './schedule'

export const CRON_FREQUENCIES = [
  { value: '1m', label: 'Every minute', minutes: 1 },
  { value: '5m', label: 'Every 5 minutes', minutes: 5 },
  { value: '10m', label: 'Every 10 minutes', minutes: 10 },
  { value: '15m', label: 'Every 15 minutes', minutes: 15 },
  { value: '20m', label: 'Every 20 minutes', minutes: 20 },
  { value: '30m', label: 'Every 30 minutes', minutes: 30 },
  { value: '1h', label: 'Every hour', minutes: 60 },
  { value: '3h', label: 'Every 3 hours', minutes: 180 },
  { value: '6h', label: 'Every 6 hours', minutes: 360 },
  { value: '12h', label: 'Every 12 hours', minutes: 720 },
  { value: '24h', label: 'Once a day', minutes: 1440 },
] as const

export type CronFrequency = (typeof CRON_FREQUENCIES)[number]['value']

const BY_VALUE = new Map(CRON_FREQUENCIES.map((f) => [f.value as CronFrequency, f]))

export function isCronFrequency(value: unknown): value is CronFrequency {
  return typeof value === 'string' && BY_VALUE.has(value as CronFrequency)
}

export function frequencyMinutes(frequency: CronFrequency): number {
  return BY_VALUE.get(frequency)!.minutes
}

export function frequencyLabel(frequency: CronFrequency): string {
  return BY_VALUE.get(frequency)!.label
}

/** Minute-of-hour and hour-of-day a job would like to keep when its frequency changes. */
export interface CronAnchor {
  minute: number
  hour: number
}

// The earliest minute and hour the declared schedule fires at. An unrestricted field
// has no opinion, so it anchors at zero: `* * * * *` becomes "on the hour" the moment
// somebody slows it down, which is the only sensible reading of a job that never had a
// preference. Anything unparseable anchors at midnight rather than throwing - the
// caller is usually rendering a settings page, and a bad manifest should cost that
// page one odd-looking row, not the whole screen.
export function anchorFromSchedule(expression: string): CronAnchor {
  try {
    const parsed = parseCronExpression(expression)
    return {
      minute: parsed.minute.restricted ? Math.min(...parsed.minute.values) : 0,
      hour: parsed.hour.restricted ? Math.min(...parsed.hour.values) : 0,
    }
  } catch {
    return { minute: 0, hour: 0 }
  }
}

// The expression a frequency means for a job with this anchor.
//
// The multi-hour steps are written as an explicit hour list rather than `3/6`, which is
// a form the parser in schedule.ts does not accept (and which Vercel's own docs never
// use). A list also keeps the anchor: `40 3,9,15,21 * * *` is 6-hourly starting from
// the author's 3am, where `40 */6 * * *` would have quietly moved it to midnight.
export function scheduleForFrequency(frequency: CronFrequency, anchor: CronAnchor): string {
  const minutes = frequencyMinutes(frequency)

  if (minutes === 1) return '* * * * *'
  if (minutes < 60) return `*/${minutes} * * * *`
  if (minutes === 60) return `${anchor.minute} * * * *`
  if (minutes === 1440) return `${anchor.minute} ${anchor.hour} * * *`

  const step = minutes / 60
  const hours: number[] = []
  for (let h = anchor.hour % step; h < 24; h += step) hours.push(h)
  return `${anchor.minute} ${hours.join(',')} * * *`
}

// Which frequency, if any, an expression already is.
//
// Round-tripping rather than pattern-matching: rebuild each candidate from the
// expression's own anchor and see which one comes back identical. That answers the
// question the settings page actually asks - "is this default one of the choices I can
// offer, or something the author wrote that I must leave alone?" - and it stays correct
// on its own if the vocabulary ever grows. A weekly job (`0 4 * * 1`) matches nothing,
// which is the point: it keeps its own schedule until somebody deliberately changes it.
export function frequencyOfSchedule(expression: string): CronFrequency | null {
  const normalised = expression.trim().split(/\s+/).join(' ')
  const anchor = anchorFromSchedule(normalised)
  for (const { value } of CRON_FREQUENCIES) {
    if (scheduleForFrequency(value as CronFrequency, anchor) === normalised) return value as CronFrequency
  }
  return null
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// A schedule in words, for the "leave it as the author set it" option on the dropdown.
// Nobody managing a website should have to read a cron expression to find out what
// their site is doing, so the common shapes get sentences and only a genuinely exotic
// one falls back to the raw text.
export function describeSchedule(expression: string): string {
  const known = frequencyOfSchedule(expression)
  if (known) return frequencyLabel(known)

  try {
    const parsed = parseCronExpression(expression)
    if (parsed.dayOfWeek.restricted && parsed.dayOfMonth.values.size === 31) {
      const days = [...parsed.dayOfWeek.values].filter((d) => d < 7).sort()
      if (days.length === 1) return `Once a week, on ${DAY_NAMES[days[0]!]}`
      return `${days.length} days a week`
    }
  } catch (err) {
    if (!(err instanceof InvalidCronExpressionError)) throw err
  }
  return expression
}
