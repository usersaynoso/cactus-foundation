import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canServeDirect, directResizeMode, isDirectMediaUrl, mediaServingMode, servesDirect } from './serving-mode'
import { envKeysForProvider } from './providers'
import { directBucketCspSources } from './bucket-origins'
import { providerForMediaKey, servedCacheControl, servedContentType } from './serve-rules'
import mediaLoader from './loader'

// Direct serving mode must change NOTHING for an install that has not asked for it.
// These pin the Worker-mode answers every existing install relies on, then show
// the direct-mode answers only appear once MEDIA_SERVING_MODE says so.

const KEYS = [
  'MEDIA_SERVING_MODE', 'CACTUS_MEDIA_SERVING_MODE', 'MEDIA_DIRECT_RESIZE', 'CACTUS_MEDIA_DIRECT_RESIZE',
  'NEXT_PUBLIC_CLOUDFLARE_WORKER_URL', 'B2_BUCKET_NAME', 'B2_ENDPOINT', 'R2_BUCKET_NAME', 'R2_ACCOUNT_ID',
  'MINIO_BUCKET_NAME', 'MINIO_ENDPOINT',
]
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k] }
})
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
  vi.unstubAllEnvs()
})

describe('an install that has not chosen a serving mode (every install before this existed)', () => {
  it('is in Worker mode and still asks for the Worker for every proxied provider', () => {
    expect(mediaServingMode()).toBe('worker')
    expect(directResizeMode()).toBe('off')
    for (const p of ['B2', 'R2', 'S3', 'SPACES', 'WASABI', 'MINIO', 'VERCEL_BLOB', 'SUPABASE_STORAGE'] as const) {
      expect(servesDirect(p)).toBe(false)
      expect(envKeysForProvider(p)).toContain('CLOUDFLARE_WORKER_URL')
    }
  })

  it('adds nothing to the content security policy', () => {
    process.env.B2_BUCKET_NAME = 'photos'
    process.env.B2_ENDPOINT = 's3.eu-central-003.backblazeb2.com'
    expect(directBucketCspSources()).toEqual([])
  })

  it('hands the loader exactly the Worker url it always did', () => {
    process.env.NEXT_PUBLIC_CLOUDFLARE_WORKER_URL = 'https://media.example.com'
    const src = 'https://media.example.com/media/AbCdEfGhIjKlMnOpQrStU-desk.jpg'
    expect(mediaLoader({ src, width: 640 })).toBe(`${src}?w=640&q=80`)
    expect(mediaLoader({ src: 'media/x.jpg', width: 320, quality: 60 })).toBe('https://media.example.com/media/x.jpg?w=320&q=60')
    // Cloudinary and ImageKit are untouched too.
    expect(mediaLoader({ src: 'https://res.cloudinary.com/demo/image/upload/a.jpg', width: 100 }))
      .toBe('https://res.cloudinary.com/demo/image/upload/w_100,q_80/a.jpg')
  })
})

