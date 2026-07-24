/**
 * Cactus Media Worker — Cloudflare Worker
 *
 * Serves private object-storage media on behalf of the app.  Designed to sit in
 * front of every *proxied* provider: B2, Cloudflare R2, AWS S3, DigitalOcean
 * Spaces, Wasabi, MinIO, Vercel Blob, and Supabase Storage.  Direct providers
 * (Cloudinary, ImageKit) are never routed through this Worker — the Next.js
 * loader builds their own CDN URLs instead.
 *
 * ## Key format
 *
 *   media/<PROVIDER>/<nanoid>-<filename>.<ext>
 *
 * e.g.  media/R2/xF9a2b-photo.jpg
 *
 * Legacy B2 keys written before the multi-provider migration:
 *
 *   media/<nanoid>-<filename>.<ext>   (no provider segment)
 *
 * These are detected by checking whether the segment after "media/" is a known
 * provider name.  If not, it is treated as a B2 key for backward compatibility.
 *
 * ## Cloudflare Worker secrets (wrangler secret put <NAME>)
 *
 * Configure only the secrets for the providers you actually use:
 *
 *   ALLOWED_ORIGIN        — your site's origin (e.g. https://example.com)
 *
 *   B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_ENDPOINT
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 *   S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME, S3_REGION
 *   SPACES_ACCESS_KEY_ID, SPACES_SECRET_ACCESS_KEY, SPACES_BUCKET_NAME, SPACES_REGION
 *   WASABI_ACCESS_KEY_ID, WASABI_SECRET_ACCESS_KEY, WASABI_BUCKET_NAME, WASABI_REGION
 *   MINIO_ENDPOINT, MINIO_ACCESS_KEY_ID, MINIO_SECRET_ACCESS_KEY, MINIO_BUCKET_NAME
 *   BLOB_BASE_URL         — the base URL of your Vercel Blob store (no trailing slash)
 *   BLOB_READ_WRITE_TOKEN — Vercel Blob read/write token
 *   SUPABASE_STORAGE_PROJECT_URL, SUPABASE_STORAGE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET_NAME
 *
 * See the self-hosting docs for `wrangler secret put` commands.
 */

// The set of provider names embedded in key paths.  Used to distinguish
// "media/R2/abc.jpg" (provider = R2) from legacy "media/abc.jpg" (provider = B2).
const KNOWN_PROVIDERS = new Set([
  'B2', 'R2', 'S3', 'SPACES', 'WASABI', 'MINIO', 'VERCEL_BLOB', 'SUPABASE_STORAGE',
])

// Whether a key's basename looks like the NANOID form every ordinary upload gets
// (see lib/media/keys.ts — buildKey), as opposed to the EXACT form a caller asks
// for by name (a product photo, a colour swatch: "<name>.<ext>", no nanoid).
//
// The distinction is the one fact this Worker needs to answer safely, because
// only the exact form can have its bytes replaced at the SAME key: a "Replace"
// or a same-type resize overwrites it in place, by design (that is the whole
// point of a stable, human-named url). A nanoid key's bytes are permanent — any
// rewrite mints a fresh nanoid rather than touching the old one — so caching it
// forever is free. Caching an exact key forever is not: it happily serves
// whatever bytes were there the day it was first fetched, for as long as the
// browser (or an edge cache) chooses to believe `immutable` — up to the year
// below. That is exactly what made a resized swatch keep showing its old,
// four-times-larger self after being replaced.
//
// nanoid()'s default alphabet is fixed at 21 mixed-case characters
// (A-Za-z0-9_-), while every exact key comes through keys.ts's sanitize(),
// which lower-cases the whole name before it is ever written. A real exact
// name can only be mistaken for this shape if an admin happens to file
// something under exactly 21 characters of upper- AND lower-case letters,
// digits, `_` and `-` — which sanitize() itself cannot produce. Worth stating
// the failure direction: if this ever mis-reads a genuine nanoid key as exact,
// the cost is a shorter cache lifetime on a file that did not need one — not a
// stale image shown as fresh, which is the failure this exists to prevent.
const NANOID_KEY_RE = /^[A-Za-z0-9_-]{21}[-.]/

function isExactFormKey(fullKey: string): boolean {
  const basename = fullKey.slice(fullKey.lastIndexOf('/') + 1)
  return !NANOID_KEY_RE.test(basename)
}

