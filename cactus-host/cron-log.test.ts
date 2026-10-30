import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { appendCronTick, lastCronTick, readCronLog, tickFailed, tickFromResponse } from './cron-log.ts'
import { hostWithSite } from './testing.ts'

const REPORT = JSON.stringify({
  ok: true, jobs: 3, due: 2, ran: 1, failed: 1, deferred: 0, seeded: 1, pruned: 0, elapsedMs: 812,
  outcomes: [
    { path: '/api/cron/members/purge', module: null, status: 'ran' },
    { path: '/api/m/shop/cron/push', module: 'shop', status: 'failed', detail: 'HTTP 500 - The operation was aborted due to timeout' },
    { path: '/api/m/shop/cron/new', module: 'shop', status: 'seeded' },
  ],
})

describe('a tick from the dispatcher\'s answer', () => {
  it('keeps each job\'s outcome and the counts', () => {
    const entry = tickFromResponse('shop', 1000, 200, REPORT)
    expect(entry).toMatchObject({ site: 'shop', httpStatus: 200, error: null, elapsedMs: 812, ran: 1, failed: 1, seeded: 1 })
    expect(entry.outcomes).toHaveLength(3)
    expect(entry.outcomes[1]).toEqual({ path: '/api/m/shop/cron/push', module: 'shop', status: 'failed', detail: 'HTTP 500 - The operation was aborted due to timeout' })
    expect(tickFailed(entry)).toBe(true)
  })

  it('counts a non-200, a 200 with no report, and no answer at all as a failed tick', () => {
    expect(tickFromResponse('shop', 1, 401, '{"error":"Unauthorized"}').error).toBe('The dispatcher answered 401: Unauthorized')
    expect(tickFromResponse('shop', 1, 200, '<html></html>').error).toMatch(/without its report/)
    const silent = tickFromResponse('shop', 1, null, '', 'The dispatcher did not answer: timed out')
    expect(silent.error).toBe('The dispatcher did not answer: timed out')
    expect(tickFailed(silent)).toBe(true)
    expect(tickFailed(tickFromResponse('shop', 1, 200, JSON.stringify({ ran: 2, failed: 0, outcomes: [] })))).toBe(false)
  })
})

describe('the cron log', () => {
  it('reads back newest first across sites, filtered and paged', () => {
    const ctx = hostWithSite()
    ctx.host.store.saveSite({ ...ctx.site, id: 'blog', user: 'cactus-blog', domains: ['blog.example.com'] })
    appendCronTick(ctx.config, tickFromResponse('shop', 1000, 200, REPORT))
    appendCronTick(ctx.config, tickFromResponse('blog', 2000, 200, JSON.stringify({ ran: 1, outcomes: [{ path: '/api/cron/x', module: null, status: 'ran' }] })))
    appendCronTick(ctx.config, tickFromResponse('shop', 3000, 200, JSON.stringify({ ran: 0, outcomes: [] })))

    expect(readCronLog(ctx.config, { sites: ['shop', 'blog'], limit: 10 }).map((e) => e.at)).toEqual([3000, 2000, 1000])
    expect(readCronLog(ctx.config, { sites: ['blog'], limit: 10 }).map((e) => e.site)).toEqual(['blog'])
    expect(readCronLog(ctx.config, { sites: ['shop', 'blog'], limit: 10, failedOnly: true }).map((e) => e.at)).toEqual([1000])
    expect(readCronLog(ctx.config, { sites: ['shop', 'blog'], limit: 1, before: 3000 }).map((e) => e.at)).toEqual([2000])
    expect(lastCronTick(ctx.config, 'shop')?.at).toBe(3000)
    expect(lastCronTick(ctx.config, 'blog')?.at).toBe(2000)
  })

  it('skips a half-written line and answers empty before the first tick', () => {
    const ctx = hostWithSite()
    expect(readCronLog(ctx.config, { sites: ['shop'], limit: 10 })).toEqual([])
    expect(lastCronTick(ctx.config, 'shop')).toBeNull()
    appendCronTick(ctx.config, tickFromResponse('shop', 1000, 200, REPORT))
    const path = ctx.host.store.paths('shop').cronLog
    writeFileSync(path, readFileSync(path, 'utf8') + '{"at":20')
    expect(readCronLog(ctx.config, { sites: ['shop'], limit: 10 })).toHaveLength(1)
  })
})
