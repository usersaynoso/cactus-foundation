// Pure helper for the width and height attributes on a content image. No imports
// at all, for the same reason as lib/puck/imgLoading.ts: lib/puck/config.core.tsx
// consumes it, and that file is bundled into the client Puck editors too. The
// server half that looks the numbers up lives in lib/puck/mediaDimensions.ts.
//
// WHY. An <img> drawn `width: 100%; height: auto` has no height at all until its
// file arrives, so everything under it jumps down when it does. Given width and
// height attributes, the browser reserves the box from their ratio before a byte
// has loaded - and because that ratio is only a stand-in (`aspect-ratio: auto w/h`
// in the browser's own stylesheet), the real picture's shape still wins once it
// is decoded. So a stale pair can never squash an image; the worst it can do is
// reserve the wrong height for the moment before the file lands, which is what
// happens on every load today.

/** A picture's pixel size, as the media library recorded it. */
export type ImageDimensions = { width: number; height: number }

/** Key the per-render dimension map travels under on Puck's `metadata`. */
export type MediaDimensionsMetadata = {
  /** Media url, exactly as a block's `mediaUrl` holds it, to its recorded size. */
  mediaDimensions?: Record<string, ImageDimensions>
}

/**
 * Width and height attributes for an image block's picture, or nothing at all when
 * the size is not known - the editor canvas, which is handed no metadata; an
 * address that is not in the media library; an SVG, which records no pixel size.
 * Nothing is exactly how these blocks rendered before, so an unknown size costs
 * only the reservation, never the picture.
 */
export function imgDimensionAttrs(
  puck: { metadata?: MediaDimensionsMetadata } | undefined,
  url: string,
): { width?: number; height?: number } {
  const found = puck?.metadata?.mediaDimensions?.[url]
  if (!found) return {}
  const { width, height } = found
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return {}
  return { width, height }
}