// Ceiling for a direct-to-Worker PUT. The body is buffered whole to hash it, so
// this is what stops one request eating the isolate's memory. Mirrors
// MAX_DIRECT_UPLOAD_BYTES in lib/media/limits.ts - keep the two in step.
const UPLOAD_MAX_BYTES = 50 * 1024 * 1024 // 50 MB

// The only content types this Worker will ever put on the wire inline. Anything
// else it holds is served as an attachment instead (see the GET path).
//
// 3D models are deliberately absent, and that is not an oversight: a model is
// fetched by XHR from inside a WebGL canvas, which reads the bytes and ignores
// both the type and the Content-Disposition. Serving one as an inert attachment
// costs the viewer nothing and keeps the rule here simple - only pictures are
// ever rendered from the media origin.
const SERVABLE_IMAGE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif',
])

// Content type for a key, from its extension. The app builds every key's
// extension from a MIME type it has already validated (lib/media/upload.ts
// buildKey), and the key is covered by the upload signature - so on the write
// path this is the only type claim the client cannot forge.
//
// The model entries mirror MODEL_EXTENSION_TYPES in lib/media/limits.ts - keep
// the two in step. A Worker deployed before they were added rejects a model PUT
// with the 415 below; the app turns that into a "redeploy your Worker" message
// rather than a mystery, because the Worker only picks up new source when an
// admin redeploys it from Settings → Media.
const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', svg: 'image/svg+xml',
  glb: 'model/gltf-binary', gltf: 'model/gltf+json', obj: 'model/obj',
  fbx: 'model/x-fbx', '3ds': 'model/x-3ds',
}

function contentTypeForKey(key: string): string | null {
  const dot = key.lastIndexOf('.')
  if (dot === -1) return null
  return EXTENSION_TYPES[key.slice(dot + 1).toLowerCase()] ?? null
}

// Object types that may only be read with a valid signed token. Only 3D models:
// they are the asset with real production cost behind them, and unlike an image
// one is never referenced from rich text, a stored page prop, an email, or an
// <img> url the browser assembled itself - so requiring a token here cannot
// silently break a picture somewhere nobody thought to look.
//
// Mirrors PROTECTED_EXTENSIONS in lib/media/asset-token.ts - keep the two in step.
const PROTECTED_EXTENSIONS = new Set(['glb', 'gltf', 'obj', 'fbx', '3ds'])

function isProtectedKey(key: string): boolean {
  const dot = key.lastIndexOf('.')
  if (dot === -1) return false
  return PROTECTED_EXTENSIONS.has(key.slice(dot + 1).toLowerCase())
}

export interface Env {
  ALLOWED_ORIGIN: string

  // Shared HMAC key (derived from the app's SESSION_SECRET) that authorises
  // direct uploads. The app signs a short-lived token bound to the object key;
  // the Worker verifies it here before writing. Absent = uploads disabled (the
  // Worker only serves), so the client falls back to the serverless path.
  UPLOAD_SIGNING_SECRET?: string

  // Shared HMAC key (a different derivation of the same SESSION_SECRET) that
  // authorises READS of protected objects - today, 3D models. The app stamps a
  // token onto every model url it puts on the wire; the Worker verifies it below.
  //
  // Absent = no read enforcement, and that default matters: a site whose Worker
  // predates this still serves its models rather than showing empty frames on
  // every product page until someone notices and redeploys.
  ASSET_SIGNING_SECRET?: string

  // B2
  B2_APPLICATION_KEY_ID?: string
  B2_APPLICATION_KEY?: string
  B2_BUCKET_NAME?: string
  B2_ENDPOINT?: string

  // Cloudflare R2
  R2_ACCOUNT_ID?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_BUCKET_NAME?: string

  // AWS S3
  S3_ACCESS_KEY_ID?: string
  S3_SECRET_ACCESS_KEY?: string
  S3_BUCKET_NAME?: string
  S3_REGION?: string

  // DigitalOcean Spaces
  SPACES_ACCESS_KEY_ID?: string
  SPACES_SECRET_ACCESS_KEY?: string
  SPACES_BUCKET_NAME?: string
  SPACES_REGION?: string

  // Wasabi
  WASABI_ACCESS_KEY_ID?: string
  WASABI_SECRET_ACCESS_KEY?: string
  WASABI_BUCKET_NAME?: string
  WASABI_REGION?: string

