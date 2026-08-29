import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { listCronJobs, resolveDispatchSchedule, tickForSchedules } from '@/lib/cron/jobs'
import { CRON_FREQUENCIES, describeSchedule, frequencyOfSchedule, isCronFrequency } from '@/lib/cron/frequencies'
import { syncVercelJson } from '@/lib/modules/github'

// The Schedules tab behind Settings, and the one dropdown a module can host on its own
// settings page. Both read and write through here.
//
// Two things happen when a frequency changes. The database row is the easy half: the
// dispatcher reads it on its next tick and the job moves. The other half is that Vercel
// only wakes the dispatcher as often as vercel.json in the install's repository says,
// and Vercel reads that file when it creates a deployment - so a job set to run every
// five minutes on an hourly site needs a commit and a deploy before it means anything.
// That is done here, only when the tick actually moves, and reported back honestly so
// the admin is told a deploy has started rather than left wondering.

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!(await hasPermission(user, 'config.manage'))) return errorResponse('Forbidden', 403)

  const [jobs, runs, tick] = await Promise.all([
    listCronJobs(),
    prisma.cronRun.findMany({ select: { path: true, lastRunAt: true, lastStatus: true, lastError: true } }),
    resolveDispatchSchedule(),
  ])
  const runByPath = new Map(runs.map((r) => [r.path, r]))

  return NextResponse.json({
    // The tick, in the same words the dropdown uses, so the page can explain why a
    // five-minute job on an hourly site is not five-minutely yet.
    tick: { schedule: tick, label: describeSchedule(tick) },
    frequencies: CRON_FREQUENCIES,
    jobs: jobs.map((job) => {
      const run = runByPath.get(job.path)
      return {
        path: job.path,
        module: job.module,
        frequency: job.frequency,
        schedule: job.schedule,
        defaultSchedule: job.defaultSchedule,
        defaultLabel: describeSchedule(job.defaultSchedule),
        // Null where the author's own schedule is not one of the choices - a weekly
        // audit, say. The page offers "Default" for those and leaves them alone.
        defaultFrequency: frequencyOfSchedule(job.defaultSchedule),
        lastRunAt: run?.lastRunAt ?? null,
        lastStatus: run?.lastStatus ?? null,
        lastError: run?.lastError ?? null,
      }
    }),
  })
}

const patchSchema = z.object({
  path: z.string().min(1),
  // null is "put it back to whatever its author set", which is a deleted row rather
  // than a stored default - see the CronSchedule model.
  frequency: z.string().nullable(),
})

export async function PATCH(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!(await hasPermission(user, 'config.manage'))) return errorResponse('Forbidden', 403)

  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return errorResponse('Expected a job path and a frequency', 400)
  const { path, frequency } = parsed.data

  if (frequency !== null && !isCronFrequency(frequency)) {
    return errorResponse('That is not a frequency this site offers', 400)
  }

  // Only jobs this install actually has. Without this the table becomes a place to
  // store rows for paths that do not exist, and a typo is indistinguishable from a
  // module that has been uninstalled.
  const before = await listCronJobs()
  const job = before.find((j) => j.path === path)
  if (!job) return errorResponse('No scheduled job with that path', 404)

  if (frequency === null) {
    await prisma.cronSchedule.deleteMany({ where: { path } })
  } else {
    await prisma.cronSchedule.upsert({
      where: { path },
      create: { path, frequency },
      update: { frequency },
    })
  }

  const previousTick = tickForSchedules(before.map((j) => j.schedule))
  const nextTick = await resolveDispatchSchedule()

  let deploy: 'not-needed' | 'triggered' | 'unavailable' = 'not-needed'
  let deployError: string | null = null
  if (previousTick !== nextTick) {
    try {
      const { committed } = await syncVercelJson()
      deploy = committed ? 'triggered' : 'not-needed'
    } catch (err) {
      // The setting is saved either way. A site with no GitHub App connected, or one
      // whose token has expired, keeps the choice and picks up the faster tick on its
      // next update - it is not a reason to refuse the change or to lose it.
      deploy = 'unavailable'
      deployError = err instanceof Error ? err.message : String(err)
      console.warn(`[cron] saved ${path} but could not update vercel.json: ${deployError}`)
    }
  }

  const after = await listCronJobs()
  const updated = after.find((j) => j.path === path)!

  return NextResponse.json({
    ok: true,
    job: { path: updated.path, frequency: updated.frequency, schedule: updated.schedule },
    tick: { schedule: nextTick, label: describeSchedule(nextTick) },
    tickChanged: previousTick !== nextTick,
    deploy,
    deployError,
  })
}
