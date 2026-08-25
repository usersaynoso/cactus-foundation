import sharp from 'sharp'
import { prisma } from '@/lib/db/prisma'
import { downloadMedia, uploadMedia, buildLibraryUploadKey, saveMediaRecord } from '@/lib/media/upload'
import { resolveFolderPath } from '@/lib/media/organise'

// Shrunk copies of a media library picture, filed beside the original.
//
// Why a second FILE rather than resizing the original: some originals are load-
// bearing at full size - a fabric photograph is painted onto a 3D model at true
// scale, where a shrunk texture blurs into mush - while the very same url gets
// drawn as a 14px dot somewhere else. One file cannot be both, so the library
// keeps two or three and each renderer asks for the one it can actually use.
//
// This lives in core rather than in whichever module thought of it first because
// there is nothing module-specific about "make me a 128px copy of that": the
// attributes module, the filters module and anything after them all want the
// same thing, and a module may not import another module's code.

// Formats sharp can be trusted to shrink well. SVG scales by nature and GIF may
// animate - shrinking either buys little or breaks something, so both are left
// alone and the caller simply keeps using the original.
const RESIZABLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export type RenditionSpec = {
  // The copy's longest edge.
  maxPx: number
  // The tail added to the file's name: "small" gives "oak-small.webp".
  suffix: string
}

/**
 * Make (or decline to make) shrunk copies of the library picture at `sourceUrl`.
 *
 * `worthwhileBytes` is the weight under which the original IS the copy to any
 * useful approximation - below it, and already within a spec's `maxPx`, that
 * copy is not made and a duplicate file is spared.
 *
 * Returns a suffix-keyed map of new urls. A missing (null) entry means there was
 * nothing worth making: the url is not a library item (an external host - there
 * are no bytes to read), the format is not one to shrink, or the original is
 * already small enough. Null is a fine answer - callers fall back to a bigger
 * rendition - so it is stored as a real url would be.
 *
 * Failures are also null, logged rather than thrown: this runs inside ordinary
 * saves and backfills, and losing an admin's edit over a thumbnail would be the
 * tail wagging the dog.
 *
 * Several specs at once rather than one call each, because the expensive part is
 * fetching and decoding the original: a backfill over a few hundred fabric
 * photographs should read each one once and encode from it twice.
 */
export async function generateImageRenditions(
  sourceUrl: string,
  specs: RenditionSpec[],
  { worthwhileBytes, userId }: { worthwhileBytes: number; userId?: string },
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {}
  for (const spec of specs) out[spec.suffix] = null
  if (specs.length === 0) return out

  try {
    const media = await prisma.media.findFirst({
      where: { url: sourceUrl },
      select: { id: true, key: true, url: true, provider: true, mimeType: true, sizeBytes: true, folderId: true, uploadedById: true },
    })
    if (!media) return out
    if (!RESIZABLE_TYPES.has(media.mimeType)) return out

    const original = await downloadMedia(media.provider, media.key, media.url)
    const meta = await sharp(original).metadata()
    const widest = Math.max(meta.width ?? 0, meta.height ?? 0)

    // Named after the original with a `-<suffix>` tail, filed in the same folder,
    // so the set reads as a set in the library. Resolved once for the batch.
    const baseName = (media.key.split('/').pop() ?? 'image').replace(/\.[a-z0-9]+$/i, '')
    const folderPath = await resolveFolderPath(media.folderId)

    for (const spec of specs) {
      // Already small in both pixels and bytes: the original serves as well as a
      // copy would, and every renderer falls back to it anyway.
      if (widest <= spec.maxPx && original.length <= worthwhileBytes) continue

      // `rotate()` first so an EXIF-orientated photograph keeps pointing the way
      // it did in the picker rather than lying on its side in the copy.
      const shrunk = await sharp(original)
        .rotate()
        .resize({ width: spec.maxPx, height: spec.maxPx, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer()

      // buildLibraryUploadKey dedupes a name collision with the usual "-2"
      // rather than overwriting.
      const fileName = `${baseName}-${spec.suffix}.webp`
      const key = await buildLibraryUploadKey(media.provider, 'image/webp', fileName, folderPath || undefined)
      const uploaded = await uploadMedia(shrunk, 'image/webp', media.provider, fileName, folderPath || undefined, false, key)

      const record = await saveMediaRecord({
        key: uploaded.key,
        url: uploaded.url,
        provider: media.provider,
        mimeType: 'image/webp',
        sizeBytes: shrunk.length,
        uploadedById: userId ?? media.uploadedById ?? undefined,
        originalName: fileName,
        folderId: media.folderId,
        // A derived resize of an already-served picture: the optimiser has
        // nothing to add, and the lightning button would only re-compress the
        // compression.
        optimised: true,
      })
      out[spec.suffix] = record.url
    }
    return out
  } catch (err) {
    console.warn(`[media] could not make shrunk copies of ${sourceUrl}:`, err)
    return out
  }
}

/** One rendition, for callers that only want the one. */
export async function generateImageRendition(
  sourceUrl: string,
  { maxPx, suffix, worthwhileBytes, userId }: RenditionSpec & { worthwhileBytes: number; userId?: string },
): Promise<string | null> {
  const made = await generateImageRenditions(sourceUrl, [{ maxPx, suffix }], { worthwhileBytes, userId })
  return made[suffix] ?? null
}