  // MinIO
  MINIO_ENDPOINT?: string
  MINIO_ACCESS_KEY_ID?: string
  MINIO_SECRET_ACCESS_KEY?: string
  MINIO_BUCKET_NAME?: string

  // Vercel Blob
  BLOB_BASE_URL?: string
  BLOB_READ_WRITE_TOKEN?: string

  // Supabase Storage
  SUPABASE_STORAGE_PROJECT_URL?: string
  SUPABASE_STORAGE_SERVICE_ROLE_KEY?: string
  SUPABASE_STORAGE_BUCKET_NAME?: string
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Cross-origin PUT with an Authorization header triggers a CORS preflight.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) })
    }

    if (request.method === 'PUT') {
      return handleUpload(request, env, url)
    }

    if (request.method !== 'GET') {
      return readError('Method not allowed', 405, env)
    }

    // Strip leading slash → full storage key, e.g. "media/R2/abc.jpg"
    const fullKey = url.pathname.slice(1)

    if (!fullKey || fullKey.length < 2) {
      return readError('Not found', 404, env)
    }

    if (!fullKey.startsWith('media/')) {
      return readError('Not found', 404, env)
    }

    // Determine which provider owns this key.
    // Key format: media/<PROVIDER>/<rest>   — new style
    //             media/<rest>              — legacy B2 key (no provider segment)
    const afterMedia = fullKey.slice('media/'.length) // e.g. "R2/abc.jpg" or "abc.jpg"
    const slashIdx = afterMedia.indexOf('/')
    const maybeProvider = slashIdx !== -1 ? afterMedia.slice(0, slashIdx) : ''
    const provider: string = KNOWN_PROVIDERS.has(maybeProvider) ? maybeProvider : 'B2'

    // Protected objects (3D models) need a valid, unexpired token bound to this
    // exact key before any work is done - no storage round-trip for a request
    // that was never going to be answered.
    if (isProtectedKey(fullKey)) {
      const refusal = await refuseUnauthorisedRead(request, url, fullKey, env)
      if (refusal) return refusal
    }

    const cfOptions = buildImageResizingOptions(url)
    // An exact-form key can be replaced in place (see isExactFormKey) - the very
    // thing that happened when a swatch got resized - so it must not be told to
    // cache forever: `must-revalidate` plus a short lifetime means a browser
    // that already has it makes one cheap conditional request rather than
    // trusting stale bytes for up to a year. The nanoid form never changes at
    // its key, so it keeps the long, `immutable` lifetime that lets a repeat
    // visitor skip the request entirely.
    //
    // A PROTECTED key (a 3D model) is exact-form too - "oblong-60cm.glb", no
    // nanoid - but is excluded from that downgrade: it already carries its own
    // cache-busting in the signed `?t=` token (see lib/media/asset-token.ts),
    // which changes the whole url once a day and makes the browser fetch fresh
    // on its own schedule. Downgrading it here would only throw away the
    // immutable caching that scheme was built to keep, for a staleness problem
    // it does not have.
    const cacheableForever = !isExactFormKey(fullKey) || isProtectedKey(fullKey)
    const responseHeaders = new Headers({
      'Cache-Control': cacheableForever
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=300, must-revalidate',
      'Vary': 'Accept',
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN ?? '*',
      // Never let the browser second-guess the type we declare below. Without
      // this, a stored object whose bytes look like markup can be sniffed into
      // being treated as HTML and run script on the media origin.
      'X-Content-Type-Options': 'nosniff',
    })

    try {
      const upstream = await fetchFromProvider(provider, fullKey, env, cfOptions)
      if (!upstream.ok) {
        return upstream.status === 404
          ? readError('Not found', 404, env)
          : readError('Upstream error', 502, env)
      }

      // The provider's own ETag, forwarded so a short-lived exact-form key (above)
      // revalidates on the byte content rather than falling back to a full
      // re-download every five minutes. `If-None-Match` is answered with a
      // bodyless 304 the moment it matches: unchanged bytes cost the browser one
      // small round trip instead of the whole file, and changed ones (a resize,
      // a Replace) are served fresh the moment the old entry expires rather than
      // up to a year later. The worker still fetches the object from its
      // provider either way - that leg is same-region object storage, not the
      // shopper's own connection, which is the one this is actually shortening.
      const upstreamEtag = upstream.headers.get('ETag')
      if (upstreamEtag) {
        responseHeaders.set('ETag', upstreamEtag)
        if (request.headers.get('If-None-Match') === upstreamEtag) {
          return new Response(null, { status: 304, headers: responseHeaders })
        }
      }

      // The stored Content-Type is attacker-influenced on any object written
      // before uploads were type-checked, so it is not trusted on the way out:
      // an image type is echoed (Cloudflare image resizing legitimately converts
      // jpeg → webp/avif here, so the upstream value is the accurate one), and
      // anything else is served as an inert download rather than rendered.
      const upstreamType = (upstream.headers.get('Content-Type') ?? '').split(';')[0]!.trim().toLowerCase()
      if (SERVABLE_IMAGE_TYPES.has(upstreamType)) {
        responseHeaders.set('Content-Type', upstreamType)
      } else {
        responseHeaders.set('Content-Type', 'application/octet-stream')
        responseHeaders.set('Content-Disposition', 'attachment')
      }

      return new Response(upstream.body, { status: 200, headers: responseHeaders })
    } catch {
      return readError('Upstream error', 502, env)
    }
  },
}
export default worker

