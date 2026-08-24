import { describe, it, expect } from 'vitest'
import {
  parseCronExpression,
  matchesMinute,
  firedBetween,
  isValidCronExpression,
  InvalidCronExpressionError,
  MAX_LOOKBACK_MS,
} from './schedule'

const utc = (iso: string) => new Date(`${iso}Z`)

describe('parseCronExpression', () => {
  it('rejects anything that is not five fields', () => {
    expect(() => parseCronExpression('0 3 * *')).toThrow(InvalidCronExpressionError)
    expect(() => parseCronExpression('0 0 3 * * *')).toThrow(InvalidCronExpressionError)
  })

  it('rejects the syntax it cannot honour rather than silently never firing', () => {
    expect(isValidCronExpression('0 3 * * MON')).toBe(false)
    expect(isValidCronExpression('0 3 ? * *')).toBe(false)
    expect(isValidCronExpression('0 3 L * *')).toBe(false)
    expect(isValidCronExpression('0 25 * * *')).toBe(false)
    expect(isValidCronExpression('0 3 * * 8')).toBe(false)
  })

  it('accepts every expression core and the shipped modules declare', () => {
    for (const expr of ['0 3 * * *', '0 7 * * 1', '0 * * * *', '5 * * * *', '40 2 * * *', '0 4 * * 1']) {
      expect(isValidCronExpression(expr)).toBe(true)
    }
  })
})

describe('matchesMinute', () => {
  it('matches an exact daily time in UTC', () => {
    const parsed = parseCronExpression('30 6 * * *')
    expect(matchesMinute(parsed, utc('2026-08-24T06:30:00'))).toBe(true)
    expect(matchesMinute(parsed, utc('2026-08-24T06:31:00'))).toBe(false)
    expect(matchesMinute(parsed, utc('2026-08-24T07:30:00'))).toBe(false)
  })

  it('treats day-of-week 0 and 7 as the same Sunday', () => {
    expect(matchesMinute(parseCronExpression('0 0 * * 7'), utc('2026-08-23T00:00:00'))).toBe(true)
    expect(matchesMinute(parseCronExpression('0 0 * * 0'), utc('2026-08-23T00:00:00'))).toBe(true)
  })

  it('ORs day-of-month with day-of-week when both are restricted', () => {
    // The 1st, and every Monday. 2026-09-01 is a Tuesday.
    const parsed = parseCronExpression('0 0 1 * 1')
    expect(matchesMinute(parsed, utc('2026-09-01T00:00:00'))).toBe(true) // the 1st
    expect(matchesMinute(parsed, utc('2026-09-07T00:00:00'))).toBe(true) // a Monday
    expect(matchesMinute(parsed, utc('2026-09-08T00:00:00'))).toBe(false)
  })

  it('handles lists, ranges and steps', () => {
    const parsed = parseCronExpression('0 0,12 * * *')
    expect(matchesMinute(parsed, utc('2026-08-24T12:00:00'))).toBe(true)
    expect(matchesMinute(parsed, utc('2026-08-24T06:00:00'))).toBe(false)

    const every6 = parseCronExpression('0 */6 * * *')
    expect(matchesMinute(every6, utc('2026-08-24T18:00:00'))).toBe(true)
    expect(matchesMinute(every6, utc('2026-08-24T17:00:00'))).toBe(false)

    const weekdays = parseCronExpression('0 9 * * 1-5')
    expect(matchesMinute(weekdays, utc('2026-08-24T09:00:00'))).toBe(true) // Monday
    expect(matchesMinute(weekdays, utc('2026-08-23T09:00:00'))).toBe(false) // Sunday
  })
})

describe('firedBetween', () => {
  it('is exclusive of the lower bound and inclusive of the upper', () => {
    // A job that ran exactly on its own tick must not immediately look due again.
    expect(firedBetween('0 3 * * *', utc('2026-08-24T03:00:00'), utc('2026-08-24T03:00:00'))).toBe(false)
    expect(firedBetween('0 3 * * *', utc('2026-08-23T03:00:00'), utc('2026-08-24T03:00:00'))).toBe(true)
  })

  it('finds a daily job across a once-a-day tick, whatever hour that tick lands on', () => {
    // The Hobby case: dispatcher woken at 14:00, job scheduled for 03:00.
    expect(firedBetween('0 3 * * *', utc('2026-08-23T14:00:00'), utc('2026-08-24T14:00:00'))).toBe(true)
  })

  it('does not fire an hourly job inside the same hour', () => {
    expect(firedBetween('0 * * * *', utc('2026-08-24T10:00:00'), utc('2026-08-24T10:59:00'))).toBe(false)
    expect(firedBetween('0 * * * *', utc('2026-08-24T10:00:00'), utc('2026-08-24T11:00:00'))).toBe(true)
  })

  it('holds a weekly job until its day comes round', () => {
    // 2026-08-24 is a Monday; the Sunday before it is the 23rd.
    expect(firedBetween('0 7 * * 1', utc('2026-08-21T07:00:00'), utc('2026-08-23T23:00:00'))).toBe(false)
    expect(firedBetween('0 7 * * 1', utc('2026-08-21T07:00:00'), utc('2026-08-24T07:00:00'))).toBe(true)
  })

  it('still fires after a long silence, without walking the whole gap', () => {
    const until = utc('2026-08-24T03:00:00')
    const ancient = new Date(until.getTime() - 400 * 24 * 60 * 60 * 1000)
    const startedAt = Date.now()
    expect(firedBetween('0 3 * * *', ancient, until)).toBe(true)
    expect(Date.now() - startedAt).toBeLessThan(500)
  })

  it('caps the lookback so a job missed for a year runs once, not a year of times', () => {
    // Nothing before the cap is considered, so a monthly job whose only firing in the
    // window predates the cap is not resurrected.
    const until = utc('2026-08-24T03:00:00')
    const beyondCap = new Date(until.getTime() - MAX_LOOKBACK_MS - 60_000)
    expect(firedBetween('0 3 24 7 *', beyondCap, until)).toBe(false)
  })

  it('returns false when the window is empty or inverted', () => {
    expect(firedBetween('* * * * *', utc('2026-08-24T10:00:00'), utc('2026-08-24T09:00:00'))).toBe(false)
  })
})
