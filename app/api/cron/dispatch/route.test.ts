import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Two dispatcher ticks can overlap (a minute tick behind a long job, a retry, Run now
// on Settings > Schedules). The stamp before each call is also the claim, so only the
// tick that still sees the lastRunAt it read may call the job.

const { findMany, updateMany, update, upsert, deleteMany, callCronJob } = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
  callCronJob: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: { cronRun: { findMany, updateMany, update, upsert, deleteMany } },
}))
vi.mock('@/lib/cron/run', () => ({ callCronJob }))
vi.mock('@/lib/config/env', () => ({ getSiteUrlOrNull: () => 'https://site.example' }))
vi.mock('@/lib/cron/jobs', () => ({
  listCronJobs: async () => [{ path: '/api/cron/members/purge', schedule: '* * * * *', module: null }],
}))

import { GET } from './route'

function tick(): Promise<Response> {
  return GET(new NextRequest('https://site.example/api/cron/dispatch', { headers: { authorization: 'Bearer s3cret' } }))
}

const lastRunAt = new Date(Date.now() - 10 * 60_000)

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 's3cret'
  findMany.mockResolvedValue([{ path: '/api/cron/members/purge', lastRunAt }])
  update.mockResolvedValue({})
  callCronJob.mockResolvedValue({ status: 'ran' })
})

describe('cron dispatcher claim', () => {
  it('claims the job against the lastRunAt it read, then runs it', async () => {
    updateMany.mockResolvedValue({ count: 1 })
    const body = (await (await tick()).json()) as { ran: number; skipped: number }
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { path: '/api/cron/members/purge', lastRunAt } }),
    )
    expect(callCronJob).toHaveBeenCalledTimes(1)
    expect(body.ran).toBe(1)
    expect(body.skipped).toBe(0)
  })

  it('does not call a job another tick has already claimed', async () => {
    updateMany.mockResolvedValue({ count: 0 })
    const body = (await (await tick()).json()) as { ran: number; skipped: number }
    expect(callCronJob).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(body.ran).toBe(0)
    expect(body.skipped).toBe(1)
  })
})