/**
 * A refusal on the READ path, carrying the same CORS header the success path does.
 *
 * The header is the whole point of this existing. Every read that matters here is
 * cross-origin - the site is on one host and this Worker on another - and a
 * response with no `Access-Control-Allow-Origin` is not a response the browser
 * will hand to the page at all. It rejects the `fetch()` with a bare TypeError
 * instead, so the caller cannot read the status, cannot read the body, and cannot
 * tell a deleted file from an expired token from a storage outage. The 3D viewer
 * has a perfectly good "Could not fetch model (404 Not Found)" message that could
 * never once fire; what an admin saw was Safari's "Load failed", which says
 * nothing and points nowhere. An FBX that was drawing at 1/100th scale and a GLB
 * whose object had been deleted produced the identical, useless sentence.
 *
 * Sending the header on a refusal leaks nothing: the status and the four words of
 * body are exactly what the requester would have got same-origin, and a
 * mismatched Origin is already turned away by refuseUnauthorisedRead before this.
 *
 * `no-store` because the success path sets `immutable` for a year, and a
 * momentary upstream failure that got cached under that rule would outlive the
 * problem by rather a lot.
 */
function readError(message: string, status: number, env: Env): Response {
  return new Response(message, {
    status,
    headers: {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN ?? '*',
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain;charset=UTF-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

// ---------------------------------------------------------------------------
// Protected reads — signed access to 3D models
// ---------------------------------------------------------------------------

// The reason a model needs this at all: a WebGL canvas fetches the file itself,
// so the bytes must reach the visitor's machine and the url must reach their
// browser. What a token changes is the SHELF LIFE of that url. Copy one out of
// view-source and it stops working within a day or two; embed one on another
// shop's product page and it breaks by itself without anyone policing it.
//
// It is not a claim that the model cannot be taken. Anything on screen in a 3D
// viewer can be captured by someone determined enough. This raises the floor from
// "right-click, save" to "build and maintain a scraper", which is where the
// casual copying actually stops.
//
// Returns a Response to refuse with, or null to let the read proceed.
async function refuseUnauthorisedRead(
  request: Request,
  url: URL,
  fullKey: string,
  env: Env,
): Promise<Response | null> {
  // No secret pushed = this Worker has not been told to enforce. Serve as before.
  // Keeps an un-redeployed Worker working instead of blanking every model on the
  // site the moment the app starts signing urls.
  if (!env.ASSET_SIGNING_SECRET) return null

  // A mismatched Origin is somebody else's page embedding our model, which is
  // never legitimate, so it is refused before the signature is even checked. An
  // ABSENT Origin is deliberately allowed through to the signature check: not
  // every fetch that reaches here carries one, and a false refusal here means a
  // blank viewer on a real shopper's product page. The token is the control that
  // does the work; this is a cheap extra that costs no round-trip.
  const origin = request.headers.get('origin')
  if (origin && env.ALLOWED_ORIGIN && origin !== env.ALLOWED_ORIGIN) {
    return readError('Not authorised', 403, env)
  }

  const token = url.searchParams.get('t') ?? ''
  if (!(await verifyAssetToken(env.ASSET_SIGNING_SECRET, fullKey, token, Date.now()))) {
    return readError('Not authorised', 403, env)
  }

  return null
}

// Verify a `<exp>.<sig>` read token: signature over "<key>\n<exp>", not expired.
// Same shape as the upload token, verified under a different derived key so a
// token minted for one path can never be replayed against the other.
async function verifyAssetToken(secret: string, key: string, token: string, nowMs: number): Promise<boolean> {
  const dot = token.indexOf('.')
  if (dot === -1) return false
  const exp = Number(token.slice(0, dot))
  const sig = token.slice(dot + 1)
  if (!Number.isFinite(exp) || exp < nowMs) return false
  const expected = base64url(await hmac(new TextEncoder().encode(secret), `${key}\n${exp}`))
  return constantTimeEqual(sig, expected)
}

// ---------------------------------------------------------------------------
// Upload (PUT) — authorised direct writes from the browser
// ---------------------------------------------------------------------------

// CORS headers for the upload endpoint. The site PUTs from its own origin, so
// the browser preflights (PUT + Authorization are non-simple). Every upload
// response echoes these so the browser can read the result.
function corsHeaders(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '86400',
  }
}

function uploadError(message: string, status: number, env: Env): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders(env), 'content-type': 'application/json' },
  })
}

