import { describe, it, expect } from 'vitest'
import {
  CRON_FREQUENCIES,
  anchorFromSchedule,
  describeSchedule,
  frequencyOfSchedule,
  isCronFrequency,
  scheduleForFrequency,
  type CronFrequency,
} from './frequencies'
import { isValidCronExpression, minIntervalMinutes } from './schedule'
import { dispatchScheduleForInterval, DISPATCH_SCHEDULE } from './vercel-file'

describe('the frequency vocabulary', () => {
  it('offers exactly the intervals the admin is promised, fastest first', () => {
    expect(CRON_FREQUENCIES.map((f) => f.value)).toEqual([
      '1m', '5m', '10m', '15m', '20m', '30m', '1h', '3h', '6h', '12h', '24h',
    ])
  })

  it('builds an expression the dispatcher can actually evaluate, for every choice', () => {
    for (const { value } of CRON_FREQUENCIES) {
      for (const anchor of [{ minute: 0, hour: 0 }, { minute: 40, hour: 3 }, { minute: 59, hour: 23 }]) {
        expect(isValidCronExpression(scheduleForFrequency(value as CronFrequency, anchor))).toBe(true)
      }
    }
  })

  it('means what it says - the built expression really does fire that often', () => {
    for (const { value, minutes } of CRON_FREQUENCIES) {
      const schedule = scheduleForFrequency(value as CronFrequency, { minute: 40, hour: 3 })
      expect(minIntervalMinutes(schedule)).toBe(minutes)
    }
  })

  it('rejects anything that is not one of the choices', () => {
    expect(isCronFrequency('15m')).toBe(true)
    expect(isCronFrequency('7m')).toBe(false)
    expect(isCronFrequency('0 * * * *')).toBe(false)
    expect(isCronFrequency(null)).toBe(false)
  })
})

describe('anchors', () => {
  it('keeps the minute and hour the author chose', () => {
    expect(anchorFromSchedule('40 3 * * *')).toEqual({ minute: 40, hour: 3 })
    expect(anchorFromSchedule('15 * * * *')).toEqual({ minute: 15, hour: 0 })
    expect(anchorFromSchedule('* * * * *')).toEqual({ minute: 0, hour: 0 })
  })

  it('takes the earliest of a set rather than inventing one', () => {
    expect(anchorFromSchedule('30 6,18 * * *')).toEqual({ minute: 30, hour: 6 })
  })

  it('does not throw on a schedule it cannot read - a bad manifest costs one odd row', () => {
    expect(anchorFromSchedule('0 7 * * MON')).toEqual({ minute: 0, hour: 0 })
  })

  // The whole reason the choice is stored rather than the expression: a job set to
  // "every 6 hours" keeps its author's 3.40am, instead of being dragged to midnight.
  it('carries the author’s timing into a slower frequency', () => {
    expect(scheduleForFrequency('6h', anchorFromSchedule('40 3 * * *'))).toBe('40 3,9,15,21 * * *')
    expect(scheduleForFrequency('12h', anchorFromSchedule('40 3 * * *'))).toBe('40 3,15 * * *')
    expect(scheduleForFrequency('24h', anchorFromSchedule('40 3 * * *'))).toBe('40 3 * * *')
    expect(scheduleForFrequency('1h', anchorFromSchedule('40 3 * * *'))).toBe('40 * * * *')
  })

  it('wraps an hour anchor that does not fit the step, rather than skipping the first run', () => {
    // 22:00 on a 6-hourly step starts at 04:00 and still fires four times a day.
    expect(scheduleForFrequency('6h', { minute: 0, hour: 22 })).toBe('0 4,10,16,22 * * *')
  })
})

describe('recognising a schedule', () => {
  it('names the choice a declared schedule already is', () => {
    expect(frequencyOfSchedule('15 * * * *')).toBe('1h')
    expect(frequencyOfSchedule('40 3 * * *')).toBe('24h')
    expect(frequencyOfSchedule('*/15 * * * *')).toBe('15m')
    expect(frequencyOfSchedule('* * * * *')).toBe('1m')
  })

  it('says nothing rather than rounding a schedule it cannot offer', () => {
    // A weekly audit is not "once a day", and must not be quietly turned into one.
    expect(frequencyOfSchedule('0 4 * * 1')).toBeNull()
    expect(frequencyOfSchedule('*/7 * * * *')).toBeNull()
  })

  it('puts a schedule into words for the settings page', () => {
    expect(describeSchedule('15 * * * *')).toBe('Every hour')
    expect(describeSchedule('0 4 * * 1')).toBe('Once a week, on Monday')
    expect(describeSchedule('*/5 * * * *')).toBe('Every 5 minutes')
  })
})

describe('the dispatcher tick', () => {
  it('never wakes the site less often than its fastest job', () => {
    for (const { value, minutes } of CRON_FREQUENCIES) {
      const schedule = scheduleForFrequency(value as CronFrequency, { minute: 0, hour: 0 })
      const tick = dispatchScheduleForInterval(minIntervalMinutes(schedule))
      expect(minIntervalMinutes(tick)).toBeLessThanOrEqual(minutes)
    }
  })

  it('leaves an hourly site exactly as it was', () => {
    expect(dispatchScheduleForInterval(60)).toBe(DISPATCH_SCHEDULE)
    expect(dispatchScheduleForInterval(1440)).toBe(DISPATCH_SCHEDULE)
  })

  it('rounds an odd interval down, never up', () => {
    // A hand-written `*/7` manifest gets a five-minute tick: checking sooner than the
    // job needs costs nothing, checking later means it does not run when asked.
    expect(dispatchScheduleForInterval(7)).toBe('*/5 * * * *')
    expect(dispatchScheduleForInterval(45)).toBe('*/30 * * * *')
  })
})

describe('minIntervalMinutes', () => {
  it('reads the gap, not the field', () => {
    expect(minIntervalMinutes('0 * * * *')).toBe(60)
    expect(minIntervalMinutes('*/30 * * * *')).toBe(30)
    expect(minIntervalMinutes('0 0,12 * * *')).toBe(720)
  })

  it('is not fooled by a step inside a restricted hour', () => {
    // Fires every 20 minutes, but only between 1am and 2am: still a 20-minute job.
    expect(minIntervalMinutes('*/20 1 * * *')).toBe(20)
  })

  it('treats something that fires once a week as no repeat worth ticking for', () => {
    expect(minIntervalMinutes('0 4 * * 1')).toBe(7 * 24 * 60)
  })
})
