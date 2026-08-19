import sharp from 'sharp'
import { prisma } from '@/lib/db/prisma'

// Pixel dimensions for raster images: how they get measured, and where the three
// columns holding them are written.
//
// Server-only (it imports sharp and prisma). Anything a client component needs
// about dimensions comes down on the row itself.

export type Dimensions = { width: number; height: number }

/**
 * Whether this type has pixel dimensions worth recording.
 *
 * Raster images only. SVG is deliberately out: its intrinsic size is a hint in a
 * viewBox rather than a fact about the file, and "sort by biggest image" reading
 * a scalable one as 16x16 would be worse than reading it as unmeasured. Video is
 * out for a plainer reason - nothing on the server decodes it (see
 * lib/media/limits.ts), so there is nowhere honest to get the numbers from.
 */
export function isMeasurableImageType(mimeType: string): boolean {
  return mimeType.startsWith('image/') && mimeType !== 'image/svg+xml'
}

/**
 * Dimensions of the bytes in hand, or null if they cannot be read as an image.
 *
 * `failOn: 'none'` for the same reason validateUpload uses it: plenty of sound
 * WebP and GIF files emit a libwebp warning that sharp would otherwise escalate
 * to a thrown error, and a header read is not the place to be pedantic.
 *
 * EXIF orientation is applied here rather than reported raw. A phone photograph
 * stores 4032x3024 with "rotate 90" beside it and every browser draws it
 * 3024x4032 - recording the stored pair would sort portrait photographs as
 * landscape and contradict what the library's own thumbnails show.
 */
export async function dimensionsFromBuffer(buffer: Buffer): Promise<Dimensions | null> {
  try {
    const meta = await sharp(buffer, { failOn: 'none' }).metadata()
    if (!meta.width || !meta.height) return null
    const swapped = typeof meta.orientation === 'number' && meta.orientation >= 5
    return swapped
      ? { width: meta.height, height: meta.width }
      : { width: meta.width, height: meta.height }
  } catch {
    return null
  }
}

/**
 * How much of a file to ask for when measuring one already in storage.
 *
 * Every format the library stores keeps its dimensions in a header near the
 * front, so this is generous rather than tight - and it is the whole point of
 * measuring by range request: 35,000 images measured off 128 KB apiece instead
 * of off whole photographs. The full file is fetched only if this much of it
 * cannot be read (see below).
 */
const PROBE_BYTES = 128 * 1024

/**
 * Measure an image that is already in storage, by url.
 *
 * Range first, whole file second. The media Worker forwards a Range header to
 * the provider and hands back its 206, so the usual case costs a fraction of the
 * object; a provider or proxy that ignores the header simply returns the lot,
 * which still measures fine. The retry exists for the awkward minority - a
 * progressive JPEG or an interleaved PNG whose header sits past the first chunk.
 */
export async function probeDimensionsByUrl(url: string): Promise<Dimensions | null> {
  const partial = await fetchBuffer(url, `bytes=0-${PROBE_BYTES - 1}`)
  if (partial) {
    const dims = await dimensionsFromBuffer(partial)
    if (dims) return dims
    // A short read that measured nothing is worth one full attempt, but only if
    // the range actually was short: a body that already came back whole has
    // nothing more to fetch and has simply failed to parse.
    if (partial.length < PROBE_BYTES) return null
  }
  const whole = await fetchBuffer(url, null)
  return whole ? dimensionsFromBuffer(whole) : null
}

async function fetchBuffer(url: string, range: string | null): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: range ? { Range: range } : undefined,
      cache: 'no-store',
    })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

/**
 * Write a measurement to the row, keeping `pixels` in step with the pair it is
 * derived from. The only writer of these three columns, so they cannot disagree.
 *
 * Passing null clears all three - what a Replace with a non-raster file leaves
 * behind, rather than the previous image's numbers sitting on a row that is no
 * longer that image.
 */
export async function setMediaDimensions(mediaId: string, dims: Dimensions | null): Promise<void> {
  await prisma.media.update({
    where: { id: mediaId },
    data: dims
      ? { width: dims.width, height: dims.height, pixels: dims.width * dims.height }
      : { width: null, height: null, pixels: null },
  })
}

/** The columns setMediaDimensions writes, shaped for a create rather than an update. */
export function dimensionFields(dims: Dimensions | null | undefined): {
  width: number | null
  height: number | null
  pixels: number | null
} {
  return dims
    ? { width: dims.width, height: dims.height, pixels: dims.width * dims.height }
    : { width: null, height: null, pixels: null }
}

/**
 * Measure a batch of rows that have never been measured, oldest first, and write
 * what comes back. Drives the media page's "Measure image sizes" action, which
 * calls it repeatedly until nothing is left.
 *
 * Rows that cannot be read are counted as failed rather than retried forever -
 * but they are also left unmeasured, so a second run picks them up again. That is
 * deliberate: the usual cause is a transient storage hiccup, and the cheap fix is
 * running it again rather than a poison-pill column.
 */
export async function measureUnmeasuredBatch(limit: number): Promise<{
  measured: number
  failed: number
  remaining: number
}> {
  const rows = await prisma.media.findMany({
    where: unmeasuredWhere(),
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, url: true },
  })

  let measured = 0
  let failed = 0
  // Six at a time: each one is a range request to storage that spends its life
  // waiting on the network, so measuring them strictly in turn would leave the
  // whole batch as slow as the sum of its round trips.
  const CONCURRENCY = 6
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
      while (next < rows.length) {
        const row = rows[next++]
        if (!row) return
        const dims = await probeDimensionsByUrl(row.url)
        if (!dims) { failed++; continue }
        try {
          await setMediaDimensions(row.id, dims)
          measured++
        } catch {
          // The row was deleted while the batch was in flight. Nothing to do and
          // nothing lost - it is simply no longer part of the count.
          failed++
        }
      }
    }),
  )

  const remaining = await prisma.media.count({ where: unmeasuredWhere() })
  return { measured, failed, remaining }
}

/** Raster images carrying no measurement - what the bulk action still has to do. */
export function unmeasuredWhere() {
  return {
    AND: [
      { mimeType: { startsWith: 'image/' } },
      { NOT: { mimeType: 'image/svg+xml' } },
      { width: null },
    ],
  }
}

export async function countUnmeasuredImages(): Promise<number> {
  return prisma.media.count({ where: unmeasuredWhere() })
}
