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

// Member-area sub-paths that must stay reachable without a session: they are
// how a visitor gets one in the first place. The account layout's gate would
// otherwise send /login to /login, folding the previous URL into the next
// one's ?redirect= on every hop until the browser refuses the length. This
// mirrors proxy.ts skipping its own gate for the admin area's /login sub-path.
export const MEMBER_PUBLIC_SUBPATHS = ['/login', '/register', '/verify-email']

// True only for those pages under the member area itself. `full` is the public
// path, query optional (e.g. "/account/login?redirect=/x"); `basePath` is
// "/" + getMemberAreaPath(). Anything outside the member area is not this
// function's business - a site could have its own page at /login.
export function isPublicMemberPath(full: string, basePath: string): boolean {
  const path = full.split('?')[0] ?? ''
  if (path !== basePath && !path.startsWith(basePath + '/')) return false
  const sub = path.slice(basePath.length).replace(/\/+$/, '') || '/'
  return MEMBER_PUBLIC_SUBPATHS.some((p) => sub === p || sub.startsWith(p + '/'))
}
