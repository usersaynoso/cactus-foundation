// Asking Cloudflare for a picture at the size it is actually drawn.
//
// A site's media host, when it sits behind a Cloudflare zone with Transformations
// switched on, will resize and re-encode on the way past:
//
//   https://media.example.com/cdn-cgi/image/width=460,quality=80,format=auto/<original url>
//
// Measured on a live hero photograph: 45.8 KB of WebP became 15.1 KB of AVIF at the
// width it was drawn at. The re-encode is often the bigger half - `format=auto`
// hands AVIF to a browser that takes it and leaves everyone else alone.
//
// Why this is a SETTING and not simply switched on: it only works where the media
// host is behind a Cloudflare zone AND Transformations is enabled there, which is a
// paid feature and nothing the platform can detect for itself. Guessing wrong means
// every picture on the site 404s, so the default is off and the owner turns it on
// once. See Settings > Speed.
//
// Client-safe on purpose - no sharp, no prisma, no env - because the <img> tags that
// need it live on both sides of the RSC boundary. What it cannot work out for itself
// (whether the setting is on, and which host is the media host) is handed in.

/** Formats where a resize is pointless or destructive, so the original is served. */
function isUnresizable(path: string): boolean {
  const lower = path.toLowerCase()
  // SVG is vector - there is no "too big" - and rasterising one is a downgrade.
  // GIF may be animated, and `format=auto` would hand back a still frame.
  return lower.endsWith('.svg') || lower.endsWith('.gif')
}

export type ImageResizing = {
  /**
   * The origin whose `/cdn-cgi/image/` endpoint may be used - the site's media host.
   * Null when the owner has not switched resizing on, which is the default and means
   * every helper here hands back the url it was given.
   */
  origin: string | null
}

/**
 * The url for `src`, drawn at `width` device pixels.
 *
 * Returns the original untouched whenever resizing cannot be applied: switched off,
 * a picture on some other host (an external hotlink, a direct Cloudinary or ImageKit
 * url that does its own resizing), a relative path, a data uri, or a format that
 * should not be touched. Falling back to the original is always correct, if heavier.
 */
export function resizedImageSrc(src: string, width: number, resizing?: ImageResizing): string {
  const origin = resizing?.origin
  if (!origin || !src || !Number.isFinite(width) || width <= 0) return src
  // Already a transformed url - re-wrapping one would ask Cloudflare to resize its
  // own output, which works but costs a second transformation for nothing.
  if (src.includes('/cdn-cgi/image/')) return src

  let url: URL
  try {
    url = new URL(src)
  } catch {
    return src
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return src
  if (url.origin !== origin) return src
  if (isUnresizable(url.pathname)) return src

  // `format=auto` is the half that usually saves more than the resize: AVIF where the
  // browser takes it, the original format where it does not. `fit=scale-down` never
  // enlarges, so asking for a width larger than the source costs nothing and returns
  // the source size.
  return `${origin}/cdn-cgi/image/width=${Math.round(width)},quality=80,format=auto,fit=scale-down/${src}`
}

/**
 * A `srcset` for the widths given, or null when resizing cannot be applied - in which
 * case the caller should emit no srcset at all rather than an empty one.
 *
 * Widths are device pixels, so a picture drawn at 450 CSS pixels wants roughly 450
 * and 900 in the list for ordinary and retina screens.
 */
export function resizedSrcSet(src: string, widths: readonly number[], resizing?: ImageResizing): string | null {
  if (!resizing?.origin || widths.length === 0) return null
  const first = resizedImageSrc(src, widths[0]!, resizing)
  // resizedImageSrc hands back the original when it cannot help, and an unchanged
  // url means every entry would be identical - a srcset that says nothing.
  if (first === src) return null
  return widths
    .map((w) => `${resizedImageSrc(src, w, resizing)} ${Math.round(w)}w`)
    .join(', ')
}

/**
 * The ladder of widths to offer for a picture that spans a given share of the
 * viewport. Deliberately short: every entry is a separate object for Cloudflare to
 * make and for the edge to hold, and a browser picking between five is no better
 * served than one picking between four.
 */
export const FULL_WIDTH_LADDER = [480, 800, 1200, 1800] as const
export const HALF_WIDTH_LADDER = [360, 560, 900, 1200] as const
export const CARD_WIDTH_LADDER = [240, 400, 600] as const

/**
 * The three attributes an `<img>` needs to be responsive, ready to spread.
 *
 * `srcSet` and `sizes` come back undefined when resizing cannot be applied, so
 * spreading the result onto an element emits neither - which is what an ordinary
 * `<img src>` should look like on a site with the setting off.
 *
 * `sizes` is the caller's to state, because only the block knows how wide its
 * picture is drawn. Get it wrong and a browser picks a source that is too small
 * (blurry) or too large (the problem we started with), so it is required rather
 * than defaulted.
 */
export function responsiveImg(
  src: string,
  sizes: string,
  widths: readonly number[],
  resizing?: ImageResizing,
): { src: string; srcSet?: string; sizes?: string } {
  const srcSet = resizedSrcSet(src, widths, resizing)
  if (!srcSet) return { src }
  // `src` stays the ORIGINAL, not a resized one: it is the fallback for anything
  // that does not understand srcset, and pointing it at a narrow rendition would
  // serve those a blurry picture.
  return { src, srcSet, sizes }
}
