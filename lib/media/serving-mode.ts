// How this install's S3-compatible media is served: through the Cloudflare media
// Worker (the default, and what every install did before this existed), or
// straight from the bucket with no Worker at all.
//
// WORKER  - Media.url is `${CLOUDFLARE_WORKER_URL}/<key>`. The Worker reads the
//           bucket, caches at Cloudflare's edge and resizes on `?w=&q=`.
// DIRECT  - Media.url is `${SITE_URL}/api/media/<key>`. That route applies the
//           same read rules the Worker does and then redirects to a short-lived
//           presigned GET on the bucket, so no file bytes pass through a
//           function. Nothing is cached at an edge, the bucket's own download
//           charges apply, and resizing is either off or the platform's own.
//
// Only the S3-compatible family can be served directly: the redirect target is a
// presigned S3 url. Vercel Blob and Supabase Storage stay Worker-only, as do
// Cloudinary and ImageKit, which never used the Worker in the first place.
//
// The choice is an environment variable rather than a SiteConfig column because
// it has to be answered synchronously - isMediaProviderConfigured() is called by
// core and by a dozen modules without an await - and because the image loader,
// the CSP and next.config's image settings all need it at build time. Changing
// it is a redeploy, exactly like changing the provider's credentials.
//
// next.config copies both variables into CACTUS_MEDIA_* under `env`, which Next
// inlines into the client bundle too, so the browser-side loader and the admin
// page read the same answer the server does. The runtime names are read as a
// fallback so tests and scripts that set process.env directly also work.
//
// A leaf on purpose: no imports beyond a type, so the client loader, the proxy
// and lib/media/providers.ts can all take it without dragging anything along.

import type { MediaProviderType } from '@prisma/client'

export const MEDIA_SERVING_MODE_VAR = 'MEDIA_SERVING_MODE'
export const MEDIA_DIRECT_RESIZE_VAR = 'MEDIA_DIRECT_RESIZE'

export type MediaServingMode = 'worker' | 'direct'

// What the loader does with a directly served picture.
//   off      - serve the original file at every size (the default: costs nothing)
//   platform - hand it to the hosting platform's own image optimisation
export type DirectResizeMode = 'off' | 'platform'

// The path, under the site's own origin, that serves a directly stored object.
// The object key follows it verbatim: /api/media/media/R2/abc.jpg.
export const DIRECT_MEDIA_PATH = '/api/media'

const DIRECT_CAPABLE: ReadonlySet<MediaProviderType> = new Set<MediaProviderType>(['B2', 'R2', 'S3', 'SPACES', 'WASABI', 'MINIO'])

export function canServeDirect(provider: MediaProviderType): boolean {
  return DIRECT_CAPABLE.has(provider)
}

export function mediaServingMode(): MediaServingMode {
  const raw = (process.env.CACTUS_MEDIA_SERVING_MODE || process.env.MEDIA_SERVING_MODE || '').trim().toLowerCase()
  return raw === 'direct' ? 'direct' : 'worker'
}

export function directResizeMode(): DirectResizeMode {
  const raw = (process.env.CACTUS_MEDIA_DIRECT_RESIZE || process.env.MEDIA_DIRECT_RESIZE || '').trim().toLowerCase()
  return raw === 'platform' ? 'platform' : 'off'
}

/** True when `provider`'s files are served from the bucket rather than the Worker. */
export function servesDirect(provider: MediaProviderType): boolean {
  return mediaServingMode() === 'direct' && canServeDirect(provider)
}

/**
 * True for a url in the direct-serving shape, wherever it is hosted. Matched on
 * the path alone so it holds across a change of site address, and so it can
 * never mistake a Worker url (`<worker>/media/...`) for one of these.
 */
export function isDirectMediaUrl(src: string): boolean {
  if (src.startsWith(`${DIRECT_MEDIA_PATH}/`)) return true
  try {
    return new URL(src).pathname.startsWith(`${DIRECT_MEDIA_PATH}/`)
  } catch {
    return false
  }
}
