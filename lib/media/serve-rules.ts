// The read rules the media Worker applies, for the site's own /api/media route
// to apply identically in direct serving mode (lib/media/serving-mode.ts).
//
// Each rule here mirrors one in workers/media-worker/index.ts. The Worker is a
// separate deploy that cannot import from the app, so the two are kept in step by
// hand - change one, change the other. Pure functions only; the route does the I/O.

import type { MediaProviderType } from '@prisma/client'
import { contentTypeForKey } from '@/lib/media/limits'

// Mirrors KNOWN_PROVIDERS in the Worker.
const KNOWN_PROVIDERS: ReadonlySet<string> = new Set([
  'B2', 'R2', 'S3', 'SPACES', 'WASABI', 'MINIO', 'VERCEL_BLOB', 'SUPABASE_STORAGE',
])

/**
 * Which provider holds `key`, from the key alone: `media/<PROVIDER>/...` names it,
 * and the legacy prefix-less `media/<rest>` is Backblaze B2. Null for anything
 * outside the media namespace, or a key that tries to climb out of it.
 */
export function providerForMediaKey(key: string): MediaProviderType | null {
  if (!key.startsWith('media/') || key.length <= 'media/'.length) return null
  if (key.split('/').some((part) => part === '' || part === '.' || part === '..')) return null
  const afterMedia = key.slice('media/'.length)
  const slash = afterMedia.indexOf('/')
  const maybe = slash !== -1 ? afterMedia.slice(0, slash) : ''
  return (KNOWN_PROVIDERS.has(maybe) ? maybe : 'B2') as MediaProviderType
}

// The Worker also serves AVIF, which the upload table does not list.
const EXTRA_TYPES: Record<string, string> = { avif: 'image/avif' }

/** The type to serve `key` as. Mirrors the Worker's EXTENSION_TYPES. */
export function servedContentType(key: string): string {
  const fromTable = contentTypeForKey(key)
  if (fromTable) return fromTable
  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase()
  return EXTRA_TYPES[ext] ?? 'application/octet-stream'
}

// Mirrors NANOID_KEY_RE / isExactFormKey in the Worker: a nanoid key's bytes never
// change, an exact-form key can be overwritten in place.
const NANOID_KEY_RE = /^[A-Za-z0-9_-]{21}[-.]/
// Mirrors RENDITION_KEY_RE: renditions are exact-form but never overwritten.
const RENDITION_KEY_RE = /-(?:thumb|small|tiny)(?:-\d+)?\.[a-z0-9]+$/

function basename(key: string): string {
  return key.slice(key.lastIndexOf('/') + 1)
}

/** Mirrors PROTECTED_EXTENSIONS (and lib/media/asset-token.ts): 3D models. */
export { isProtectedAssetKey as isProtectedMediaKey } from '@/lib/media/asset-token'

/**
 * The Cache-Control the bytes are served with. Same answer the Worker gives:
 * forever for a key whose bytes can never change, five minutes and revalidate for
 * one that can be overwritten in place (an exact-form name, or any video, which
 * the optimiser re-encodes over its own key).
 */
export function servedCacheControl(key: string, isProtected: boolean): string {
  const name = basename(key)
  const exactForm = !NANOID_KEY_RE.test(name)
  const rendition = RENDITION_KEY_RE.test(name)
  const video = servedContentType(key).startsWith('video/')
  const forever = (!exactForm || isProtected || rendition) && !video
  return forever ? 'public, max-age=31536000, immutable' : 'public, max-age=300, must-revalidate'
}
