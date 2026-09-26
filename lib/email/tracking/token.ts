import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// The signed token on the end of every tracked address.
//
// It names the one send the picture or the link belongs to - the EmailLog row
// - and, for a link, the address the link really goes to. Nothing else: no
// email address, no name, nothing personal. Whoever the message went to is on
// the log row, where it already was; the token only points at it.
//
// Signed, not encrypted. The destination of a link is readable by anybody who
// takes the token apart, which is fine - it is the address that was in the
// email to begin with. What the signature stops is the redirect being used to
// send people anywhere else: a token whose destination has been edited no
// longer matches its signature, and the redirect refuses it. That is the whole
// defence against this becoming an open redirect with the site's good name on
// the front of it.
//
// Format: `v1.<base64url JSON>.<base64url HMAC>`, the HMAC over the version and
// the body together. The kind ('o' for the picture, 'c' for a link) is inside
// the signed body, so an open token cannot be replayed at the click route to
// make it redirect somewhere.
//
// The key is derived from SESSION_SECRET, as the media tokens are, so there is
// nothing new for an owner to configure. Rotating SESSION_SECRET breaks every
// tracked link in mail already sent - each one then lands on the home page
// instead of where it was going. That is the price of not keeping a second
// secret, and a rotation is rare enough to pay it.
// ---------------------------------------------------------------------------

const VERSION = 'v1'
const DERIVATION_LABEL = 'cactus-email-tracking-v1'
/** 128 bits of HMAC is plenty for a link that only ever redirects to where it
 *  was already going, and keeps the address in the email shorter. */
const SIGNATURE_BYTES = 16

/** What a token says. Short keys, because every byte of this ends up in the
 *  address on every link in the message. */
const claimSchema = z.object({
  /** 'o' = the open picture, 'c' = a link. */
  k: z.enum(['o', 'c']),
  /** The EmailLog row this send wrote. */
  e: z.string().min(1).max(64),
  /** The module that sent it, when one did. */
  m: z.string().min(1).max(64).optional(),
  /** That module's own name for the message, handed back to it untouched. */
  x: z.string().min(1).max(64).optional(),
  /** Where a link really goes. Only on a click, and only http(s). */
  u: z.string().max(2048).regex(/^https?:\/\//i).optional(),
}).strict()

export type TrackingClaim = z.infer<typeof claimSchema>

function signingKey(secret: string): Buffer {
  return createHmac('sha256', secret).update(DERIVATION_LABEL).digest()
}

function signatureOf(secret: string, body: string): string {
  return createHmac('sha256', signingKey(secret))
    .update(`${VERSION}.${body}`)
    .digest()
    .subarray(0, SIGNATURE_BYTES)
    .toString('base64url')
}

/** A token for one tracked address. */
export function signTrackingToken(claim: TrackingClaim, secret: string): string {
  const body = Buffer.from(JSON.stringify(claimSchema.parse(claim)), 'utf8').toString('base64url')
  return `${VERSION}.${body}.${signatureOf(secret, body)}`
}

/**
 * What a token says, or null for anything that is not a genuine one - wrong
 * version, altered body, wrong key, unreadable, or a shape we never write.
 * Never throws: it is handed whatever somebody typed on the end of an address.
 */
export function verifyTrackingToken(token: string, secret: string): TrackingClaim | null {
  if (typeof token !== 'string' || token.length > 4096) return null
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== VERSION) return null
  const [, body, signature] = parts as [string, string, string]
  if (!body || !signature) return null

  const expected = Buffer.from(signatureOf(secret, body))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null

  try {
    const parsed = claimSchema.safeParse(JSON.parse(Buffer.from(body, 'base64url').toString('utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** The secret tokens are signed with, or null on a site with none - which
 *  sends its mail untracked rather than failing to send it. */
export function trackingSecret(): string | null {
  const secret = process.env.SESSION_SECRET
  return secret && secret.length >= 32 ? secret : null
}
