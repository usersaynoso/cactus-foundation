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

// One writer at a time per folder, for the pick-a-free-name-then-write-it step.
//
// buildLibraryUploadKey chooses a name by looking for a taken one, which is a read
// followed by a write with nothing holding the gap. Sequentially that is fine.
// Twelve at a time in one folder is not: they all read "x-thumb.webp is free",
// they all try to write it, one wins and eleven come back with a unique-key
// violation. Retrying only reshuffles the same race - measured on a real backfill,
// three rounds of it still left failures, because every round had eleven runners
// picking the same "first free" name again.
//
// So the pick and the write are one critical section, keyed by folder because that
// is the scope the name has to be unique in. Everything expensive - fetching the
// original, decoding it, encoding the copy - stays outside it and stays parallel;
// what is serialised is a lookup and an insert, and only against other writers into
// the SAME folder.
//
// Process-local, deliberately. Two machines running the backfill at once would
// still race, and the retry below is what covers that; one machine running it
// twelve ways is the case that actually happens, and this removes it entirely.
const folderWriteQueues = new Map<string, Promise<unknown>>()

function withFolderLock<T>(folderId: string | null, work: () => Promise<T>): Promise<T> {
  const key = folderId ?? '(root)'
  const previous = folderWriteQueues.get(key) ?? Promise.resolve()
  // Chained off the previous writer's SETTLEMENT, not its success - one failed
  // write must not wedge the folder for everything behind it.
  const next = previous.then(work, work)
  folderWriteQueues.set(key, next.then(() => undefined, () => undefined))
  return next
}

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

      const fileName = `${baseName}-${spec.suffix}.webp`

      // This rendition may already exist. The name is derived from the ORIGINAL's
      // own key and it is filed in the original's own folder, so a webp of that
      // name there is this rendition of this picture and nothing else - made by
      // an earlier run, or by another module that shrank the same library item.
      //
      // Reusing it rather than minting one matters more than it sounds. Without
      // this, `buildLibraryUploadKey` dedupes the collision with the usual "-2",
      // so a backfill over a shop where several values share one fabric wrote a
      // fresh identical file per value. On the catalogue this was written for
      // that was 258 files nothing pointed at, 10 MB of them.
      //
      // Matched on `originalName` rather than `key`, because a duplicate minted
      // before this existed carries the "-2" in its key and the plain name here;
      // oldest first, so repeated runs converge on one file rather than drifting.
      const existing = await prisma.media.findFirst({
        where: { folderId: media.folderId, mimeType: 'image/webp', originalName: fileName },
        select: { url: true },
        orderBy: { createdAt: 'asc' },
      })
      if (existing) {
        out[spec.suffix] = existing.url
        continue
      }

      // buildLibraryUploadKey picks a free name by LOOKING for a taken one, which
      // is a read followed by a write with nothing holding the gap. One caller at
      // a time never notices. A backfill running a dozen at once does: two
      // originals in the same folder whose names differ only by extension
      // ("chair.webp", "chair.jpeg") both want "chair-thumb.webp", both find it
      // free, and the second `create` loses on the unique key.
      //
      // Retried rather than caught and ignored, and deliberately NOT "adopt
      // whatever won the race": the winner is a copy of the OTHER picture, so
      // taking its url would quietly put the wrong photograph on a product. Going
      // round again re-asks for a free name and gets "chair-thumb-2.webp", which
      // is what a sequential run would have produced. The re-upload that costs is
      // worth it at roughly one collision in three thousand.
      const record = await withFolderLock(media.folderId, async () => {
        // The retry is the backstop for a racer this lock cannot see - a second
        // process running the same backfill. Retried rather than "adopt whatever
        // won": the winner is a copy of a DIFFERENT picture, so taking its url
        // would quietly put the wrong photograph on a product. Going round again
        // asks for a free name and gets "x-thumb-2.webp", which is what a
        // sequential run would have produced.
        for (let attempt = 1; ; attempt++) {
          const key = await buildLibraryUploadKey(media.provider, 'image/webp', fileName, folderPath || undefined)
          const uploaded = await uploadMedia(shrunk, 'image/webp', media.provider, fileName, folderPath || undefined, false, key)
          try {
            return await saveMediaRecord({
              key: uploaded.key,
              url: uploaded.url,
              provider: media.provider,
              mimeType: 'image/webp',
              sizeBytes: shrunk.length,
              uploadedById: userId ?? media.uploadedById ?? undefined,
              originalName: fileName,
              folderId: media.folderId,
              // A derived resize of an already-served picture: the optimiser has
              // nothing to add, and the lightning button would only re-compress
              // the compression.
              optimised: true,
            })
          } catch (err) {
            const code = (err as { code?: string })?.code
            if (code !== 'P2002' || attempt >= 5) throw err
          }
        }
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

/**
 * The name `generateImageRenditions` files a rendition under, for one original.
 * Exported so callers can reason about a rendition without making one - the
 * backfill counts what is missing this way.
 *
 * Derived from the ORIGINAL's storage key, exactly as the writer above derives
 * it, so the two can never drift: whatever nanoid prefix `buildLibraryUploadKey`
 * gave the original is carried into its rendition's name, which is what makes
 * the name specific enough to look up again.
 */
export function renditionFileName(key: string, suffix: string): string {
  const baseName = (key.split('/').pop() ?? 'image').replace(/\.[a-z0-9]+$/i, '')
  return `${baseName}-${suffix}.webp`
}

// A folder id is nullable (the library root), and null cannot be part of a string
// key that a lookup would also find - so the root is spelled out rather than left
// to coerce into "null" and collide with a folder literally called that.
const ROOT_FOLDER = ' root'

function folderScopedName(folderId: string | null, fileName: string): string {
  return `${folderId ?? ROOT_FOLDER} ${fileName}`
}

/**
 * Find the existing renditions for a batch of original urls.
 *
 * Two queries for the whole batch, whatever its size. This is called on a page
 * render - a category grid resolving the small copy of every picture on it, a
 * product save resolving the copies its images already have - so a query per
 * picture was never on the cards.
 *
 * Returns a map from original url to rendition url. An original with no
 * rendition is simply absent, and callers fall back to the original: always a
 * correct answer, if a heavy one.
 *
 * Matched on folder AND name rather than name alone. A rendition is filed beside
 * its original, and an original whose key carries no nanoid (an exact-form key -
 * see lib/media/keys.ts) can share a basename with an unrelated picture in
 * another folder. The name narrows it to a handful; the folder settles it.
 */
export async function findRenditionUrls(
  originalUrls: string[],
  suffix: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const unique = [...new Set(originalUrls)].filter(Boolean)
  if (unique.length === 0) return out

  const originals = await prisma.media.findMany({
    where: { url: { in: unique } },
    select: { url: true, key: true, folderId: true },
  })
  if (originals.length === 0) return out

  const wanted = new Map<string, string>()
  for (const o of originals) {
    wanted.set(folderScopedName(o.folderId, renditionFileName(o.key, suffix)), o.url)
  }

  const names = [...new Set(originals.map((o) => renditionFileName(o.key, suffix)))]
  const found = await prisma.media.findMany({
    where: { mimeType: 'image/webp', originalName: { in: names } },
    select: { url: true, originalName: true, folderId: true },
    // Oldest first, so a folder holding a duplicate minted before renditions were
    // deduped resolves to the same file on every run rather than drifting between
    // them - the same tie-break the writer above applies.
    orderBy: { createdAt: 'asc' },
  })

  for (const f of found) {
    if (!f.originalName) continue
    const originalUrl = wanted.get(folderScopedName(f.folderId, f.originalName))
    if (!originalUrl) continue
    if (!out.has(originalUrl)) out.set(originalUrl, f.url)
  }
  return out
}
