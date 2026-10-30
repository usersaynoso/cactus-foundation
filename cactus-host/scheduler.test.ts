import { describe, expect, it } from 'vitest'
import { readCronLog } from './cron-log.ts'
import { Scheduler, siteCronJobs } from './scheduler.ts'
import { hostWithSite } from './testing.ts'

async function liveSite(env: Record<string, string> = { CRON_SECRET: 'tick-secret' }) {
  const ctx = hostWithSite({ env })
  const { build } = ctx.host.startBuild('shop')
  await ctx.host.waitForBuild(build.id)
  ctx.system.requests.length = 0
  return ctx
}

describe('the scheduler', () => {
  it('wakes the dispatcher on the schedule the live release asks for', async () => {
    const ctx = await liveSite()
    const scheduler = new Scheduler(ctx.host, () => {})
    // The fake release asks for */5.
    expect(await scheduler.tick(new Date('2026-10-30T12:05:00Z'))).toEqual(['shop'])
    expect(await scheduler.tick(new Date('2026-10-30T12:06:00Z'))).toEqual([])
    const [req] = ctx.system.requests
    expect(req).toMatchObject({
      port: 3100,
      path: '/api/cron/dispatch',
      headers: { Host: 'shop.example.com', Authorization: 'Bearer tick-secret' },
    })
  })

  it('does nothing for a site with no CRON_SECRET yet, or none live', async () => {
    const ctx = await liveSite({})
    const scheduler = new Scheduler(ctx.host, () => {})
    await scheduler.tick(new Date('2026-10-30T12:05:00Z'))
    expect(ctx.system.requests).toEqual([])
    const fresh = hostWithSite()
    expect(await new Scheduler(fresh.host, () => {}).tick(new Date('2026-10-30T12:00:00Z'))).toEqual([])
  })

  it('keeps what each tick did in the site\'s cron log, a failed answer included', async () => {
    const ctx = await liveSite()
    let answer = { status: 200, body: JSON.stringify({ ran: 1, failed: 0, outcomes: [{ path: '/api/cron/members/purge', module: null, status: 'ran' }] }) }
    ctx.system.answer = (req) => (req.path === '/api/cron/dispatch' ? answer : null)
    const scheduler = new Scheduler(ctx.host, () => {})
    await scheduler.tick(new Date('2026-10-30T12:05:00Z'))
    answer = { status: 500, body: 'Internal Server Error' }
    await scheduler.tick(new Date('2026-10-30T12:10:00Z'))
    const [failed, ok] = readCronLog(ctx.config, { sites: ['shop'], limit: 10 })
    expect(ok).toMatchObject({ at: Date.parse('2026-10-30T12:05:00Z'), httpStatus: 200, ran: 1, error: null })
    expect(ok?.outcomes).toEqual([{ path: '/api/cron/members/purge', module: null, status: 'ran' }])
    expect(failed).toMatchObject({ httpStatus: 500, error: 'The dispatcher answered 500: Internal Server Error' })
  })

  it('asks a live site for its jobs with its CRON_SECRET', async () => {
    const ctx = await liveSite()
    ctx.system.answer = (req) => req.path === '/api/cron/jobs'
      ? { status: 200, body: JSON.stringify({ tick: { schedule: '*/15 * * * *', label: 'Every 15 minutes' }, jobs: [
        { path: '/api/cron/members/purge', module: null, schedule: '0 3 * * *', label: 'Once a day', frequency: null, lastRunAt: '2026-10-30T03:00:00.000Z', lastStatus: 'ran', lastError: null, nextDueAt: '2026-10-31T03:00:00.000Z' },
      ] }) }
      : null
    const { tick, jobs } = await siteCronJobs(ctx.host, ctx.host.site('shop'))
    expect(tick).toEqual({ schedule: '*/15 * * * *', label: 'Every 15 minutes' })
    expect(jobs).toEqual([{ path: '/api/cron/members/purge', module: null, schedule: '0 3 * * *', label: 'Once a day', frequency: null, lastRunAt: Date.parse('2026-10-30T03:00:00Z'), lastStatus: 'ran', lastError: null, nextDueAt: Date.parse('2026-10-31T03:00:00Z') }])
    expect(ctx.system.requests.at(-1)?.headers.Authorization).toBe('Bearer tick-secret')
  })

  it('says plainly when a site is too old to list its jobs', async () => {
    const ctx = await liveSite()
    ctx.system.answer = (req) => (req.path === '/api/cron/jobs' ? { status: 404, body: '' } : null)
    await expect(siteCronJobs(ctx.host, ctx.host.site('shop'))).rejects.toThrow(/too old to list its jobs/)
  })
})
