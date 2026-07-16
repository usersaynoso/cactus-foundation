// Pure geometry for "change this image's aspect ratio". Kept free of sharp and
// of prisma so it can be unit-tested on its own — the arithmetic here is the
// part that quietly ruins images if it's wrong, and it's cheap to pin down.
//
// The rule the whole feature hangs on: an image cannot change shape without
// either trimming pixels, stretching them, or padding around them. We pad. The
// source is never cropped and never distorted — the canvas grows on the two
// sides that are short, and the image sits centred inside it.

export type AspectPlan = {
  /** Final canvas size — matches the requested ratio to within a pixel. */
  canvasWidth: number
  canvasHeight: number
  /** Size the source is drawn at. Only ever a uniform downscale of the source. */
  imageWidth: number
  imageHeight: number
  /** Padding added on each side. Two of the four are always 0. */
  padLeft: number
  padRight: number
  padTop: number
  padBottom: number
  /** True when the canvas had to be shrunk to stay under the pixel cap. */
  downscaled: boolean
}

// Ceiling on the output canvas. A 6000x1000 panorama asked for 9:16 would
// otherwise want a 6000x10667 canvas (64 megapixels of mostly padding) — big
// enough to blow memory and pointless as a web image. Past the cap the whole
// plan scales down uniformly, which still trims and stretches nothing.
export const MAX_ASPECT_PIXELS = 40_000_000

/**
 * Work out the padded canvas that turns a `srcWidth`x`srcHeight` image into
 * `ratioW`:`ratioH` without trimming or stretching it.
 *
 * Returns null when the source already has that ratio (to within the rounding
 * of a whole pixel), so callers can skip the re-encode rather than rewrite the
 * blob for nothing.
 */
export function planAspectChange(
  srcWidth: number,
  srcHeight: number,
  ratioW: number,
  ratioH: number,
  maxPixels: number = MAX_ASPECT_PIXELS,
): AspectPlan | null {
  if (!Number.isFinite(srcWidth) || !Number.isFinite(srcHeight) || srcWidth < 1 || srcHeight < 1) {
    throw new Error('Source dimensions must be positive')
  }
  if (!Number.isFinite(ratioW) || !Number.isFinite(ratioH) || ratioW <= 0 || ratioH <= 0) {
    throw new Error('Ratio must be two positive numbers')
  }

  const target = ratioW / ratioH

  // Grow the short axis, never shrink the long one: that's what keeps every
  // source pixel. Which axis is short depends on how the source compares to the
  // target ratio.
  let canvasWidth = Math.round(srcWidth)
  let canvasHeight = Math.round(srcHeight)
  if (srcWidth / srcHeight > target) {
    canvasHeight = Math.round(srcWidth / target) // too wide — pad top and bottom
  } else {
    canvasWidth = Math.round(srcHeight * target) // too tall — pad left and right
  }
  // Rounding can land the canvas a pixel inside the source; the source must
  // always fit, so never let it.
  canvasWidth = Math.max(canvasWidth, Math.round(srcWidth))
  canvasHeight = Math.max(canvasHeight, Math.round(srcHeight))

  // Same shape already — nothing worth re-encoding for.
  if (canvasWidth === Math.round(srcWidth) && canvasHeight === Math.round(srcHeight)) return null

  let imageWidth = Math.round(srcWidth)
  let imageHeight = Math.round(srcHeight)
  let downscaled = false

  if (canvasWidth * canvasHeight > maxPixels) {
    // One uniform scale factor across canvas and image: the ratio survives and
    // so does every pixel's relationship to its neighbours.
    const k = Math.sqrt(maxPixels / (canvasWidth * canvasHeight))
    canvasWidth = Math.max(1, Math.floor(canvasWidth * k))
    canvasHeight = Math.max(1, Math.floor(canvasHeight * k))
    imageWidth = Math.max(1, Math.min(Math.round(imageWidth * k), canvasWidth))
    imageHeight = Math.max(1, Math.min(Math.round(imageHeight * k), canvasHeight))
    downscaled = true
  }

  const padLeft = Math.floor((canvasWidth - imageWidth) / 2)
  const padTop = Math.floor((canvasHeight - imageHeight) / 2)

  return {
    canvasWidth,
    canvasHeight,
    imageWidth,
    imageHeight,
    padLeft,
    padRight: canvasWidth - imageWidth - padLeft,
    padTop,
    padBottom: canvasHeight - imageHeight - padTop,
    downscaled,
  }
}

/** Tidy "16:9" style label for a ratio, for toasts and filenames. */
export function ratioLabel(ratioW: number, ratioH: number): string {
  const round = (n: number) => (Number.isInteger(n) ? n : Math.round(n * 100) / 100)
  return `${round(ratioW)}:${round(ratioH)}`
}
