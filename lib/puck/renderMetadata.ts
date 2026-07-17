import { getSiteConfig } from '@/lib/config/site'
import type { LazyImagesMetadata } from '@/lib/puck/imgLoading'

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

export type PuckRenderMetadata = LazyImagesMetadata

export async function getPuckRenderMetadata(): Promise<PuckRenderMetadata> {
  const config = await getSiteConfig()
  // Default on when there's no config row yet (setup wizard, or a status page
  // rendered before settings are saved): matches the column default, and matches
  // how these blocks behaved before the setting existed.
  return { lazyImages: config?.lazyLoadImages ?? true }
}
