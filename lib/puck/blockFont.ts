// Whether a block needs to ask for its own webfont, or the page already has it.
//
// A block whose font can be set independently of the site's (a phone number, a menu
// item) used to emit its own `<link rel="stylesheet">` for that family. Where the
// family was the site's OWN heading or body face - which is the common case, because
// an owner picking a font for one block usually picks the one the site already uses
// - that was a second render-blocking stylesheet request for a typeface the document
// had already asked for. Measured on the live install: 750 ms, twice, for 2.8 KB.
//
// React de-duplicates stylesheet links by href, so this cannot be solved by hoisting
// alone: the page's link names several families and the block's names one, so the two
// urls genuinely differ and both survive. The block has to decide not to ask.
//
// The pure half of that decision lives here, with no database and no server imports,
// because lib/puck/config.tsx is shared by the client editor and the RSC render. The
// families themselves reach the block through Puck's `metadata` channel - the same
// door `lazyImages` comes through. See lib/puck/renderMetadata.ts.

import { googleFontHrefForFamily } from '@/lib/design/tokens'

export type LoadedFontsMetadata = {
  /**
   * The webfont families the PAGE is already loading, from the site's design
   * tokens. Absent in the editor canvas and on a render that predates this, and
   * absent means "ask anyway" - the old behaviour, one extra request rather than a
   * missing typeface.
   */
  loadedFonts?: string[]
}

type PuckWithMetadata = { metadata?: LoadedFontsMetadata }

/**
 * The stylesheet href a block should emit for `family`, or null when it should emit
 * nothing.
 *
 * Null for the two reasons a block never needs a link: the family is a system stack
 * (nothing to fetch), or the page is already loading it.
 */
export function blockFontHref(family: string | undefined, puck?: PuckWithMetadata): string | null {
  return googleFontHrefForFamily(family, puck?.metadata?.loadedFonts)
}
