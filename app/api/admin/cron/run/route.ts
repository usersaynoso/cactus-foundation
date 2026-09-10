import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { listCronJobs } from '@/lib/cron/jobs'
import { callCronJob, cronCallEnvironment } from '@/lib/cron/run'

// Run now, from Settings > Schedules.
//
// The same call the dispatcher makes, through the same helper, so a job run by
// hand behaves exactly as it does at three in the morning - and is recorded the
// same way, so "Last run" tells the truth about the last time it happened
// rather than the last time a timer said so.
//
// Running a job early does not move its schedule. The stamp it writes is what
// the dispatcher reads to decide when the job is next due, so a nightly job run
// at four o'clock is next due the following night, which is the answer a site
// owner expects from a button marked Run now.

// The job is given nearly all of it. Module routes are allowed 60 seconds by
// core's own catch-all and several are written to use most of that, so cutting
// one off at 25 would record a failure it had no way to avoid.
export const maxDuration = 60
const RESERVE_MS = 6_000

const schema = z.object({ path: z.string().min(1) })

export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!(await hasPermission(user, 'config.manage'))) return errorResponse('Forbidden', 403)

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return errorResponse('Expected a job path', 400)
  const { path } = parsed.data

  // Only jobs this install actually has. Without this the button becomes a way
  // to make the site call any address it hosts with its own cron token on.
  const jobs = await listCronJobs()
  const job = jobs.find((j) => j.path === path)
  if (!job) return errorResponse('No scheduled job with that path', 404)

  const env = cronCallEnvironment()
  if ('error' in env) return errorResponse(env.error, 503)

  // Stamped BEFORE the call, exactly as the dispatcher stamps it: a job that
  // hangs has still had its turn, and the row is what stops a second press
  // starting a second copy of a job that is still running.
  const startedAt = new Date()
  await prisma.cronRun.upsert({
    where: { path },
    create: { path, lastRunAt: startedAt, lastStatus: 'ran' },
    update: { lastRunAt: startedAt },
  })

  const { status, detail } = await callCronJob(path, {
    siteUrl: env.siteUrl,
    secret: env.secret,
    timeoutMs: maxDuration * 1000 - RESERVE_MS,
  })

  await prisma.cronRun.update({
    where: { path },
    data: { lastStatus: status, lastError: status === 'failed' ? (detail ?? 'failed') : null },
  })

  return NextResponse.json({
    ok: status === 'ran',
    job: { path, lastRunAt: startedAt.toISOString(), lastStatus: status, lastError: status === 'failed' ? (detail ?? 'failed') : null },
    detail: detail ?? null,
  })
}
