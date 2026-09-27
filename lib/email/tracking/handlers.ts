import { z } from 'zod'
import { getSiteUrlOrNull } from '@/lib/config/env'
import { clientIpFromHeaders } from '@/lib/auth/rate-limit'
import { isBehindCloudflare } from '@/lib/config/site'
import { classifyOpen, tidyIp, tidyUserAgent } from './classify'
import { recordObservedEvent } from './events'
import { trackingSecret, verifyTrackingToken, type TrackingClaim } from './token'

// ---------------------------------------------------------------------------
// The two public addresses, minus the Next.js wrapping, so they can be tested.
//
// Both are unauthenticated - they are fetched by a stranger's mail program -
// and both have one rule above all others: whatever arrives, answer at once and
// never with an error. A picture that fails to load is a broken-image icon in
// somebody's email; a link that fails is a customer who cannot reach the quote.
// So a bad token still gets its picture, and a bad link still goes somewhere
// safe - the home page - rather than to a 500.
//
// What a bad token never gets is a redirect to where it asked. The destination
// is only ever taken from a token whose signature checks out, which is the
// whole difference between this and an open redirect.
//
// The recording happens after the answer has gone (the routes hand the work to
// Next's after()), and it is one insert.
// ---------------------------------------------------------------------------

/** The address segment: a token, with an optional .gif on the end for mail
 *  programs that will not fetch a picture whose address does not look like
 *  one. Anything else is not a token. */
const tokenSchema = z.string().min(1).max(4096)

export type RequestFacts = {
  /** Reads one request header, case-insensitively. */
  header: (name: string) => string | null
}

/** Somebody signed in to this site's admin. Their clicks and opens are the site
 *  reading its own post - somebody checking a link in a message they sent - and
 *  never the recipient. Only the cookie's presence is checked: verifying it
 *  would be a database read on every open, and a customer never holds one. */
function isStaff(facts: RequestFacts): boolean {
  const cookies = facts.header('cookie') ?? ''
  return /(?:^|;\s*)cactus_session=/.test(cookies)
}

function tokenOf(raw: string): string {
  let value = raw
  try {
    value = decodeURIComponent(raw)
  } catch {
    // Left as it arrived; verification will refuse it if it is nonsense.
  }
  return value.replace(/\.gif$/i, '')
}

function claimFrom(raw: string, kind: 'o' | 'c'): TrackingClaim | null {
  const parsed = tokenSchema.safeParse(raw)
  if (!parsed.success) return null
  const secret = trackingSecret()
  if (!secret) return null
  const claim = verifyTrackingToken(tokenOf(parsed.data), secret)
  return claim && claim.k === kind ? claim : null
}

async function whoFetched(facts: RequestFacts): Promise<{ ip: string | null; userAgent: string | null }> {
  const trustCloudflare = await isBehindCloudflare().catch(() => false)
  return {
    ip: tidyIp(clientIpFromHeaders(facts.header, { trustCloudflare })),
    userAgent: tidyUserAgent(facts.header('user-agent')),
  }
}

export type TrackingOutcome = {
  /** Work to do once the answer has gone, or null when there is nothing to
   *  record. Never rejects. */
  record: (() => Promise<void>) | null
}

export function handleOpen(rawToken: string, facts: RequestFacts, now = new Date()): TrackingOutcome {
  const claim = claimFrom(rawToken, 'o')
  if (!claim || isStaff(facts)) return { record: null }
  return {
    record: async () => {
      try {
        const who = await whoFetched(facts)
        const sinceSendMs = claim.t ? now.getTime() - claim.t * 1000 : null
        await recordObservedEvent(claim, { kind: classifyOpen(who.userAgent, sinceSendMs), occurredAt: now, ...who })
      } catch (error) {
        console.error('[email] could not record an open', error)
      }
    },
  }
}

export function handleClick(
  rawToken: string,
  facts: RequestFacts,
  now = new Date(),
): TrackingOutcome & { location: string } {
  const claim = claimFrom(rawToken, 'c')
  if (!claim?.u) {
    // Not ours, or tampered with. The home page is the one address that is
    // certainly safe to send somebody to.
    return { location: `${getSiteUrlOrNull() ?? ''}/`, record: null }
  }
  if (isStaff(facts)) return { location: claim.u, record: null }
  return {
    location: claim.u,
    record: async () => {
      try {
        const who = await whoFetched(facts)
        await recordObservedEvent(claim, { kind: 'clicked', occurredAt: now, ...who })
      } catch (error) {
        console.error('[email] could not record a click', error)
      }
    },
  }
}

/** A transparent 1x1 GIF. */
export const TRANSPARENT_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

/** Headers that stop anything between here and the reader keeping a copy - a
 *  cached picture is an open nobody hears about. */
export const NO_STORE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
}
