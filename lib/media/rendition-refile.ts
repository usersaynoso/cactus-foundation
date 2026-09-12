import { prisma } from '@/lib/db/prisma'
import { cleanFolderName, getOrCreateChildFolder, moveOrRenameMedia } from '@/lib/media/organise'
import { KNOWN_RENDITION_SPECS, RENDITION_FOLDER_NAME, renditionFileName } from '@/lib/media/rendition-naming'

// Tidying the shrunk copies of an established library into `thumb` folders.
//
// Copies used to be filed in the original's own folder, which is why a product
// folder read as each picture twice over: 28,335 photographs and 40,314 copies of
// them sharing 1,274 folders on the catalogue this was written for. New copies go
// one level down (lib/media/renditions.ts), and this walks what is already there
// and moves it.
//
// Written to be run repeatedly rather than to run once perfectly. It works folder
// by folder in id order and reports the last one it finished, so a run that is
// cut off resumes from there; and a folder that has already been tidied costs one
// query and moves nothing. Every lookup accepts a copy in either place while this
// is outstanding, so a half-done sweep is a tidiness state and never a broken
// picture.
//
// It moves blobs, so it is a terminal job rather than a button - see
// scripts/backfill-rendition-folders.mts.

/** A folder to sweep. The library root is a folder here too, with a null id. */
type SweepFolder = { id: string | null; name: string }

export type RenditionRefileProgress = {
  /** Folders looked at so far in this run. */
  foldersSeen: number
  /** Copies moved into a `thumb` folder. */
  moved: number
  /** Copies this run could not move. A copy already tidied away is never seen:
   *  the sweep skips `thumb` folders outright, so it costs nothing to re-run. */
  left: number
}

export type RenditionRefileResult = RenditionRefileProgress & {
  /** The last folder id this run finished with - pass it back as `after` to carry on. */
  lastFolderId: string | null
  /** Whether there are folders after that one. */
  more: boolean
}

/**
 * How many library items look like a shrunk copy still sitting beside its
 * original. The number the sweep is working through; approximate by design, since
 * settling it exactly means the same per-folder walk the sweep itself does.
 */
export async function countRenditionsToRefile(): Promise<number> {
  const tidy = await prisma.folder.findMany({
    where: { name: cleanFolderName(RENDITION_FOLDER_NAME) },
    select: { id: true },
  })
  const tidyIds = tidy.map((f) => f.id)
  return prisma.media.count({
    where: {
      mimeType: 'image/webp',
      // Spelled out rather than left to `notIn`, because SQL's NOT IN is NULL for
      // a NULL column and would quietly drop every copy sitting in the library
      // root - which is exactly where a copy made before its original was filed
      // ends up.
      AND: [
        { OR: [{ folderId: null }, { folderId: { notIn: tidyIds } }] },
        { OR: KNOWN_RENDITION_SPECS.map((spec) => ({ originalName: { endsWith: `-${spec.suffix}.webp` } })) },
      ],
    },
  })
}

/**
 * Move the shrunk copies in up to `limit` folders into each folder's `thumb`
 * subfolder.
 *
 * A copy is recognised by NAME, matched against the names the folder's own
 * originals would give their copies - not by the `-thumb.webp` tail alone. That
 * is what keeps a picture somebody happened to upload as "swatch-thumb.webp" out
 * of the sweep, unless the folder also holds a "swatch" it could plausibly be the
 * copy of, in which case it is indistinguishable from one and is treated as one.
 *
 * `dryRun` reports what would move and moves nothing.
 */
export async function refileRenditionsIntoThumbFolders(opts?: {
  after?: string | null
  limit?: number
  dryRun?: boolean
  onProgress?: (p: RenditionRefileProgress) => void
}): Promise<RenditionRefileResult> {
  const limit = opts?.limit ?? 50
  const dryRun = opts?.dryRun ?? false
  const after = opts?.after ?? null
  const tidyName = cleanFolderName(RENDITION_FOLDER_NAME)

  // The library root is swept first and only once, before any folder id - it has
  // no id of its own to resume from, and it is where a stray copy lands when
  // something was shrunk before it was filed anywhere.
  const folders: SweepFolder[] = after === null ? [{ id: null, name: '' }] : []

  const rows = await prisma.folder.findMany({
    where: { ...(after ? { id: { gt: after } } : {}), name: { not: tidyName } },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
    // One more than asked for, to answer "is there more after this?" without a
    // second count over the whole tree.
    take: limit + 1,
  })
  const more = rows.length > limit
  for (const row of rows.slice(0, limit)) folders.push(row)

  const progress: RenditionRefileProgress = { foldersSeen: 0, moved: 0, left: 0 }
  let lastFolderId: string | null = after

  for (const folder of folders) {
    progress.foldersSeen += 1
    if (folder.id !== null) lastFolderId = folder.id

    const items = await prisma.media.findMany({
      where: { folderId: folder.id },
      select: { id: true, key: true, originalName: true, mimeType: true },
    })
    if (items.length === 0) {
      opts?.onProgress?.({ ...progress })
      continue
    }

    // The names this folder's own pictures would give their copies. Built from
    // every item rather than only the shrinkable ones: an original that has since
    // been replaced by something core cannot shrink still has copies on file, and
    // they are exactly the ones worth tidying away.
    const expected = new Set<string>()
    for (const item of items) {
      for (const spec of KNOWN_RENDITION_SPECS) expected.add(renditionFileName(item.key, spec.suffix))
    }

    const copies = items.filter((i) => i.mimeType === 'image/webp' && i.originalName && expected.has(i.originalName))
    if (copies.length === 0) {
      opts?.onProgress?.({ ...progress })
      continue
    }

    if (dryRun) {
      progress.moved += copies.length
      opts?.onProgress?.({ ...progress })
      continue
    }

    const destinationId = await getOrCreateChildFolder(folder.id, RENDITION_FOLDER_NAME)
    if (destinationId === null) {
      progress.left += copies.length
      opts?.onProgress?.({ ...progress })
      continue
    }

    for (const copy of copies) {
      try {
        // carryRenditions: false - a copy has no copies of its own, and asking
        // would be three queries per file across tens of thousands of them.
        // 'suffix' on a clash keeps two copies that meet in one folder apart
        // rather than letting one replace the other.
        await moveOrRenameMedia(copy.id, {
          targetFolderId: destinationId,
          collision: 'suffix',
          carryRenditions: false,
        })
        progress.moved += 1
      } catch (err) {
        // One copy failing to move must not end the sweep: it stays where it is,
        // every lookup still finds it there, and the next run tries again.
        console.warn(`[media] could not refile the shrunk copy ${copy.id}:`, err)
        progress.left += 1
      }
      opts?.onProgress?.({ ...progress })
    }
  }

  return { ...progress, lastFolderId, more }
}
