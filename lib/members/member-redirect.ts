import { z } from 'zod'
import { sanitizeRedirect } from '@/lib/auth/redirect'
import { isPublicMemberPath } from '@/lib/members/paths'

// Where a member goes next, worked out from a ?redirect= somebody else chose.
//
// One rule for every member page that takes one - sign-in, sign-up, the
// verification link and the emailed sign-in link - so a destination that works
// after signing in works after signing up too (a native app's hand-off page,
// for instance), and anything refused by one is refused by all of them.
//
// sanitizeRedirect does the open-redirect work: same-site paths only, nothing
// with a scheme, "//host", a backslash or a control character. On top of that a
// redirect aimed at one of the member area's own signed-out pages is dropped for
// the account overview, since signing in only to land on the sign-in page again
// is a loop. `basePath` is "/" + getMemberAreaPath().
export function resolveMemberRedirect(raw: string | null | undefined, basePath: string): string {
  const target = sanitizeRedirect(raw, basePath)
  return isPublicMemberPath(target, basePath) ? basePath : target
}

// The redirect to pass along to the next step (a form post, an emailed link),
// or undefined when the visitor arrived without one. Undefined matters: every
// link and request is then exactly what it was before redirects were carried.
export function carriedMemberRedirect(raw: string | null | undefined, basePath: string): string | undefined {
  return raw ? resolveMemberRedirect(raw, basePath) : undefined
}

// A redirect sent in a request body. Too long or the wrong type is treated as
// absent rather than failing the request: a bad redirect must never cost a
// member their account or their email. The value still has to pass
// sanitizeRedirect wherever it is used.
export const memberRedirectField = z.string().max(2048).optional().catch(undefined)

// Where the verification page sends a member once their link has been spent.
// The redirect only counts when verifying also signed them in: a member held
// for approval has no session, and a hand-off page would just bounce them to
// the sign-in page to be told so. The welcome pill is set only when the
// destination is in the member area, where something will show it; anywhere
// else it would sit in the tab's storage and pop up on some later visit.
export function verifiedDestination(input: {
  signedIn: boolean
  redirectHref?: string
  accountHref: string
}): { href: string; flash: boolean } {
  const { signedIn, redirectHref, accountHref } = input
  const href = signedIn && redirectHref ? resolveMemberRedirect(redirectHref, accountHref) : accountHref
  const path = href.split(/[?#]/)[0] ?? ''
  const flash = path === accountHref || path.startsWith(accountHref + '/')
  return { href, flash }
}
