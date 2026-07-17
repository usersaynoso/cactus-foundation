// Pure geometry for "resize this image". Kept free of sharp and of prisma so it
// can be unit-tested on its own — as with aspect-plan.ts, the arithmetic is the
// part that quietly ruins images if it's wrong, and it's cheap to pin down.
//
// The rule the whole feature hangs on: a resize is a uniform scale and nothing
// else. The image is fitted inside the box the user asked for, keeping its own
// ratio, so nothing is cropped and nothing is stretched. The box is a ceiling,
// not a target — an image smaller than the box is left alone rather than blown
// up, because upscaling invents no detail and only costs bytes.

export type ResizePlan = {
  /** Size the image is drawn at. Always a uniform downscale of the source. */
  width: number
  height: number
  /** True when the pixel cap, not the requested box, decided the size. */
  capped: boolean
}

// Ceiling on any single side. Past this a "resize" is not a web image any more,
// and a stray extra digit in the box shouldn't be able to ask for one.
export const MAX_RESIZE_DIMENSION = 20_000

// Ceiling on the output as a whole, mirroring MAX_ASPECT_PIXELS. A resize only
// ever shrinks, so this can bite only when the source itself is enormous and the
// requested box is too.
export const MAX_RESIZE_PIXELS = 40_000_000

export type ResizeBox = {
  /** Max width in pixels. null/undefined leaves width unconstrained. */
  width?: number | null
  /** Max height in pixels. null/undefined leaves height unconstrained. */
  height?: number | null
}

/**
 * Work out the size a `srcWidth`x`srcHeight` image should be drawn at to fit
 * inside `box`, keeping its own aspect ratio and never enlarging it.
 *
 * Returns null when there is nothing to do — the image already fits inside the
 * box — so callers can skip the re-encode rather than rewrite the blob for a
 * byte-for-byte identical result.
 */
export function planResize(
  srcWidth: number,
  srcHeight: number,
  box: ResizeBox,
  maxPixels: number = MAX_RESIZE_PIXELS,
): ResizePlan | null {
  if (!Number.isFinite(srcWidth) || !Number.isFinite(srcHeight) || srcWidth < 1 || srcHeight < 1) {
    throw new Error('Source dimensions must be positive')
  }

  const boxW = box.width ?? null
  const boxH = box.height ?? null
  if (boxW === null && boxH === null) {
    throw new Error('A resize needs a width, a height, or both')
  }
  for (const side of [boxW, boxH]) {
    if (side === null) continue
    if (!Number.isFinite(side) || side < 1) throw new Error('Width and height must be positive numbers')
  }

  // The tightest constraint wins, and 1 caps it: the box is a ceiling, so an
  // image already inside it is left exactly as it is rather than upscaled.
  let scale = 1
  if (boxW !== null) scale = Math.min(scale, boxW / srcWidth)
  if (boxH !== null) scale = Math.min(scale, boxH / srcHeight)

  let width = Math.max(1, Math.round(srcWidth * scale))
  let height = Math.max(1, Math.round(srcHeight * scale))
  let capped = false

  // The cap is applied after the box, so it can only ever shrink the result
  // further — and uniformly, so the ratio survives here too.
  if (width * height > maxPixels) {
    const k = Math.sqrt(maxPixels / (width * height))
    width = Math.max(1, Math.floor(width * k))
    height = Math.max(1, Math.floor(height * k))
    capped = true
  }

  // Nothing worth re-encoding for: the "resized" image would be the source.
  if (width === Math.round(srcWidth) && height === Math.round(srcHeight)) return null

  return { width, height, capped }
}

/** "1920x1080" style label for a size, for toasts and filenames. */
export function sizeLabel(width: number, height: number): string {
  return `${Math.round(width)}x${Math.round(height)}`
}
