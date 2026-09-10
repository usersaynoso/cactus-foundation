// Contract for the "core.media-private-storage" extension point.
//
// A module may write objects into the site's own storage that are deliberately
// NOT library items: an email attachment pulled out of a shared inbox, a receipt
// filed against a bookkeeping entry. Core's uploadMedia writes the object and
// nothing else - the caller mints the library row - so a module simply does not
// mint one, and the file is invisible to the media picker by construction rather
// than by a filter somebody could later forget.
//
// That leaves the storage check looking at an object with no library row, which
// is exactly the shape of a leftover. The usage providers keep it out of the
// orphan list (nothing offers to delete a customer's invoice), but it still sits
// in the "in use, but with no entry here" pile, which is a list an admin is meant
// to be able to empty. It cannot be emptied: adopting those files INTO the
// library is the one thing the module went out of its way to prevent.
//
// So a module that keeps private files declares the folder it keeps them in. Core
// files anything under it separately, never offers to delete it, and never offers
// to adopt it. One folder per module, named after the module, because that is
// also the only handle a future retention sweep would have.
//
// Declared as a plain string array rather than a function: there is nothing to
// look up, and a value cannot fail halfway through the way a query can.
export type MediaPrivatePrefixes = readonly string[]

/**
 * Every private storage folder the installed modules claim, relative to the
 * provider's own media prefix ("unified-inbox", not "media/unified-inbox/").
 *
 * REACHED THROUGH A DYNAMIC IMPORT, AND THAT IS LOAD-BEARING - see the same note
 * on getMediaUsageProviders in usage-providers.ts. A static import here closes an
 * import cycle that only shows up as a production build failure.
 */
export async function getMediaPrivatePrefixes(): Promise<string[]> {
  const { modulePublicExtensionPointComponents } = await import('@/lib/modules/extension-points.public')
  const map = modulePublicExtensionPointComponents['core.media-private-storage'] as
    | Record<string, MediaPrivatePrefixes>
    | undefined
  if (!map) return []
  const out = new Set<string>()
  for (const entry of Object.values(map)) {
    for (const folder of entry) {
      // Trimmed to a bare folder name: core builds the full prefix itself, and a
      // module that writes "media/thing/" would otherwise silently match nothing.
      const clean = folder.replace(/^\/+|\/+$/g, '')
      if (clean) out.add(clean)
    }
  }
  return [...out]
}
