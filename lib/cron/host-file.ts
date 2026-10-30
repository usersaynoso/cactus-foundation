// The one file in the install's repository that registers the dispatcher tick with
// its hosting platform: vercel.json on Vercel, netlify.toml on Netlify,
// cactus-host.json on a server run by cactus-host. Callers ask
// for "the cron file" and get whichever this site's platform reads, so the module
// registry sync and the core update never need to know which one that is.
//
// Off-platform (local development) it answers vercel.json, which is what it always
// answered before Netlify was an option.

import { detectHostingProvider } from '@/lib/hosting/provider'
import { buildVercelJson, VERCEL_JSON_PATH } from './vercel-file'
import { buildNetlifyToml, NETLIFY_TOML_PATH } from './netlify-file'
import { buildServerCronJson, SERVER_CRON_PATH } from './server-file'

export type HostCronFile = { path: string; content: string }

export function hostCronFile(schedule: string): HostCronFile {
  switch (detectHostingProvider()) {
    case 'netlify':
      return { path: NETLIFY_TOML_PATH, content: buildNetlifyToml(schedule) }
    case 'server':
      return { path: SERVER_CRON_PATH, content: buildServerCronJson(schedule) }
    case 'vercel':
    case null:
      return { path: VERCEL_JSON_PATH, content: buildVercelJson(schedule) }
  }
}
