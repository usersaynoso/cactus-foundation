// Small shared formatters for the media library UI, so the grid, list, detail
// panel and stat bar all render sizes, dates and filenames identically.

import { extensionForModelType } from '@/lib/media/limits'
import { ALL_PROVIDERS } from '@/lib/media/providers'

// The media-library folder path an item lives in, derived from its storage key.
// Keys are `media/<folderPath>/<file>` (B2) or `media/<PROVIDER>/<folderPath>/<file>`
// for other proxied providers, so strip the leading `media/`, an optional provider
// segment, and the filename - what's left mirrors the library's folder tree.
// Used to prefill a dialog's destination path with the item's
// own folder. Returns a trailing-slashed path, or '' when the item sits at the root.
const PROVIDER_SEGMENTS = new Set<string>(ALL_PROVIDERS.map(String))

export function folderPathOf(item: { key: string }): string {
  const segments = item.key.split('/').filter(Boolean)
  segments.pop() // drop the filename
  if (segments[0] === 'media') segments.shift()
  if (segments[0] && PROVIDER_SEGMENTS.has(segments[0])) segments.shift()
  return segments.length ? `${segments.join('/')}/` : ''
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

export function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function filenameOf(item: { originalName: string | null; key: string }): string {
  return item.originalName || item.key.split('/').pop() || 'Untitled'
}

/** Short, human label for a MIME type, e.g. "image/svg+xml" -> "SVG". */
export function fileKind(mimeType: string): string {
  if (mimeType === 'image/svg+xml') return 'SVG'
  // A 3D type's subtype is not what anyone calls the file: "model/gltf-binary"
  // read as "GLTF-BINARY" in the Type column while the file itself was a .glb.
  // The extension is the name the admin uploaded it under.
  const modelExtension = extensionForModelType(mimeType)
  if (modelExtension) return modelExtension.toUpperCase()
  const [group, sub] = mimeType.split('/')
  if (sub) return sub.toUpperCase()
  return group ? group.toUpperCase() : 'File'
}

// What optimising does to this file, in the tooltip on the ✓ Optimised badge and
// on the ⚡ button that performs it.
//
// The wording has to follow the file, because the two kinds are compressed in
// ways that have nothing to do with each other: an image is re-encoded to WebP,
// while a model has its vertex data packed and its oversized textures brought
// down to a size a screen can actually resolve. A 3D file badged "re-encoded to
// WebP" would be describing a pass that never ran on it.
export function optimiseHint(mimeType: string, done: boolean): string {
  if (mimeType.startsWith('model/')) {
    return done
      ? 'Compressed to download faster, with no visible change to the model'
      : 'Optimise (compress the model so it loads faster)'
  }
  return done ? 'Re-encoded to WebP to save space' : 'Optimise (re-encode to WebP)'
}
