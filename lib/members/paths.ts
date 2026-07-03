import { isBlocklisted } from '@/lib/config/site'

// Internal prefix the member-area pages live under (app/(public)/cactus-account).
// proxy.ts rewrites /<memberAreaPath>/* here and blocks direct access, mirroring
// the /cactus-admin pattern.
export const MEMBER_INTERNAL = '/cactus-account'

export const DEFAULT_MEMBER_AREA_PATH = 'account'

// Public URL prefix for the member area, from the MEMBER_AREA_PATH env var.
// Deploy-time only — changing it requires a redeploy, same as the admin path
// pattern. Invalid or reserved values fall back to the default rather than
// breaking the site. 'account' itself is on the shared blocklist (to keep the
// admin path and usernames off it), so it is exempted here.
export function getMemberAreaPath(): string {
  const raw = (process.env.MEMBER_AREA_PATH ?? DEFAULT_MEMBER_AREA_PATH)
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(raw)) return DEFAULT_MEMBER_AREA_PATH
  if (raw !== DEFAULT_MEMBER_AREA_PATH && isBlocklisted(raw)) return DEFAULT_MEMBER_AREA_PATH
  return raw
}
