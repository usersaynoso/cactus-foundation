import type { NextRequest } from 'next/server'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Defence-in-depth against cross-site request forgery on `/api/*`.
 *
 * The session cookie is already SameSite=lax + httpOnly, which blocks the common
 * cross-site POST vector; this is the explicit belt to that pair of braces. It
 * never replaces session auth.
 *
 * It used to assume that "sends an Origin header" meant "is a browser", and that
 * machine callers would send none. That is not true, and finding out was
 * expensive. GoCardless's webhook service sends
 * `Origin: https://api.gocardless.com` on every delivery, so every payment
 * confirmation it tried to make was refused with 403 "Origin not allowed" before
 * it ever reached the module's route: the shopper's money left their account and
 * the order sat at "awaiting confirmation" for ever. It stayed hidden because a
 * request rolled by hand to test the endpoint sends no Origin, and so never
 * trips the guard that is doing the blocking. Core's own webhooks were exempt
 * through the proxy's ALWAYS_PASS ('/api/webhooks/'); every module's, which live
 * under /api/m/<module>/..., were not.
 *
 * So the check is now gated on the thing CSRF actually requires: ambient
 * credentials. A request carrying no cookies carries nothing for a forgery to
 * ride on - an attacker who must supply the credentials themselves can POST from
 * their own server and needs no victim's browser at all. Every cookie-bearing
 * request is checked exactly as before, which is every request this ever
 * protected.
 */
export function originMismatch(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return false

  const origin = request.headers.get('origin')
  if (!origin) return false

  // No cookies means no ambient credentials means nothing to forge against.
  if (request.cookies.getAll().length === 0) return false

  return origin !== request.nextUrl.origin
}
