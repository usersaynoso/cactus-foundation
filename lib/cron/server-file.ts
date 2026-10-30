// The install repo's cactus-host.json: the server twin of ./vercel-file and
// ./netlify-file.
//
// On a server run by cactus-host nothing reads vercel.json, so the dispatcher tick
// lives in a file of its own. cactus-host reads it out of the RELEASE it is serving -
// the commit that was built - which is the same "it has to be in the commit" rule as
// the other two, and means a tick change takes effect when the build carrying it goes
// live, exactly as it does on Vercel and Netlify. A release without the file (an
// install that has not yet had a sync write it) gets DISPATCH_SCHEDULE, which is
// also what cactus-host falls back to on anything it cannot parse.
//
// Dependency-free for the same reasons as ./vercel-file: it is imported by the module
// registry sync and the core update, and compared byte for byte against the repo.

import { DISPATCH_PATH, DISPATCH_SCHEDULE } from './vercel-file'

/** Where the file lives in the repository. cactus-host/cron-file.ts reads the same path. */
export const SERVER_CRON_PATH = 'cactus-host.json'

export function buildServerCronJson(schedule: string = DISPATCH_SCHEDULE): string {
  return (
    JSON.stringify(
      {
        $comment:
          'Written by Cactus: the schedule is rewritten whenever the site needs its scheduled-job dispatcher woken more or less often, so edits here are overwritten. See lib/cron/server-file.ts.',
        crons: [{ path: DISPATCH_PATH, schedule }],
      },
      null,
      2
    ) + '\n'
  )
}