describe('direct serving mode', () => {
  it('only switches on when chosen, and only for the S3-style providers', () => {
    process.env.MEDIA_SERVING_MODE = 'direct'
    expect(mediaServingMode()).toBe('direct')
    for (const p of ['B2', 'R2', 'S3', 'SPACES', 'WASABI', 'MINIO'] as const) {
      expect(canServeDirect(p)).toBe(true)
      expect(envKeysForProvider(p)).not.toContain('CLOUDFLARE_WORKER_URL')
    }
    // Vercel Blob and Supabase cannot be presigned: still Worker-only.
    for (const p of ['VERCEL_BLOB', 'SUPABASE_STORAGE'] as const) {
      expect(servesDirect(p)).toBe(false)
      expect(envKeysForProvider(p)).toContain('CLOUDFLARE_WORKER_URL')
    }
  })

  it('reads the build-time copy first, so server and browser agree', () => {
    process.env.CACTUS_MEDIA_SERVING_MODE = 'direct'
    expect(mediaServingMode()).toBe('direct')
    process.env.CACTUS_MEDIA_DIRECT_RESIZE = 'platform'
    expect(directResizeMode()).toBe('platform')
  })

  it('recognises its own urls by path and never mistakes a Worker url for one', () => {
    expect(isDirectMediaUrl('https://shop.example/api/media/media/R2/a.jpg')).toBe(true)
    expect(isDirectMediaUrl('/api/media/media/a.jpg')).toBe(true)
    expect(isDirectMediaUrl('https://media.example.com/media/a.jpg')).toBe(false)
    expect(isDirectMediaUrl('not a url')).toBe(false)
  })

  it('serves the original through the loader, leaving Worker urls alone', () => {
    process.env.NEXT_PUBLIC_CLOUDFLARE_WORKER_URL = 'https://media.example.com'
    const direct = 'https://shop.example/api/media/media/B2/AbCdEfGhIjKlMnOpQrStU-desk.jpg'
    expect(mediaLoader({ src: direct, width: 640 })).toBe(direct)
    expect(mediaLoader({ src: 'https://media.example.com/media/a.jpg', width: 640 })).toBe('https://media.example.com/media/a.jpg?w=640&q=80')
  })

  it('names each configured bucket host in the policy', () => {
    process.env.MEDIA_SERVING_MODE = 'direct'
    process.env.B2_BUCKET_NAME = 'photos'
    process.env.B2_ENDPOINT = 's3.eu-central-003.backblazeb2.com'
    process.env.R2_BUCKET_NAME = 'pics'
    process.env.R2_ACCOUNT_ID = 'abc123'
    process.env.MINIO_BUCKET_NAME = 'm'
    process.env.MINIO_ENDPOINT = 'http://minio.local:9000'
    expect(directBucketCspSources()).toEqual([
      'https://s3.eu-central-003.backblazeb2.com',
      'https://*.s3.eu-central-003.backblazeb2.com',
      'https://abc123.r2.cloudflarestorage.com',
      'https://*.abc123.r2.cloudflarestorage.com',
      'http://minio.local:9000',
    ])
  })
})

describe('the read rules /api/media shares with the Worker', () => {
  it('finds the provider from the key, legacy B2 included, and refuses anything else', () => {
    expect(providerForMediaKey('media/R2/folder/a.jpg')).toBe('R2')
    expect(providerForMediaKey('media/abc.jpg')).toBe('B2')
    expect(providerForMediaKey('media/folder/abc.jpg')).toBe('B2')
    expect(providerForMediaKey('other/abc.jpg')).toBeNull()
    expect(providerForMediaKey('media/')).toBeNull()
    expect(providerForMediaKey('media/R2/../secret.jpg')).toBeNull()
    expect(providerForMediaKey('media//a.jpg')).toBeNull()
  })

  it('types files by extension, opaque by default', () => {
    expect(servedContentType('media/a.jpg')).toBe('image/jpeg')
    expect(servedContentType('media/a.avif')).toBe('image/avif')
    expect(servedContentType('media/a.glb')).toBe('model/gltf-binary')
    expect(servedContentType('media/a.html')).toBe('application/octet-stream')
  })

  it('caches the way the Worker does', () => {
    const forever = 'public, max-age=31536000, immutable'
    const short = 'public, max-age=300, must-revalidate'
    expect(servedCacheControl('media/AbCdEfGhIjKlMnOpQrStU-desk.jpg', false)).toBe(forever)
    expect(servedCacheControl('media/oak-swatch.jpg', false)).toBe(short)
    expect(servedCacheControl('media/oak-swatch-thumb.jpg', false)).toBe(forever)
    expect(servedCacheControl('media/chair.glb', true)).toBe(forever)
    expect(servedCacheControl('media/AbCdEfGhIjKlMnOpQrStU-clip.mp4', false)).toBe(short)
  })
})

describe('direct upload headers', () => {
  it('sends the bearer to a Worker and nothing but the type to a presigned bucket url', async () => {
    const { directUploadHeaders } = await import('./direct-upload-headers')
    expect(directUploadHeaders({ token: 't' }, 'image/webp')).toEqual({ 'content-type': 'image/webp', authorization: 'Bearer t' })
    expect(directUploadHeaders({ token: 't', presigned: false }, 'image/webp')).toEqual({ 'content-type': 'image/webp', authorization: 'Bearer t' })
    expect(directUploadHeaders({ token: 't', presigned: true }, 'image/webp')).toEqual({ 'content-type': 'image/webp' })
  })
})