// The provider that owns a key, from its path. Mirrors the GET-side resolution:
// "media/<PROVIDER>/…" → that provider; legacy "media/…" → B2.
function providerFromKey(fullKey: string): string {
  const afterMedia = fullKey.slice('media/'.length)
  const slashIdx = afterMedia.indexOf('/')
  const maybeProvider = slashIdx !== -1 ? afterMedia.slice(0, slashIdx) : ''
  return KNOWN_PROVIDERS.has(maybeProvider) ? maybeProvider : 'B2'
}

async function handleUpload(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.UPLOAD_SIGNING_SECRET) {
    return uploadError('Uploads are not enabled on this Worker.', 503, env)
  }

  const fullKey = url.pathname.slice(1)
  if (!fullKey.startsWith('media/') || fullKey.length < 8) {
    return uploadError('Invalid object key.', 400, env)
  }

  // Verify the signed, key-bound, short-lived token before doing any work.
  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!(await verifyUploadToken(env.UPLOAD_SIGNING_SECRET, fullKey, token, Date.now()))) {
    return uploadError('Not authorised to upload here.', 403, env)
  }

  const provider = providerFromKey(fullKey)
  const params = s3ParamsFor(provider, env)
  if (!params) {
    // Only the S3-compatible family accepts Worker writes; the app never signs a
    // token for anything else, so this is a defensive guard.
    return uploadError(`Uploads to ${provider} are not supported here.`, 400, env)
  }

  // The stored Content-Type comes from the KEY, never from the client's header.
  // The key is covered by the signature and the app derives its extension from a
  // validated type, so the extension is the one type claim here that can't be
  // tampered with. Trusting the header instead let a holder of media.upload PUT
  // `Content-Type: text/html` with a script body and have it served back as
  // executable HTML from the media origin.
  const contentType = contentTypeForKey(fullKey)
  if (!contentType || contentType === 'image/svg+xml') {
    // SVG is deliberately excluded: it's markup, and only the app's serverless
    // path sanitises it. The Worker never stores one.
    return uploadError('Only raster image and 3D model uploads are accepted here.', 415, env)
  }

  // Bound the body before reading it. The Worker buffers the whole payload into
  // memory to hash it, so an unbounded PUT is a cheap way to exhaust the isolate.
  const declared = Number(request.headers.get('content-length') ?? NaN)
  if (!Number.isFinite(declared) || declared <= 0) {
    return uploadError('A Content-Length header is required.', 411, env)
  }
  if (declared > UPLOAD_MAX_BYTES) {
    return uploadError(`File is larger than the ${UPLOAD_MAX_BYTES / 1024 / 1024} MB limit.`, 413, env)
  }

  try {
    // Buffer the body: it gives storage a definite Content-Length (some S3
    // providers reject chunked PUTs), lets us sign the real payload hash below,
    // and sidesteps request-stream duplex quirks.
    const bytes = await request.arrayBuffer()
    // A lying Content-Length gets nothing: the real length has to match what was
    // declared and bounds-checked above.
    if (bytes.byteLength !== declared) {
      return uploadError('Body size did not match Content-Length.', 400, env)
    }

    const put = await putS3Compatible(params, fullKey, bytes, contentType)
    if (!put.ok) {
      return uploadError(`Storage rejected the upload (${put.status}).`, 502, env)
    }
    return new Response(JSON.stringify({ ok: true, key: fullKey }), {
      status: 200,
      headers: { ...corsHeaders(env), 'content-type': 'application/json' },
    })
  } catch {
    return uploadError('Upload failed reaching storage.', 502, env)
  }
}

