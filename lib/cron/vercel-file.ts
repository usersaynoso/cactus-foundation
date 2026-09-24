// The install repo's vercel.json, and the one cron entry in it.
//
// Kept dependency-free (no prisma, no env) because it is imported by the two places
// that write the file into the install's repository - the module registry sync and the
// core update - and because the content has to be comparable byte for byte against
// what the repo already holds.
//
// Why there is only one entry, and why this file is committed rather than generated at
// build time, is the long comment at the top of lib/cron/jobs.ts. The short version:
// Vercel reads vercel.json out of the commit it builds, so a file written during the
// build is a file nothing ever reads.

/** Path Vercel calls on the site's behalf. */
export const DISPATCH_PATH = '/api/cron/dispatch'

/**
 * The tick a site gets when nothing asks for better: every half hour on a paid plan,
 * and once a day on Hobby whatever this says. Sites with a job faster than half-hourly
 * get a faster tick written for them - see dispatchScheduleForInterval.
 *
 * Half-hourly rather than the hourly `0 * * * *` this was until September 2026. The
 * dispatcher's budget is one tick, so a job deferred for want of time - or one whose
 * own minute has already gone by when the tick lands - waits for the next wake, and at
 * `0 * * * *` that wait was a full hour and :00 was the only minute the dispatcher was
 * ever awake for, which made every job's minute field decorative.
 *
 * Nothing fires twice as a result. A job is due only where its expression matched
 * inside `(lastRunAt, now]`, and `lastRunAt` is stamped past the match it has just
 * consumed, so `0 * * * *` still runs once an hour - at worst half an hour later than
 * the minute it names, which is the bargain it already had.
 */
export const DISPATCH_SCHEDULE = '*/30 * * * *'

/** Where the file lives in the repository. */
export const VERCEL_JSON_PATH = 'vercel.json'

// Tick rates the dispatcher is ever given, slowest first - the order they are tried in.
// Only these: an arbitrary number would be honoured by Vercel but is a worse fit for the
// frequencies the admin can actually pick, and every extra distinct value is another
// vercel.json commit and another deploy on the install.
const TICK_STEPS = [30, 20, 15, 10, 5, 1] as const

/**
 * The dispatcher schedule a site needs, given how often its fastest job runs.
 *
 * The tick has to be at least as frequent as the job, never the other way round: the
 * dispatcher asks "did this fire since it last ran", so a slow tick does not lose a run,
 * it just delivers it late - and "my mail check is set to every 5 minutes and arrives
 * hourly" is indistinguishable from broken.
 *
 * Alignment is deliberately not chased. A 15-minute job on a 10-minute tick fires on
 * time or one tick late, which is the same bargain every job on this site has always
 * had, and chasing exactness would mean a tick per job and a deploy per settings change.
 */
export function dispatchScheduleForInterval(fastestJobMinutes: number): string {
  if (fastestJobMinutes >= 60) return DISPATCH_SCHEDULE
  // Slowest step that is still at least as frequent as the job. Rounding the other way
  // is the bug this reads oddly to avoid: a seven-minute job on a ten-minute tick runs
  // every ten minutes, which is not what anybody asked for.
  for (const step of TICK_STEPS) {
    if (step <= fastestJobMinutes) return step === 1 ? '* * * * *' : `*/${step} * * * *`
  }
  return '* * * * *'
}

export function buildVercelJson(schedule: string = DISPATCH_SCHEDULE): string {
  return JSON.stringify({ crons: [{ path: DISPATCH_PATH, schedule }] }, null, 2) + '\n'
}
