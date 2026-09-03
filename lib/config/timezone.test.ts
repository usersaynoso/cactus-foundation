import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TIMEZONE,
  normaliseTimezone,
  formatInSiteTimezone,
  calendarDateIn,
  instantAtWallClock,
  wallClockDaysAhead,
} from './timezone'

describe('normaliseTimezone', () => {
  it('keeps a zone Intl accepts', () => {
    expect(normaliseTimezone('Europe/London')).toBe('Europe/London')
  })

  it('falls back rather than throwing on rubbish', () => {
    expect(normaliseTimezone('Middle/Earth')).toBe(DEFAULT_TIMEZONE)
    expect(normaliseTimezone('')).toBe(DEFAULT_TIMEZONE)
    expect(normaliseTimezone(null)).toBe(DEFAULT_TIMEZONE)
  })
})

describe('formatInSiteTimezone', () => {
  // 13:30 UTC on a summer day is 14:30 in London. This is the whole defect:
  // the same instant formatted on the server's own clock reads an hour early.
  const summerInstant = new Date('2026-07-01T13:30:00Z')

  it('shows British Summer Time an hour ahead of UTC', () => {
    expect(formatInSiteTimezone(summerInstant, 'Europe/London', { hour: '2-digit', minute: '2-digit' })).toBe('14:30')
    expect(formatInSiteTimezone(summerInstant, 'UTC', { hour: '2-digit', minute: '2-digit' })).toBe('13:30')
  })

  it('agrees with UTC in winter, when London has no offset', () => {
    const winterInstant = new Date('2026-01-15T13:30:00Z')
    expect(formatInSiteTimezone(winterInstant, 'Europe/London', { hour: '2-digit', minute: '2-digit' })).toBe('13:30')
  })

  it('returns an empty string for an unparseable date rather than "Invalid Date"', () => {
    expect(formatInSiteTimezone('not a date', 'Europe/London')).toBe('')
  })
})

describe('calendarDateIn', () => {
  it('rolls the date over at the zone midnight, not the UTC one', () => {
    // 23:30 UTC on 3 July is already half past midnight on the 4th in London.
    const instant = new Date('2026-07-03T23:30:00Z')
    expect(calendarDateIn(instant, 'Europe/London')).toBe('2026-07-04')
    expect(calendarDateIn(instant, 'UTC')).toBe('2026-07-03')
    expect(calendarDateIn(instant, 'America/New_York')).toBe('2026-07-03')
  })
})

describe('instantAtWallClock', () => {
  it('reads a wall-clock time as the zone means it', () => {
    expect(instantAtWallClock('2026-07-01', '09:00', 'Europe/London').toISOString()).toBe('2026-07-01T08:00:00.000Z')
    expect(instantAtWallClock('2026-01-15', '09:00', 'Europe/London').toISOString()).toBe('2026-01-15T09:00:00.000Z')
    expect(instantAtWallClock('2026-07-01', '09:00', 'UTC').toISOString()).toBe('2026-07-01T09:00:00.000Z')
  })
})

describe('wallClockDaysAhead', () => {
  it('lands on 9am the next morning in the zone, not 9am UTC', () => {
    const lateEvening = new Date('2026-07-03T21:00:00Z') // 22:00 in London
    expect(wallClockDaysAhead(lateEvening, 1, '09:00', 'Europe/London').toISOString()).toBe('2026-07-04T08:00:00.000Z')
  })

  it('counts the day from the zone own date, so a late instant does not skip one', () => {
    // 23:30 UTC is already the 4th in London, so "tomorrow" is the 5th there.
    const afterZoneMidnight = new Date('2026-07-03T23:30:00Z')
    expect(wallClockDaysAhead(afterZoneMidnight, 1, '09:00', 'Europe/London').toISOString()).toBe('2026-07-05T08:00:00.000Z')
  })

  it('crosses a month end', () => {
    expect(wallClockDaysAhead(new Date('2026-07-31T10:00:00Z'), 1, '09:00', 'Europe/London').toISOString()).toBe('2026-08-01T08:00:00.000Z')
  })
})
