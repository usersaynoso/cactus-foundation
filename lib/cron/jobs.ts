// The site's scheduled jobs, and the one Vercel cron entry that drives all of them.
//
// WHY THERE IS A DISPATCHER
//
// Until now every core and module cron was collected into a generated `vercel.json` at
// build time. That file is gitignored, so it did not exist in the repository - and
// Vercel reads `vercel.json` out of the pushed commit when it CREATES the deployment,
// long before `npm run build` ever runs. The generated file was therefore written after
// the only moment anything would have read it. Every install had exactly zero cron jobs
// registered, silently, for as long as the feature had existed: no retention purges, no
// stock imports, no basket reminders, no member digests.
//
// The obvious fix - commit the generated list - swaps one silent failure for a loud
// one. Vercel's Hobby plan allows two cron jobs per project and Cactus already declares
// more than twenty, so a Hobby install would stop deploying at all the moment it took
// the update. Picking two of them for those sites is not a decision core can make.
//
// So core registers ONE cron with Vercel - this dispatcher - and schedules everything
// else itself. One entry fits every plan, the file never changes as modules come and
// go (so nothing has to rewrite it on install), and module authors carry on declaring
// `cronJobs` in their manifest exactly as before.
//
// WHAT THIS COSTS
//
// Vercel wakes the dispatcher hourly on paid plans and daily on Hobby, so a job's
// schedule is honoured to the tick, not to the minute: `30 6 * * *` runs at the 07:00
// tick, and on Hobby it runs on whichever daily tick follows. Hobby was already capped
// at one run a day, so nothing is lost there that Vercel had not already taken.

import { prisma } from '@/lib/db/prisma'
import { isValidCronExpression } from './schedule'
export { DISPATCH_PATH, DISPATCH_SCHEDULE, buildVercelJson, VERCEL_JSON_PATH } from './vercel-file'

export interface CronJob {
  /** Path on this site, query string included. */
  path: string
  /** Five-field cron expression, UTC. */
  schedule: string
  /** Module name, or null for a core job. Used for reporting only. */
  module: string | null
}

// Core's own scheduled work. Declared here rather than in vercel.json because vercel.json
// now holds one line that never changes, and because the dispatcher has to be able to
// read this list at runtime.
export const CORE_CRON_JOBS: CronJob[] = [
  { path: '/api/cron/members/purge', schedule: '0 3 * * *', module: null },
  { path: '/api/cron/members/exports', schedule: '0 4 * * *', module: null },
  { path: '/api/cron/members/digest?mode=daily', schedule: '0 7 * * *', module: null },
  { path: '/api/cron/members/digest?mode=weekly', schedule: '0 7 * * 1', module: null },
]

type ManifestCronJob = { path?: unknown; schedule?: unknown }

// Pull `cronJobs` out of a stored manifest, rejecting anything malformed rather than
// scheduling it. Module.manifest is rewritten from the deployed cactus.module.json on
// every build (scripts/sync-module-manifests.mjs), so it tracks the code that shipped.
export function cronJobsFromManifest(moduleName: string, manifest: unknown): CronJob[] {
  if (!manifest || typeof manifest !== 'object') return []
  const raw = (manifest as { cronJobs?: unknown }).cronJobs
  if (!Array.isArray(raw)) return []

  const jobs: CronJob[] = []
  for (const entry of raw as ManifestCronJob[]) {
    const path = typeof entry?.path === 'string' ? entry.path : null
    const schedule = typeof entry?.schedule === 'string' ? entry.schedule : null
    if (!path || !schedule) {
      console.warn(`[cron] ${moduleName}: ignoring a cronJobs entry with no path or schedule`)
      continue
    }
    // A module may only schedule its own routes. Without this a manifest could ask the
    // dispatcher to call any path on the site, with core's own CRON_SECRET attached.
    if (!path.startsWith(`/api/m/${moduleName}/`)) {
      console.warn(`[cron] ${moduleName}: refusing cron path outside its own routes: ${path}`)
      continue
    }
    if (!isValidCronExpression(schedule)) {
      console.warn(`[cron] ${moduleName}: unsupported cron expression "${schedule}" for ${path}`)
      continue
    }
    jobs.push({ path, schedule, module: moduleName })
  }
  return jobs
}

// Every job this install should be running: core's, plus each installed module's.
//
// 'failed' and 'inactive' are excluded for the same reason they are excluded from
// modules.json - a module the owner switched off, or one whose install failed, has
// routes that either do not exist or sit on tables that were never created.
export async function listCronJobs(): Promise<CronJob[]> {
  const modules = await prisma.module.findMany({
    where: { status: { notIn: ['failed', 'inactive'] } },
    select: { name: true, manifest: true },
    orderBy: { name: 'asc' },
  })

  const jobs = [...CORE_CRON_JOBS]
  for (const mod of modules) jobs.push(...cronJobsFromManifest(mod.name, mod.manifest))
  return jobs
}
