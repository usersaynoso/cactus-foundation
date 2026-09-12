// Contract for the "core.media-reference-detachers" extension point.
//
// Deleting a library item is the one media operation with no new address to point
// anything at. Every other one moves a blob - optimise, resize, crop, replace,
// rename - and core repoints each reference onto the new url through
// core.media-reference-rewriters. A delete has nowhere to repoint TO, so a
// reference left in place names a blob that is no longer there: on the storefront
// that is a broken image on a live product page, while the library looks
// perfectly healthy.
//
// Core already asks the installed modules whether an item is in use at all
// (core.media-usage-providers) and refuses the delete with a 409 listing what
// holds it. That is the right first answer, and it is not the whole answer: the
// owner who says "delete it anyway" means it, and what they get today is a
// product page with a hole in it.
//
// So a module that stores media urls, keys or ids in its own tables registers one
// detacher here, keyed by its module id, and core runs every registered detacher
// as the last step before the row and the blob go. A detacher does whatever
// "unattached" means for the column it owns: drop the gallery row, blank the
// swatch, null the social image. Core knows none of the table names.
//
// Two rules, both learnt the hard way elsewhere in this file's neighbours:
//
//   - A detacher may throw, and core runs every detacher BEFORE it deletes
//     anything. A throw therefore aborts the delete with the item still present
//     and still serving - a loud, recoverable failure rather than a silent hole
//     in a catalogue.
//   - A detacher must not delete anything a customer or an audit depends on. A
//     purchased download, a proof-of-delivery signature and an order's "report an
//     issue" photograph all hold a media url, and none of them should quietly
//     lose its row because somebody tidied the library. Leave those attached and
//     let the 409 do the talking.
export type MediaReferenceDetach = {
  /** The Media row's id. Columns holding a library id match on this. */
  id: string
  /** Its public url. Columns holding a url - the common case - match on this. */
  url: string
  /** Its provider storage key, for the columns that keep one alongside the url. */
  key: string
}

export type MediaReferenceDetacher = (media: MediaReferenceDetach) => Promise<void>

/**
 * Every module-registered media reference detacher, in no guaranteed order.
 *
 * THE REGISTRY IS REACHED THROUGH A DYNAMIC IMPORT, AND THAT IS LOAD-BEARING -
 * for exactly the reason spelled out on getMediaUsageProviders in
 * lib/media/usage-providers.ts. A static import here closes an import cycle,
 * Turbopack merges a cycle into one scope, and a `const` read while that scope is
 * still evaluating throws "Cannot access 'x' before initialization" in a
 * production build that tsc, eslint and the whole test suite are happy with.
 */
export async function getMediaReferenceDetachers(): Promise<MediaReferenceDetacher[]> {
  const { modulePublicExtensionPointComponents } = await import('@/lib/modules/extension-points.public')
  const map = modulePublicExtensionPointComponents['core.media-reference-detachers'] as
    | Record<string, MediaReferenceDetacher>
    | undefined
  return map ? Object.values(map) : []
}
