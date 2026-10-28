// The one file in the install's repository that registers the dispatcher tick with
// its hosting platform: vercel.json on Vercel, netlify.toml on Netlify. Callers ask
// for "the cron file" and get whichever this site's platform reads, so the module
// registry sync and the core update never need to know which one that is.
//
// Off-platform (local development) it answers vercel.json, which is what it always
// answered before Netlify was an option.

import { detectHostingProvider } from '@/lib/hosting/provider'
import { buildVercelJson, VERCEL_JSON_PATH } from './vercel-file'
import { buildNetlifyToml, NETLIFY_TOML_PATH } from './netlify-file'

export type HostCronFile = { path: string; content: string }

export function hostCronFile(schedule: string): HostCronFile {
  return detectHostingProvider() === 'netlify'
    ? { path: NETLIFY_TOML_PATH, content: buildNetlifyToml(schedule) }
    : { path: VERCEL_JSON_PATH, content: buildVercelJson(schedule) }
}
