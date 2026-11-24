import { sanitizeRedirect } from '@/lib/auth/redirect'

// The emailed verification link. `redirect` is where the verification page
// sends the member once the token has verified and signed them in - the
// ?redirect= they registered with, so a sign-up started from a native app's
// hand-off page ends back on it. Sanitised here as well as by the caller and
// again by the verification page, exactly as the emailed sign-in link is
// (buildMagicLinkUrl): a value that is not a same-site path is left off, never
// passed along. No redirect, no parameter - the link is what it always was.
export function buildVerificationUrl(siteUrl: string, memberAreaPath: string, token: string, redirect?: string | null): string {
  const base = `${siteUrl.replace(/\/$/, '')}/${memberAreaPath}/verify-email?token=${token}`
  const safe = sanitizeRedirect(redirect, '')
  return safe ? `${base}&redirect=${encodeURIComponent(safe)}` : base
}
