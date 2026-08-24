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

/** Hourly on a paid plan; Vercel's Hobby plan runs it once a day whatever this says. */
export const DISPATCH_SCHEDULE = '0 * * * *'

/** Where the file lives in the repository. */
export const VERCEL_JSON_PATH = 'vercel.json'

export function buildVercelJson(): string {
  return JSON.stringify({ crons: [{ path: DISPATCH_PATH, schedule: DISPATCH_SCHEDULE }] }, null, 2) + '\n'
}
