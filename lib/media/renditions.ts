import sharp from 'sharp'
import { prisma } from '@/lib/db/prisma'
import type { MediaProviderType } from '@prisma/client'
import { downloadMedia, uploadMedia, saveMediaRecord, deleteMedia, rewriteMediaReferencesInContent } from '@/lib/media/upload'
import { findChildFolder, findChildFolders, getOrCreateChildFolder, moveOrRenameMedia, resolveFolderPath } from '@/lib/media/organise'
import {
  KNOWN_RENDITION_SPECS,
  RENDITION_FOLDER_NAME,
  renditionFileName,
  type RenditionSpec,
} from '@/lib/media/rendition-naming'

// Re-exported so every existing caller keeps working. The lookup itself lives in a
// sharp-free file (rendition-lookup.ts) so a module can resolve a small copy
// without pulling an image library into its bundle.
export { findRenditionUrls } from '@/lib/media/rendition-lookup'
export { renditionFileName, RENDITION_FOLDER_NAME, type RenditionSpec }

// Shrunk copies of a media library picture, filed in a `thumb` folder beside the
// original.
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

    // Named after the original with a `-<suffix>` tail and filed one level down,
    // in the original's own `thumb` folder, so a product's folder reads as the
    // product's pictures instead of as each picture twice over.
    //
    // Both folders are resolved once for the batch, and the `thumb` folder is
    // only LOOKED for here - creating it is left until something is actually
    // about to be written, so a folder of pictures that all decline to be shrunk
    // does not gain an empty folder for its trouble.
    const folderPath = await resolveFolderPath(media.folderId)
    // The folder's display name survives sanitizeFolderSegment unchanged, so the
    // storage path is the parent's with the name appended - no second walk.
    const renditionFolderPath = folderPath ? `${folderPath}/${RENDITION_FOLDER_NAME}` : RENDITION_FOLDER_NAME
    let renditionFolderId = await findChildFolder(media.folderId, RENDITION_FOLDER_NAME)

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

      const fileName = renditionFileName(media.key, spec.suffix)

      // This rendition may already exist. The name is derived from the ORIGINAL's
      // own key and it is filed in the original's own `thumb` folder, so a webp of
      // that name there is this rendition of this picture and nothing else - made
      // by an earlier run, or by another module that shrank the same library item.
      //
      // Reusing it rather than minting one matters more than it sounds. Without
      // this, a backfill over a shop where several values share one fabric wrote a
      // fresh identical file per value. On the catalogue this was written for that
      // was 258 files nothing pointed at, 10 MB of them.
      //
      // Matched on `originalName`, not `key`: the key carries a nanoid nobody can
      // reconstruct, whereas the name is derived from the original's own key and
      // is therefore the same on every run. Oldest first, so a folder that
      // accumulated duplicates under an earlier version resolves to the same file
      // every time rather than drifting between them.
      //
      // The original's OWN folder is asked second. That is where copies were filed
      // before the `thumb` folder existed, and an install part-way through the
      // refile (lib/media/rendition-refile.ts) has them in both places. Reusing
      // the one already on file is the whole point of this lookup, and it would be
      // a poor trade to mint a duplicate of every picture in the catalogue because
      // a tidy-up had not been run yet.
      const tidy = renditionFolderId
        ? await prisma.media.findFirst({
            where: { folderId: renditionFolderId, mimeType: 'image/webp', originalName: fileName },
            select: { url: true },
            orderBy: { createdAt: 'asc' },
          })
        : null
      const found = tidy ?? await prisma.media.findFirst({
        where: { folderId: media.folderId, mimeType: 'image/webp', originalName: fileName },
        select: { url: true },
        orderBy: { createdAt: 'asc' },
      })
      if (found) {
        out[spec.suffix] = found.url
        continue
      }

      // Something is going to be written now, so the folder may as well exist.
      renditionFolderId ??= await getOrCreateChildFolder(media.folderId, RENDITION_FOLDER_NAME)

      // A folder that could not be made at all (it cannot be, for a name this
      // fixed) would leave the row saying one place and the blob sitting in
      // another, which is the one state no lookup here can recover from. So the
      // copy is filed beside its original instead - untidy, findable, and exactly
      // what every install looked like before this folder existed.
      const targetFolderId = renditionFolderId ?? media.folderId
      const targetFolderPath = renditionFolderId ? renditionFolderPath : folderPath

      // A nanoid key, like any other library upload, rather than the exact
      // "<original>-thumb.webp" this used to mint. Three things fall out of that,
      // and the third is the one that matters:
      //
      //  - No collisions. The exact form is a read ("is this name free?") followed
      //    by a write, with nothing holding the gap, so a backfill running a dozen
      //    at a time had eleven of them lose the same name over and over. A nanoid
      //    cannot collide, so there is nothing to retry and nothing to serialise.
      //  - It is immutable in the media worker by the ordinary rule, without
      //    needing the rendition-name exception at all.
      //  - Crucially: a REGENERATED copy gets a brand-new address. When an admin
      //    crops the original, its small copy has to be remade, and remaking it at
      //    the same url would hand every browser and every edge cache a file they
      //    have already been told to keep for a year. A new address is fetched; an
      //    overwritten one is not. See refreshRenditions below.
      //
      // The copy is still FOUND by its `originalName`, which is derived from the
      // original's key and is what every lookup here matches on - so nothing needs
      // the key to be readable.
      const record = await (async () => {
        const uploaded = await uploadMedia(shrunk, 'image/webp', media.provider, fileName, targetFolderPath || undefined)
        return saveMediaRecord({
          key: uploaded.key,
          url: uploaded.url,
          provider: media.provider,
          mimeType: 'image/webp',
          sizeBytes: shrunk.length,
          uploadedById: userId ?? media.uploadedById ?? undefined,
          originalName: fileName,
          folderId: targetFolderId,
          // A derived resize of an already-served picture: the optimiser has
          // nothing to add, and the lightning button would only re-compress the
          // compression.
          optimised: true,
        })
      })()
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


