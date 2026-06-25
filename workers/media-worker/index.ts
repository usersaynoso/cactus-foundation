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

export interface Env {
  ALLOWED_ORIGIN: string

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 })
    }

    // Strip leading slash → full storage key, e.g. "media/R2/abc.jpg"
    const fullKey = url.pathname.slice(1)

    if (!fullKey || fullKey.length < 2) {
      return new Response('Not found', { status: 404 })
    }

    if (!fullKey.startsWith('media/')) {
      return new Response('Not found', { status: 404 })
    }

    // Determine which provider owns this key.
    // Key format: media/<PROVIDER>/<rest>   — new style
    //             media/<rest>              — legacy B2 key (no provider segment)
    const afterMedia = fullKey.slice('media/'.length) // e.g. "R2/abc.jpg" or "abc.jpg"
    const slashIdx = afterMedia.indexOf('/')
    const maybeProvider = slashIdx !== -1 ? afterMedia.slice(0, slashIdx) : ''
    const provider: string = KNOWN_PROVIDERS.has(maybeProvider) ? maybeProvider : 'B2'

    const cfOptions = buildImageResizingOptions(url)
    const responseHeaders = new Headers({
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Vary': 'Accept',
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN ?? '*',
    })

    try {
      const upstream = await fetchFromProvider(provider, fullKey, env, cfOptions)
      if (!upstream.ok) {
        return new Response(upstream.status === 404 ? 'Not found' : 'Upstream error', {
          status: upstream.status === 404 ? 404 : 502,
        })
      }
      responseHeaders.set('Content-Type', upstream.headers.get('Content-Type') ?? 'application/octet-stream')
      return new Response(upstream.body, { status: 200, headers: responseHeaders })
    } catch {
      return new Response('Upstream error', { status: 502 })
    }
  },
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

async function fetchS3Compatible(
  endpoint: string,
  bucket: string,
  key: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  cfOptions: RequestInit['cf'],
): Promise<Response> {
  const base = endpoint.replace(/\/$/, '')
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

  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'

  const canonicalRequest = [
    'GET',
    url.pathname,
    url.search.slice(1),
    Object.entries(headers).map(([k, v]) => `${k}:${v}`).join('\n') + '\n',
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
