import { THUMB_RENDITION_MAX_PX, THUMB_RENDITION_SUFFIX } from '@/lib/media/thumb-renditions'
import { SWATCH_SMALL_MAX_PX, SWATCH_TINY_MAX_PX } from '@/lib/media/swatch-renditions'

// What a shrunk copy is CALLED and WHERE it is filed - with no sharp in sight.
//
// Split out of renditions.ts because the resizer drags sharp (and libvips) in
// with it, and two things need to reason about a rendition without ever making
// one: lib/media/organise.ts, which has to recognise a rendition while moving it
// so it does not try to carry renditions of a rendition, and the client-side
// callers that only want the folder's name. A static import of the resizer from
// either would put an image library into bundles that never resize anything.

/**
 * The subfolder a shrunk copy is filed in, inside its original's own folder.
 *
 * Originals stay where they are and their copies go one level down, so a
 * product's folder reads as the product's pictures rather than as each picture
 * twice over. On the catalogue this was written for that is 28,335 photographs
 * and 40,314 copies of them sharing 1,274 folders - the copies outnumbered the
 * pictures, and finding anything by eye meant reading past them.
 *
 * The display name and the storage segment are deliberately the same word: the
 * segment is what sanitizeFolderSegment makes of the name, and "thumb" survives
 * that untouched, so a path can be derived by appending it rather than by
 * resolving the folder row all over again.
 */
export const RENDITION_FOLDER_NAME = 'thumb'

export type RenditionSpec = {
  // The copy's longest edge.
  maxPx: number
  // The tail added to the file's name: "small" gives "oak-small.webp".
  suffix: string
}

// Every shrunk-copy size core knows how to make, so an in-place edit of an
// original can remake whatever copies it happens to have without being told which
// ones exist, and a move of an original can carry them.
//
// Kept here rather than in either constants file because it is the union of both,
// and because nothing else needs to reason about the whole set. A module adding a
// size of its own should add it here too - otherwise an edit to the original will
// leave that module's copy showing the pre-edit picture, which is a silent kind
// of wrong.
export const KNOWN_RENDITION_SPECS: RenditionSpec[] = [
  { maxPx: THUMB_RENDITION_MAX_PX, suffix: THUMB_RENDITION_SUFFIX },
  { maxPx: SWATCH_SMALL_MAX_PX, suffix: 'small' },
  { maxPx: SWATCH_TINY_MAX_PX, suffix: 'tiny' },
]

/**
 * The name a rendition of `key` is filed under.
 *
 * Derived from the ORIGINAL's storage key, exactly as the writer derives it, so
 * the two can never drift: whatever nanoid prefix the ORIGINAL's own key carries
 * is carried into its rendition's NAME, which is what makes the name specific
 * enough to look up again.
 */
export function renditionFileName(key: string, suffix: string): string {
  return `${renditionStem(key)}-${suffix}.webp`
}

/**
 * The part of a key a rendition's name is built from: its basename with the
 * extension taken off. `shop/oak.png` and `shop/oak.webp` share the stem `oak`,
 * which is exactly why two originals can answer to one copy's name.
 */
export function renditionStem(key: string): string {
  return (key.split('/').pop() ?? 'image').replace(/\.[a-z0-9]+$/i, '')
}

/**
 * Formats sharp can be trusted to shrink well, and so the only originals that
 * ever have copies. SVG scales by nature and GIF may animate - shrinking either
 * buys little or breaks something, so both are left alone and the caller simply
 * keeps using the original.
 *
 * Here rather than beside the resizer so the sharp-free lookup can ask which of a
 * folder's items could be claiming a copy's name.
 */
export const RESIZABLE_RENDITION_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp'])

/**
 * Is this the name of a shrunk copy rather than of a picture in its own right?
 *
 * A pure string test on purpose. It is asked on every media move, where a query
 * per move would be a real cost and where the only thing it has to settle is
 * "does this item have copies of its own to carry?" - and a copy never does.
 *
 * It will say yes to a picture a person happened to upload as "oak-thumb.webp".
 * The cost of that is one carry that finds nothing, which is what would have
 * happened anyway.
 */
export function isRenditionFileName(name: string | null | undefined): boolean {
  if (!name) return false
  const lower = name.toLowerCase()
  return KNOWN_RENDITION_SPECS.some((spec) => lower.endsWith(`-${spec.suffix}.webp`))
}
