// The small copy of a library picture that list surfaces draw: a product card in
// a category grid, the thumbnail strip under a product photo, anything else
// showing a picture at a few hundred pixels or less.
//
// Constants only, no sharp - so a client component can import the size to label
// a button without dragging the resizer into the browser bundle. The resizer
// itself is lib/media/renditions.ts, and the naming rule it applies is what makes
// a rendition findable again: `<original>-thumb.webp`, filed in the original's
// own folder. See findRenditionUrls there.
//
// This lives in core rather than in the shop module because there is nothing
// shop-specific about "make me a small copy of that for a listing": the filters
// module, the directory module and anything after them all want the same thing,
// and a module may not import another module's code.

/**
 * The copy's longest edge.
 *
 * 300px, because that is what the surfaces asking for it actually draw. A card
 * in a three- or four-across grid is around 300px wide on a desktop and less on
 * a phone; the gallery strip's thumbnails are 64px. Measured on a real catalogue:
 * a 646 KB product photograph becomes about 20 KB here, and a category page that
 * was shipping 5.5 MB of pictures ships well under a tenth of it.
 */
export const THUMB_RENDITION_MAX_PX = 300

/** The tail on the copy's filename: "chair.webp" gives "chair-thumb.webp". */
export const THUMB_RENDITION_SUFFIX = 'thumb'

/**
 * Under this weight the original IS the small copy to any useful approximation,
 * so no second file is made and callers go on using the original.
 *
 * 40 KB: a picture already that light costs less to serve than the round trip
 * saved by shrinking it further, and a shop's catalogue has plenty of small
 * line-drawing swatches that would otherwise each mint a near-identical twin.
 */
export const THUMB_RENDITION_WORTHWHILE_BYTES = 40 * 1024
