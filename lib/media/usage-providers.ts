// Contract for the "core.media-usage-providers" extension point.
//
// Core decides whether a media item is "unused" - and so offers it up for bulk
// deletion - by checking the item against everything core itself knows about:
// the foreign-key columns on SiteConfig/InfoPage/Member, and the url/key/id
// strings embedded in Puck page and layout builder JSON.
//
// That is only half the site once modules are installed. A shop keeps a product
// image's url in shp_product_media, an option swatch lives in svr_option_values,
// an attribute swatch in pat_attribute_values, a 3D model in p3d_models, a board
// icon and a gazette hero in their own id columns. None of it is visible to core,
// so every one of those images used to be counted as unused - a delete-everything
// button pointed straight at the shop's product photography.
//
// A module that references media from its own tables registers one provider here,
// keyed by its module id. A provider returns the raw reference strings it holds -
// media urls, storage keys, or Media ids, in any mixture - and core folds them
// into the same haystack it scans the builder JSON with. Core knows none of the
// table names; the module knows nothing about how the check is done.
//
// Return whatever the columns actually hold. There is no need to resolve an id to
// a url or vice versa: core matches an item's url, key AND id against the
// haystack, so any one of the three is enough to mark the item in use.
export type MediaUsageProvider = () => Promise<string[]>

/**
 * Every module-registered media usage provider, in no guaranteed order.
 *
 * THE REGISTRY IS REACHED THROUGH A DYNAMIC IMPORT, AND THAT IS LOAD-BEARING.
 * `extension-points.public.ts` statically imports every component every module
 * contributes - 114 files - and a fair few of those reach back to a file like
 * this one that consumes the registry. A static import here closes an import
 * cycle. Turbopack merges the modules in a cycle into one scope, and a `const`
 * read while that scope is still being evaluated throws "Cannot access 'x'
 * before initialization" - which is a production build failure, on whichever
 * module set happens to order the graph badly, that `tsc`, `eslint` and the
 * whole test suite are perfectly happy with. It cost a red build gate on
 * 2026-09-07; see scripts/check-import-cycles.mjs for the guard.
 *
 * A dynamic import is still an edge the bundler follows, so this hides nothing
 * from check-client-graph. It only defers evaluation past the cycle, which is
 * exactly the bit that matters.
 */
export async function getMediaUsageProviders(): Promise<MediaUsageProvider[]> {
  const { modulePublicExtensionPointComponents } = await import('@/lib/modules/extension-points.public')
  const map = modulePublicExtensionPointComponents['core.media-usage-providers'] as
    | Record<string, MediaUsageProvider>
    | undefined
  return map ? Object.values(map) : []
}