/**
 * Every folder an item's shrunk copies could be sitting in: its `thumb` folder,
 * and the item's own folder, which is where they were filed before that folder
 * existed. Nothing is created - an item with no copies must not gain a folder.
 */
async function renditionFolderCandidates(folderId: string | null): Promise<Array<string | null>> {
  const renditionFolderId = await findChildFolder(folderId, RENDITION_FOLDER_NAME)
  return renditionFolderId ? [renditionFolderId, folderId] : [folderId]
}

/**
 * Bring an item's shrunk copies with it when the item itself moves or is renamed.
 *
 * Left behind, a copy is stranded twice over: it sits in the old folder, and - if
 * the move re-keyed the original, which an exact-name move does - it answers to a
 * name derived from a key that no longer exists. Every lookup then comes back
 * empty and the next render mints a duplicate, so the library accumulates one
 * orphan per picture per move while the pages look perfectly well.
 *
 * So each copy is moved into the destination's `thumb` folder AND renamed to the
 * name the item's new key gives it, which is the name every lookup will ask for
 * from here on. Called from moveOrRenameMedia, which is the one place every move
 * passes through.
 *
 * Never throws: a copy that could not be brought along leaves the original
 * drawing at full size, which is heavier and right.
 */
export async function carryRenditionsWithOriginal(
  media: { id: string; key: string; folderId: string | null },
  previousFolderId: string | null,
  previousKey: string,
): Promise<void> {
  const folderChanged = previousFolderId !== media.folderId
  const rekeyed = previousKey !== media.key
  if (!folderChanged && !rekeyed) return

  const from = await renditionFolderCandidates(previousFolderId)
  let destinationId: string | null | undefined

  for (const spec of KNOWN_RENDITION_SPECS) {
    try {
      const wasCalled = renditionFileName(previousKey, spec.suffix)
      const nowCalled = renditionFileName(media.key, spec.suffix)
      const copies = await prisma.media.findMany({
        where: {
          mimeType: 'image/webp',
          originalName: wasCalled,
          OR: from.map((folderId) => ({ folderId })),
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })
      if (copies.length === 0) continue

      // Resolved (and created) only once something is genuinely being moved into
      // it, and only once for the whole set of sizes.
      destinationId ??= await getOrCreateChildFolder(media.folderId, RENDITION_FOLDER_NAME)
      if (!destinationId) continue

      for (const copy of copies) {
        // carryRenditions: false - a copy has no copies of its own, and asking
        // would be three queries per file on a backfill moving tens of thousands.
        // 'suffix' on a clash: two copies that meet in one folder are kept apart
        // rather than one silently replacing the other.
        await moveOrRenameMedia(copy.id, {
          targetFolderId: destinationId,
          newName: nowCalled,
          collision: 'suffix',
          carryRenditions: false,
        })
      }
    } catch (err) {
      console.warn(`[media] could not carry the ${spec.suffix} copy of ${media.id}:`, err)
    }
  }
}

/**
 * Remake an item's shrunk copies after its own bytes have changed.
 *
 * The case this exists for: somebody crops, resizes, replaces or optimises a
 * product photograph in the media library. The original is now a different
 * picture, and every small copy of it is a picture of what used to be there - on
 * every category page, in every thumbnail strip, indefinitely. Nothing else
 * notices, because a stale copy is a perfectly valid image file.
 *
 * `oldKey` is the key the item had BEFORE the edit, and it is needed rather than
 * nice to have: a copy is named after the original's key, and an optimise changes
 * that key (a PNG becomes a WebP). So the copies are FOUND by the old name and
 * REMADE under the new one.
 *
 * Each copy is remade at a fresh address, the references to the old one are
 * repointed onto it through the same hook that follows any other blob move, and
 * only then is the stale copy deleted. That order matters: a copy remade at its
 * own address would be a file every browser and edge cache has already been told
 * to keep for a year, so the new bytes would simply not be fetched.
 *
 * Never throws. A small copy that could not be remade leaves the item drawing its
 * original - heavier, and right - which is a great deal better than failing an
 * admin's crop.
 */
export async function refreshRenditions(
  media: { id: string; key: string; url: string; provider: MediaProviderType; mimeType: string; folderId: string | null },
  oldKey: string,
): Promise<void> {
  if (!RESIZABLE_TYPES.has(media.mimeType)) {
    // The item is no longer a picture core can shrink - a photograph replaced with
    // an SVG, say. Its old copies are now copies of something else entirely, so
    // they are cleared rather than remade: every renderer falls back to the
    // original, which is the only honest answer available.
    await discardRenditions(media, oldKey)
    return
  }

  for (const spec of KNOWN_RENDITION_SPECS) {
    try {
      const staleName = renditionFileName(oldKey, spec.suffix)
      const stale = await prisma.media.findMany({
        where: {
          mimeType: 'image/webp',
          originalName: staleName,
          // The `thumb` folder, and the item's own folder for an install whose
          // copies have not been tidied into it yet.
          OR: (await renditionFolderCandidates(media.folderId)).map((folderId) => ({ folderId })),
        },
        select: { id: true, key: true, url: true },
        orderBy: { createdAt: 'asc' },
      })
      if (stale.length === 0) continue

      // Remade from the item's CURRENT bytes. worthwhileBytes is 0 here, unlike on
      // the first pass: the copy already exists and something is pointing at it, so
      // "this picture is small enough not to bother" is not a decision to re-take -
      // taking it would leave the pointer aimed at the stale file for good.
      const made = await generateImageRenditions(media.url, [spec], { worthwhileBytes: 0 })
      const fresh = made[spec.suffix]

      // No replacement means the copy could not be remade - storage had a moment,
      // the encode failed. The stale one STAYS. Deleting it would leave every
      // reference to it aimed at a file that is not there, and a broken picture is
      // a good deal worse than an out-of-date one. The next edit tries again, and
      // so does the nightly sweep.
      if (!fresh) continue

      for (const old of stale) {
        // The same hook that follows any other blob move, so a url held in a
        // module's own table - the shop keeps its cards' copies in
        // shp_product_media.thumb_url - is repointed rather than left aimed at a
        // file about to be deleted. Before the delete, never after.
        await rewriteMediaReferencesInContent(old.url, fresh, old.key, fresh)
        await prisma.media.delete({ where: { id: old.id } }).catch(() => {})
        await deleteMedia(media.provider, old.key).catch(() => {})
      }
    } catch (err) {
      console.warn(`[media] could not remake the ${spec.suffix} copy of ${media.url}:`, err)
    }
  }
}

/**
 * Throw away an item's shrunk copies without making new ones, repointing anything
 * that held them back onto the original first.
 *
 * For the case where a copy can no longer exist: the picture has been replaced
 * with something core does not shrink. Leaving the old copies in place would show
 * the previous picture on every card; deleting them without repointing would show
 * a broken image, which is worse.
 */
async function discardRenditions(
  media: { key: string; url: string; provider: MediaProviderType; folderId: string | null },
  oldKey: string,
): Promise<void> {
  for (const spec of KNOWN_RENDITION_SPECS) {
    try {
      const stale = await prisma.media.findMany({
        where: {
          mimeType: 'image/webp',
          originalName: renditionFileName(oldKey, spec.suffix),
          OR: (await renditionFolderCandidates(media.folderId)).map((folderId) => ({ folderId })),
        },
        select: { id: true, key: true, url: true },
      })
      for (const old of stale) {
        // Onto the ORIGINAL, which is the fallback every renderer already has a
        // branch for.
        await rewriteMediaReferencesInContent(old.url, media.url, old.key, media.key)
        await prisma.media.delete({ where: { id: old.id } }).catch(() => {})
        await deleteMedia(media.provider, old.key).catch(() => {})
      }
    } catch (err) {
      console.warn(`[media] could not clear the ${spec.suffix} copy of ${media.url}:`, err)
    }
  }
}
