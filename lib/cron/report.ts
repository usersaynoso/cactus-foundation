import { prisma } from '@/lib/db/prisma'
import { listCronJobs, resolveDispatchSchedule } from './jobs'
import { describeSchedule, frequencyOfSchedule } from './frequencies'
import { nextFireAfter } from './schedule'

// Every scheduled job on this site with how it last went: the one picture behind both
// Settings > Schedules and GET /api/cron/jobs, which is how cactus-host (and through it
// a server's Oasis screen) sees a site's jobs without a session on it.

export interface CronJobReport {
  path: string
  module: string | null
  frequency: string | null
  schedule: string
  /** The schedule in words. */
  label: string
  defaultSchedule: string
  defaultLabel: string
  defaultFrequency: string | null
  lastRunAt: Date | null
  lastStatus: string | null
  lastError: string | null
  /** When it next falls due; it runs on the first dispatcher tick after that. */
  nextDueAt: Date | null
}

export interface CronReport {
  tick: { schedule: string; label: string }
  jobs: CronJobReport[]
}

export async function cronReport(now: Date = new Date()): Promise<CronReport> {
  const [jobs, runs, tick] = await Promise.all([
    listCronJobs(),
    prisma.cronRun.findMany({ select: { path: true, lastRunAt: true, lastStatus: true, lastError: true } }),
    resolveDispatchSchedule(),
  ])
  const runByPath = new Map(runs.map((r) => [r.path, r]))

  return {
    // The tick, in the same words the dropdown uses, so the page can explain why a
    // five-minute job on an hourly site is not five-minutely yet.
    tick: { schedule: tick, label: describeSchedule(tick) },
    jobs: jobs.map((job) => {
      const run = runByPath.get(job.path)
      // A job not run yet is due from the moment the dispatcher first saw it.
      const from = run?.lastRunAt && run.lastRunAt > now ? run.lastRunAt : now
      return {
        path: job.path,
        module: job.module,
        frequency: job.frequency,
        schedule: job.schedule,
        label: describeSchedule(job.schedule),
        defaultSchedule: job.defaultSchedule,
        defaultLabel: describeSchedule(job.defaultSchedule),
        // Null where the author's own schedule is not one of the choices - a weekly
        // audit, say. The page offers "Default" for those and leaves them alone.
        defaultFrequency: frequencyOfSchedule(job.defaultSchedule),
        lastRunAt: run?.lastRunAt ?? null,
        lastStatus: run?.lastStatus ?? null,
        lastError: run?.lastError ?? null,
        nextDueAt: nextFireAfter(job.schedule, from),
      }
    }),
  }
}
