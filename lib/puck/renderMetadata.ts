import { getSiteConfig } from '@/lib/config/site'
import { mediaPublicOrigin } from '@/lib/media/public-origin'
import { fontFamiliesFromTokens } from '@/lib/design/tokens'
import type { ImageResizing } from '@/lib/media/resize-url'
import type { LazyImagesMetadata } from '@/lib/puck/imgLoading'
import type { LoadedFontsMetadata } from '@/lib/puck/blockFont'
import type { MediaDimensionsMetadata } from '@/lib/puck/imgDimensions'

// Site-wide values that Puck blocks need at render time but can't fetch for
// themselves. lib/puck/config.tsx is shared by the client editor and the RSC
// render, so it is deliberately hook-free and can't reach the database or
// next/headers — anything site-wide has to be handed to it.
//
// Puck's own `metadata` prop is that channel: `<Render metadata={...}>` puts the
// object on every block's `puck.metadata`, per render rather than per module, so
// there's no cross-request state to leak. It's the same door `puck.isEditing`
// comes through, which is why blocks can read it without a hook.
//
// This file is RSC-only (it reaches prisma through getSiteConfig). The pure half
// blocks actually call is lib/puck/imgLoading.ts.
//
// getSiteConfig is React cache()d, so the several Render calls a single page
// makes (header, content, footer) share one query.

// mediaDimensions is the one per-RENDER value rather than a site-wide one: it depends
// on which pictures the data being rendered holds, so it is added by
// withMediaDimensions (lib/puck/mediaDimensions.ts) where the data is in hand, not
// here.
export type PuckRenderMetadata = LazyImagesMetadata & LoadedFontsMetadata & MediaDimensionsMetadata & {
  /**
   * Whether pictures may be asked for at the size they are drawn, and from which
   * host. Null origin - the default - means every <img> keeps the url it was given.
   * See lib/media/resize-url.ts for why this is a setting rather than a detection.
   */
  imageResizing?: ImageResizing
}

export async function getPuckRenderMetadata(): Promise<PuckRenderMetadata> {
  const config = await getSiteConfig()
  // Default on when there's no config row yet (setup wizard, or a status page
  // rendered before settings are saved): matches the column default, and matches
  // how these blocks behaved before the setting existed.
  return {
    lazyImages: config?.lazyLoadImages ?? true,
    // The typefaces the page's own stylesheet link already asks for, so a block
    // with a font of its own can tell whether it needs to ask again. See
    // lib/puck/blockFont.ts for the 1.5 seconds this is about.
    loadedFonts: fontFamiliesFromTokens(config?.designTokens),
    // Only when the owner has said their media host is behind a Cloudflare zone
    // with Transformations on. mediaPublicOrigin() is null on an install serving
    // media from its own domain, which has no /cdn-cgi/image/ of its own to use.
    imageResizing: { origin: config?.cloudflareImageResizing ? mediaPublicOrigin() : null },
  }
}