type S3Params = {
  endpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  region: string
}

// Endpoint/bucket/creds/region for each S3-compatible provider, matching the
// GET-side fetchFromProvider switch. Returns null for non-S3 providers.
function s3ParamsFor(provider: string, env: Env): S3Params | null {
  switch (provider) {
    case 'B2':
      return { endpoint: env.B2_ENDPOINT ?? '', bucket: env.B2_BUCKET_NAME ?? '', accessKeyId: env.B2_APPLICATION_KEY_ID ?? '', secretAccessKey: env.B2_APPLICATION_KEY ?? '', region: 'auto' }
    case 'R2':
      return { endpoint: `https://${env.R2_ACCOUNT_ID ?? ''}.r2.cloudflarestorage.com`, bucket: env.R2_BUCKET_NAME ?? '', accessKeyId: env.R2_ACCESS_KEY_ID ?? '', secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? '', region: 'auto' }
    case 'S3':
      return { endpoint: `https://s3.${env.S3_REGION ?? 'us-east-1'}.amazonaws.com`, bucket: env.S3_BUCKET_NAME ?? '', accessKeyId: env.S3_ACCESS_KEY_ID ?? '', secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '', region: env.S3_REGION ?? 'us-east-1' }
    case 'SPACES':
      return { endpoint: `https://${env.SPACES_REGION ?? 'nyc3'}.digitaloceanspaces.com`, bucket: env.SPACES_BUCKET_NAME ?? '', accessKeyId: env.SPACES_ACCESS_KEY_ID ?? '', secretAccessKey: env.SPACES_SECRET_ACCESS_KEY ?? '', region: env.SPACES_REGION ?? 'nyc3' }
    case 'WASABI':
      return { endpoint: `https://s3.${env.WASABI_REGION ?? 'us-east-1'}.wasabisys.com`, bucket: env.WASABI_BUCKET_NAME ?? '', accessKeyId: env.WASABI_ACCESS_KEY_ID ?? '', secretAccessKey: env.WASABI_SECRET_ACCESS_KEY ?? '', region: env.WASABI_REGION ?? 'us-east-1' }
    case 'MINIO':
      return { endpoint: env.MINIO_ENDPOINT ?? '', bucket: env.MINIO_BUCKET_NAME ?? '', accessKeyId: env.MINIO_ACCESS_KEY_ID ?? '', secretAccessKey: env.MINIO_SECRET_ACCESS_KEY ?? '', region: 'us-east-1' }
    default:
      return null
  }
}

