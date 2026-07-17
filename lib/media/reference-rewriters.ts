import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'

// Contract for the "core.media-reference-rewriters" extension point.
//
// The media library can move a blob to a fresh storage key and url without
// changing the item's identity: optimise (re-encode to WebP), resize, crop,
// replace-file, and rename/move all do. Core rewrites every reference it owns for
// the move - the url/key/id embedded in Puck page and layout builder JSON (see
// rewriteMediaReferencesInContent in lib/media/upload.ts). What it cannot reach
// is a url a MODULE keeps in its own table: the shop stores each product image's
// url in shp_product_media, and shop-variations keeps an image-swatch url in
// svr_option_values. Left untouched, those columns point at a blob that has just
// been deleted, so the storefront 404s while the library looks perfectly healthy.
//
// A module that stores media urls in its own tables registers one rewriter here,
// keyed by its module id, and core runs every registered rewriter as the final
// step of a reference rewrite. Mirrors core.menu-entity-provider: a plain async
// function discovered through the active modules' manifests, with core knowing
// none of the table names.
//
// A rewriter is allowed to throw. Core runs the rewrite BEFORE it deletes the
// blob the move superseded (see repointMediaToBlob / moveOrRenameMedia), so a
// throw aborts the whole operation with the old blob still in place and the old
// url still resolving - a loud, recoverable failure rather than a silent 404.
export type MediaReferenceChange = {
  // The blob's public url before and after the move.
  oldUrl: string
  newUrl: string
  // The provider storage key before and after. Either pair may be equal when only
  // the other changed; the dedupe path passes media ids in these two slots. Treat
  // all four as opaque strings and only rewrite a value a column actually holds.
  oldKey: string
  newKey: string
}

export type MediaReferenceRewriter = (change: MediaReferenceChange) => Promise<void>

/** Every module-registered media reference rewriter, in no guaranteed order. */
export function getMediaReferenceRewriters(): MediaReferenceRewriter[] {
  const map = moduleExtensionPointComponents['core.media-reference-rewriters'] as
    | Record<string, MediaReferenceRewriter>
    | undefined
  return map ? Object.values(map) : []
}
