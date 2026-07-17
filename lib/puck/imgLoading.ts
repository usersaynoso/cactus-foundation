// Pure helper for the `loading` attribute on public content images. Kept in its
// own file with no imports at all because lib/puck/config.tsx consumes it, and
// config.tsx is bundled into the client Puck editors — anything reaching prisma
// or next/headers from here would follow it into the browser. The server half
// that resolves the value lives in lib/puck/renderMetadata.ts.

/** Key the lazy-load setting travels under on Puck's `metadata`. */
export type LazyImagesMetadata = { lazyImages?: boolean }

/**
 * The `loading` attribute for a public content image, given the block's puck
 * context. Reads Settings > Media's lazy-load switch, which reaches the block
 * through `<Render metadata>`.
 *
 * Lazy is the default whenever the answer isn't a definite "off": the column
 * defaults to true, and a render that arrives without metadata (the Puck editor
 * canvas, which is handed none) then behaves exactly as these blocks did before
 * the setting existed, rather than quietly flipping to eager.
 */
export function imgLoading(puck?: { metadata?: LazyImagesMetadata }): 'lazy' | 'eager' {
  return puck?.metadata?.lazyImages === false ? 'eager' : 'lazy'
}
