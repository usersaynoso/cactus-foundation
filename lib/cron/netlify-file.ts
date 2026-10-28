// The install repo's netlify.toml: the Netlify twin of ./vercel-file.
//
// Netlify has no vercel.json-style cron list. A scheduled function is a function file
// plus a schedule, and the schedule is read out of netlify.toml in the commit being
// built - the same "it has to BE in the commit" rule as vercel.json, for the same
// reason. The function itself (netlify/functions/cactus-cron.mts) is ordinary core
// code; only its tick lives here, so a tick change is one small file in one commit.
//
// Dependency-free for the same reasons as ./vercel-file: it is imported by the module
// registry sync and the core update, and compared byte for byte against the repo.

import { DISPATCH_SCHEDULE } from './vercel-file'

/** Where the file lives in the repository. */
export const NETLIFY_TOML_PATH = 'netlify.toml'

/** The scheduled function's name - its filename under netlify/functions, minus the extension. */
export const NETLIFY_CRON_FUNCTION = 'cactus-cron'

export function buildNetlifyToml(schedule: string = DISPATCH_SCHEDULE): string {
  return [
    '# Netlify configuration for a Cactus site.',
    '#',
    '# Written by Cactus: the schedule below is rewritten whenever the site needs its',
    '# scheduled-job dispatcher woken more or less often, so edits to this file are',
    '# overwritten. See lib/cron/netlify-file.ts.',
    '',
    '[build]',
    '  command = "npm run build"',
    '  publish = ".next"',
    '',
    '# Netlify does not read package.json "engines"; this keeps the build on the same',
    '# Node major as the rest of the estate.',
    '[build.environment]',
    '  NODE_VERSION = "24"',
    '',
    `[functions."${NETLIFY_CRON_FUNCTION}"]`,
    `  schedule = "${schedule}"`,
    '',
  ].join('\n')
}