// SigV4-signed PUT. Signs the real SHA-256 payload hash (maximally compatible
// across S3-compatible providers, including Backblaze B2). Content-Type is sent
// unsigned - S3 still stores it - so it need not be part of the signature.
async function putS3Compatible(
  p: S3Params,
  key: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<Response> {
  const base = normalizeEndpoint(p.endpoint)
  const objectUrl = `${base}/${p.bucket}/${key}`
  const url = new URL(objectUrl)

  const now = new Date()
  const dateStamp = formatDate(now)
  const amzDate = formatAmzDate(now)
  const payloadHash = await sha256hexBytes(body)

  const headers: Record<string, string> = {
    host: url.hostname,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  }
  const sortedHeaders = Object.entries(headers).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const signedHeaders = sortedHeaders.map(([k]) => k).join(';')

  const canonicalRequest = [
    'PUT',
    url.pathname,
    url.search.slice(1),
    sortedHeaders.map(([k, v]) => `${k}:${v}`).join('\n') + '\n',
    signedHeaders,
    payloadHash,
  ].join('\n')

  const credentialScope = `${dateStamp}/${p.region}/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256hex(canonicalRequest),
  ].join('\n')

  const signingKey = await deriveSigningKey(p.secretAccessKey, dateStamp, p.region)
  const signature = await hmacHex(signingKey, stringToSign)

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${p.accessKeyId}/${credentialScope},` +
    `SignedHeaders=${signedHeaders},Signature=${signature}`

  return fetch(objectUrl, {
    method: 'PUT',
    headers: { ...headers, 'content-type': contentType, Authorization: authorization },
    body,
  })
}

// Verify a `<exp>.<sig>` upload token: signature over "<key>\n<exp>" with the
// shared secret, and not past its expiry. Constant-time signature compare.
async function verifyUploadToken(secret: string, key: string, token: string, nowMs: number): Promise<boolean> {
  const dot = token.indexOf('.')
  if (dot === -1) return false
  const exp = Number(token.slice(0, dot))
  const sig = token.slice(dot + 1)
  if (!Number.isFinite(exp) || exp < nowMs) return false
  const expected = base64url(await hmac(new TextEncoder().encode(secret), `${key}\n${exp}`))
  return constantTimeEqual(sig, expected)
}

function base64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ---------------------------------------------------------------------------
// Per-provider fetch
// ---------------------------------------------------------------------------

async function fetchFromProvider(
  provider: string,
  fullKey: string,
  env: Env,
  cfOptions: RequestInit['cf'],
): Promise<Response> {
  switch (provider) {
    case 'B2':
      return fetchS3Compatible(
        env.B2_ENDPOINT ?? '',
        env.B2_BUCKET_NAME ?? '',
        fullKey,
        env.B2_APPLICATION_KEY_ID ?? '',
        env.B2_APPLICATION_KEY ?? '',
        'auto',
        cfOptions,
      )

    case 'R2':
      return fetchS3Compatible(
        `https://${env.R2_ACCOUNT_ID ?? ''}.r2.cloudflarestorage.com`,
        env.R2_BUCKET_NAME ?? '',
        fullKey,
        env.R2_ACCESS_KEY_ID ?? '',
        env.R2_SECRET_ACCESS_KEY ?? '',
        'auto',
        cfOptions,
      )

    case 'S3':
      return fetchS3Compatible(
        `https://s3.${env.S3_REGION ?? 'us-east-1'}.amazonaws.com`,
        env.S3_BUCKET_NAME ?? '',
        fullKey,
        env.S3_ACCESS_KEY_ID ?? '',
        env.S3_SECRET_ACCESS_KEY ?? '',
        env.S3_REGION ?? 'us-east-1',
        cfOptions,
      )

    case 'SPACES':
      return fetchS3Compatible(
        `https://${env.SPACES_REGION ?? 'nyc3'}.digitaloceanspaces.com`,
        env.SPACES_BUCKET_NAME ?? '',
        fullKey,
        env.SPACES_ACCESS_KEY_ID ?? '',
        env.SPACES_SECRET_ACCESS_KEY ?? '',
        env.SPACES_REGION ?? 'nyc3',
        cfOptions,
      )

    case 'WASABI':
      return fetchS3Compatible(
        `https://s3.${env.WASABI_REGION ?? 'us-east-1'}.wasabisys.com`,
        env.WASABI_BUCKET_NAME ?? '',
        fullKey,
        env.WASABI_ACCESS_KEY_ID ?? '',
        env.WASABI_SECRET_ACCESS_KEY ?? '',
        env.WASABI_REGION ?? 'us-east-1',
        cfOptions,
      )

    case 'MINIO':
      return fetchS3Compatible(
        env.MINIO_ENDPOINT ?? '',
        env.MINIO_BUCKET_NAME ?? '',
        fullKey,
        env.MINIO_ACCESS_KEY_ID ?? '',
        env.MINIO_SECRET_ACCESS_KEY ?? '',
        'us-east-1',
        cfOptions,
      )

    case 'VERCEL_BLOB': {
      // Vercel Blob: fetch directly from the blob store URL.
      // BLOB_BASE_URL is the base URL of the store (returned by @vercel/blob as the URL prefix).
      const blobUrl = `${env.BLOB_BASE_URL?.replace(/\/$/, '') ?? ''}/${fullKey}`
      return fetch(blobUrl, {
        headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN ?? ''}` },
        cf: cfOptions,
      })
    }

    case 'SUPABASE_STORAGE': {
      // Supabase Storage: authenticated download via REST API.
      const projectUrl = env.SUPABASE_STORAGE_PROJECT_URL?.replace(/\/$/, '') ?? ''
      const bucket = env.SUPABASE_STORAGE_BUCKET_NAME ?? ''
      const supabaseUrl = `${projectUrl}/storage/v1/object/authenticated/${bucket}/${fullKey}`
      return fetch(supabaseUrl, {
        headers: { Authorization: `Bearer ${env.SUPABASE_STORAGE_SERVICE_ROLE_KEY ?? ''}` },
        cf: cfOptions,
      })
    }

    default:
      return new Response('Unknown provider', { status: 404 }) as unknown as Response
  }
}

// ---------------------------------------------------------------------------
// AWS SigV4 for S3-compatible endpoints
// ---------------------------------------------------------------------------

// Provider endpoints (B2, MinIO) arrive straight from the operator's stored
// secret and may lack a scheme, e.g. "s3.eu-central-003.backblazeb2.com". The
// new URL() below would throw "Invalid URL" on such a value, turning every media
// request into a 502. Prepend https:// when no scheme is present; an explicit
// http:// is preserved for self-hosted MinIO over plain HTTP.
function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, '')
  if (!trimmed) return trimmed
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

async function fetchS3Compatible(
  endpoint: string,
  bucket: string,
  key: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  cfOptions: RequestInit['cf'],
): Promise<Response> {
  const base = normalizeEndpoint(endpoint)
  const objectUrl = `${base}/${bucket}/${key}`
  const url = new URL(objectUrl)

  const now = new Date()
  const dateStamp = formatDate(now)          // YYYYMMDD
  const amzDate = formatAmzDate(now)         // YYYYMMDDTHHMMSSZ

  const headers: Record<string, string> = {
    host: url.hostname,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // SHA256 of empty body
  }

  // SigV4 requires the canonical headers block and the SignedHeaders list to be
  // sorted by lowercase header name, and the two must agree. Derive both from a
  // single sorted list so they can never drift: an unsorted block signs a
  // different string than the server rebuilds, which B2/S3 reject as
  // SignatureDoesNotMatch — surfacing here as a 502 "Upstream error".
  const sortedHeaders = Object.entries(headers).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const signedHeaders = sortedHeaders.map(([k]) => k).join(';')

  const canonicalRequest = [
    'GET',
    url.pathname,
    url.search.slice(1),
    sortedHeaders.map(([k, v]) => `${k}:${v}`).join('\n') + '\n',
    signedHeaders,
    headers['x-amz-content-sha256'],
  ].join('\n')

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256hex(canonicalRequest),
  ].join('\n')

  const signingKey = await deriveSigningKey(secretAccessKey, dateStamp, region)
  const signature = await hmacHex(signingKey, stringToSign)

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope},` +
    `SignedHeaders=${signedHeaders},Signature=${signature}`

  return fetch(objectUrl, {
    headers: { ...headers, Authorization: authorization },
    cf: cfOptions,
  })
}

// ---------------------------------------------------------------------------
// Cloudflare Image Resizing options
// ---------------------------------------------------------------------------

function buildImageResizingOptions(url: URL): RequestInit['cf'] {
  const w = url.searchParams.get('w') ?? url.searchParams.get('width')
  const q = url.searchParams.get('q') ?? url.searchParams.get('quality')
  if (!w) return undefined
  return {
    image: {
      width: parseInt(w, 10),
      quality: q ? parseInt(q, 10) : 80,
      format: 'auto',
      fit: 'scale-down',
    },
  }
}

// ---------------------------------------------------------------------------
// Crypto helpers (Web Crypto API, available in Workers)
// ---------------------------------------------------------------------------

async function sha256hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
  return hex(buf)
}

async function sha256hexBytes(data: ArrayBuffer): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', data))
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key instanceof ArrayBuffer ? key : key.buffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  )
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data))
}

async function hmacHex(key: ArrayBuffer | Uint8Array, data: string): Promise<string> {
  return hex(await hmac(key, data))
}

async function deriveSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
): Promise<ArrayBuffer> {
  const kDate = await hmac(new TextEncoder().encode(`AWS4${secretKey}`), dateStamp)
  const kRegion = await hmac(kDate, region)
  const kService = await hmac(kRegion, 's3')
  return hmac(kService, 'aws4_request')
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

function formatAmzDate(d: Date): string {
  return d.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z'
}
