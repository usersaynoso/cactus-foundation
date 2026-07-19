import { createHmac, timingSafeEqual } from 'node:crypto'
import { getSessionSecret } from '@/lib/config/env'
import { MODEL_EXTENSION_TYPES } from '@/lib/media/limits'
import { workerUrl } from '@/lib/media/upload'

// Signed read tokens for the media assets that are worth stealing.
//
// The problem this solves: a 3D model's url is resolved server-side and handed to
// the browser as a plain prop, because a WebGL canvas has to fetch the bytes
// itself - there is no way to render a model the visitor's machine cannot read.
// That much is unavoidable. What was avoidable is the url being a permanent,
// unauthenticated address: anyone who viewed source once had a link they could
// keep, share, or hotlink from their own shop indefinitely.
//
// A token binds the url to the object key and an expiry, so a scraped link stops
// working within a couple of days and a third-party site cannot embed our models
// at all without re-scraping every page, every time. It does not - and cannot -
// stop a determined person downloading a model they can already see. That ceiling
// is inherent to WebGL. The point is to move the cost from "copy the url" to
// "write and maintain a scraper", which is where most casual theft dies.
//
// The signing key is derived from SESSION_SECRET, like the upload token beside
// it, so operators have nothing extra to configure: the derived value - never
// SESSION_SECRET itself - is pushed to the Worker as ASSET_SIGNING_SECRET when
// the Worker is deployed from Settings > Media.

const DERIVATION_LABEL = 'cactus-media-asset-v1'

// The query parameter carrying the token. Deliberately not `w`/`q`/`width`/
// `quality`, which the Worker already reads for Cloudflare image resizing.
export const ASSET_TOKEN_PARAM = 't'

// Token lifetime, expressed as a floor plus a bucket rather than a flat TTL, and
// the reason is caching.
//
// A naive `now + 48h` mints a different url on every render. Every url is a cache
// miss, so every visitor re-downloads a model they already have, and the site gets
// measurably slower in exchange for security - which is the trade nobody wants.
//
// Rounding the expiry UP to the next bucket boundary makes the url identical for
// every visitor within the same bucket, so the browser cache, the edge cache and
// the `immutable` header all keep working exactly as before. A repeat visitor
// re-fetches a model at most once a day instead of once a page.
//
// With a 24h bucket and a 24h floor, a minted token lives between 24 and 48 hours:
// long enough that no page cached anywhere reasonable outlives its own urls, short
// enough that a scraped link is rubbish by the weekend.
const TOKEN_BUCKET_MS = 24 * 60 * 60 * 1000
const TOKEN_MIN_TTL_MS = 24 * 60 * 60 * 1000

// The file types a token is required for. Only 3D models: they are the asset with
// real production cost behind it, and - unlike an image - one is never referenced
// from rich text, a Puck prop, an email, or an `<img>` a browser built the url for.
// That containment is what makes signing them safe to switch on without auditing
// every url the site has ever written down.
//
// Mirrors the Worker's own PROTECTED_EXTENSIONS - keep the two in step.
const PROTECTED_EXTENSIONS = new Set(Object.keys(MODEL_EXTENSION_TYPES))

export function isProtectedAssetKey(key: string): boolean {
  const dot = key.lastIndexOf('.')
  if (dot === -1) return false
  return PROTECTED_EXTENSIONS.has(key.slice(dot + 1).toLowerCase())
}

// The value shared with the Worker (env ASSET_SIGNING_SECRET). Deterministic from
// SESSION_SECRET so the app can both sign urls and provision the Worker without
// storing anything of its own.
export function deriveAssetSigningKey(): string {
  return createHmac('sha256', getSessionSecret()).update(DERIVATION_LABEL).digest('hex')
}

function sign(key: string, message: string): string {
  return createHmac('sha256', key).update(message).digest('base64url')
}

// The expiry a token minted at `now` should carry: at least TOKEN_MIN_TTL_MS out,
// then rounded up to the next bucket boundary so concurrent renders agree on it.
// Exported for the unit test, which is the only thing that should care how the
// number is reached.
export function assetTokenExpiry(now: number = Date.now()): number {
  return Math.ceil((now + TOKEN_MIN_TTL_MS) / TOKEN_BUCKET_MS) * TOKEN_BUCKET_MS
}

// Token format `<exp>.<sig>`, signature over "<key>\n<exp>" - the same shape as
// the upload token, under a different derived key so neither can be replayed as
// the other. The Worker knows the key from the request path and rebuilds it.
export function signAssetToken(objectKey: string, now: number = Date.now()): string {
  const exp = assetTokenExpiry(now)
  return `${exp}.${sign(deriveAssetSigningKey(), `${objectKey}\n${exp}`)}`
}

// Server-side counterpart, for tests and defence in depth; the Worker does the
// real verification at read time.
export function verifyAssetToken(objectKey: string, token: string, now: number = Date.now()): boolean {
  const dot = token.indexOf('.')
  if (dot === -1) return false
  const exp = Number(token.slice(0, dot))
  const sig = token.slice(dot + 1)
  if (!Number.isFinite(exp) || exp < now) return false
  const expected = sign(deriveAssetSigningKey(), `${objectKey}\n${exp}`)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Stamp a read token onto a stored media url, if it is one of ours and one of the
 * protected types. Anything else is handed back untouched, so this is safe to call
 * on any url at all rather than making every caller work out whether it applies.
 *
 * Returns the url unchanged when SESSION_SECRET is absent: an unsigned url still
 * serves (the Worker only enforces once it has been given the secret), so a
 * half-configured install renders its models rather than showing empty frames.
 *
 * Call this at the point a url is put on the wire - never at the point it is
 * stored. The database keeps the plain url, so rotating SESSION_SECRET or turning
 * signing off again needs no data migration.
 */
export function signAssetUrl(url: string): string {
  const base = workerUrl()
  if (!base || !url.startsWith(`${base}/`)) return url

  // The key is the path, which is what the Worker signs against. Parsed rather
  // than sliced so a url that already carries a query (an image resize) keeps it.
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }
  const key = parsed.pathname.slice(1)
  if (!isProtectedAssetKey(key)) return url

  try {
    parsed.searchParams.set(ASSET_TOKEN_PARAM, signAssetToken(key))
  } catch {
    // No SESSION_SECRET - leave the url plain rather than failing the page.
    return url
  }
  return parsed.toString()
}
