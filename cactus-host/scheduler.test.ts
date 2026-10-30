import { describe, expect, it } from 'vitest'
import { Scheduler } from './scheduler.ts'
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
})
