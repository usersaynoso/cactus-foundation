import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { safeCompare } from '@/lib/auth/session'
import { getSiteUrlOrNull } from '@/lib/config/env'
import { listCronJobs, type CronJob } from '@/lib/cron/jobs'
import { firedBetween } from '@/lib/cron/schedule'

// The site's only Vercel cron entry. Everything core or a module wants scheduled hangs
// off this one tick - see lib/cron/jobs.ts for why it has to be one rather than
// twenty-odd.
//
// Vercel appends `Authorization: Bearer $CRON_SECRET` to its own cron requests when
// CRON_SECRET is set, which is the same check every core and module cron route makes,
// and the same header this route then sends on to them.

// Kept at Vercel's Hobby ceiling on purpose: asking for more than the plan allows is a
// deployment error, and the point of this whole change is that it works everywhere. The
// budget below means a long-running job costs the ones behind it a tick, not a day.
export const maxDuration = 60

// Wall-clock left over for writing the summary and returning cleanly.
const RESERVE_MS = 6_000
// Nothing gets the entire budget to itself; a job that hangs must not silently become
// the only job the site ever runs.
const MAX_PER_JOB_MS = 25_000

type JobOutcome = {
  path: string
  module: string | null
  status: 'ran' | 'failed' | 'seeded' | 'deferred'
  detail?: string
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })

  const auth = request.headers.get('authorization')
  if (!safeCompare(auth ?? '', `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const siteUrl = getSiteUrlOrNull()
  if (!siteUrl) return NextResponse.json({ error: 'SITE_URL is not configured' }, { status: 503 })

  const startedAt = Date.now()
  const deadlineAt = startedAt + maxDuration * 1000 - RESERVE_MS

  const jobs = await listCronJobs()
  const known = new Map(jobs.map((job) => [job.path, job]))
  const rows = await prisma.cronRun.findMany({ select: { path: true, lastRunAt: true } })
  const lastRunByPath = new Map(rows.map((row) => [row.path, row.lastRunAt]))

  const now = new Date()
  const outcomes: JobOutcome[] = []
  const due: Array<{ job: CronJob; lastRunAt: Date }> = []

  for (const job of jobs) {
    const lastRunAt = lastRunByPath.get(job.path)
    if (!lastRunAt) {
      // First sight. Record the moment rather than running: a freshly installed module,
      // or the first tick after this dispatcher ships, would otherwise fire every job on
      // the site at once - including the expensive ones - for no scheduled reason. From
      // the next tick it runs on its own schedule like everything else.
      // upsert, not create: two ticks overlapping (a Vercel retry, a manual poke) would
      // otherwise collide on the unique path and 500 the whole dispatcher.
      await prisma.cronRun.upsert({
        where: { path: job.path },
        create: { path: job.path, lastRunAt: now, lastStatus: 'seeded' },
        update: {},
      })
      outcomes.push({ path: job.path, module: job.module, status: 'seeded' })
      continue
    }
    if (firedBetween(job.schedule, lastRunAt, now)) due.push({ job, lastRunAt })
  }

  // Longest-waiting first. With a fixed budget and a slow job in the set, this is what
  // stops the same job at the front of the list eating every tick while the ones behind
  // it never run at all.
  due.sort((a, b) => a.lastRunAt.getTime() - b.lastRunAt.getTime())

  let ran = 0
  let failed = 0
  for (const { job } of due) {
    const remaining = deadlineAt - Date.now()
    if (remaining <= 1_000) {
      // Out of budget. Left untouched on purpose: lastRunAt is unchanged, so it is still
      // due on the next tick and moves to the front of the queue.
      outcomes.push({ path: job.path, module: job.module, status: 'deferred' })
      continue
    }

    // Stamped BEFORE the call, not after. A job that hangs or throws has still had its
    // turn; retrying it on every tick for ever would starve everything behind it and
    // hammer whatever it was failing to reach.
    await prisma.cronRun.update({ where: { path: job.path }, data: { lastRunAt: new Date() } })

    let status: 'ran' | 'failed' = 'ran'
    let detail: string | undefined
    try {
      const res = await fetch(`${siteUrl}${job.path}`, {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(Math.min(remaining, MAX_PER_JOB_MS)),
        cache: 'no-store',
      })
      if (!res.ok) {
        status = 'failed'
        detail = `HTTP ${res.status}`
      }
    } catch (err) {
      status = 'failed'
      detail = err instanceof Error ? err.message : String(err)
    }

    if (status === 'ran') ran += 1
    else failed += 1
    await prisma.cronRun.update({
      where: { path: job.path },
      data: { lastStatus: status, lastError: status === 'failed' ? (detail ?? 'failed') : null },
    })
    outcomes.push({ path: job.path, module: job.module, status, detail })
  }

  // Jobs that no longer exist - a module uninstalled, a schedule renamed - would sit in
  // the table for ever and make the next `findMany` a little wronger every time.
  const orphaned = rows.map((row) => row.path).filter((path) => !known.has(path))
  if (orphaned.length > 0) {
    await prisma.cronRun.deleteMany({ where: { path: { in: orphaned } } })
  }

  return NextResponse.json({
    ok: true,
    jobs: jobs.length,
    due: due.length,
    ran,
    failed,
    deferred: outcomes.filter((o) => o.status === 'deferred').length,
    seeded: outcomes.filter((o) => o.status === 'seeded').length,
    pruned: orphaned.length,
    elapsedMs: Date.now() - startedAt,
    outcomes,
  })
}

export async function POST(request: NextRequest) {
  return GET(request)
}
