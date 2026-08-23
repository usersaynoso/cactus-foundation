import { prisma } from '@/lib/db/prisma'
import { loadMediaUsageIndex, isMediaInUse } from '@/lib/media/references'
import { isOptimisableType } from '@/lib/media/limits'

// A one-shot overview of the whole media library, rendered in the page's stat
// bar. "Unused" and "optimisable" are computed classifications rather than
// columns, so they need every row's key/url checked against the usage index -
// one pass, on the server, at first paint.
export type LibraryStats = {
  totalFiles: number
  totalSize: number
  imageFiles: number
  optimisedFiles: number
  /** Raster images not yet re-encoded to WebP - the bulk-optimise candidates. */
  optimisableFiles: number
  unusedFiles: number
  /** Bytes tied up in files nothing on the site references - reclaimable by deletion. */
  unusedSize: number
}

export async function computeLibraryStats(): Promise<LibraryStats> {
  // Counting is the database's job. One grouped query returns a row per
  // (mime type, optimised) pair - a handful of rows, whatever the library's size -
  // rather than shipping every Media row across the wire to be tallied here.
  //
  // "Unused" is the exception: it isn't a column but a match of a row's id, key or
  // url against the Puck builder JSON, which no SQL predicate can express. Those
  // two figures still need one pass over the rows, so that query selects only the
  // four fields the check actually uses.
  const [groups, rows, usage] = await Promise.all([
    prisma.media.groupBy({
      by: ['mimeType', 'optimised'],
      _count: { _all: true },
      _sum: { sizeBytes: true },
    }),
    prisma.media.findMany({
      select: { id: true, key: true, url: true, sizeBytes: true },
    }),
    loadMediaUsageIndex(),
  ])

  const stats: LibraryStats = {
    totalFiles: 0,
    totalSize: 0,
    imageFiles: 0,
    optimisedFiles: 0,
    optimisableFiles: 0,
    unusedFiles: 0,
    unusedSize: 0,
  }

  for (const g of groups) {
    const count = g._count._all
    const isImage = g.mimeType.startsWith('image/')
    stats.totalFiles += count
    stats.totalSize += g._sum.sizeBytes ?? 0
    if (isImage) stats.imageFiles += count
    if (g.optimised) stats.optimisedFiles += count
    // Models count here too, so the tile's number matches the list behind it.
    if (isOptimisableType(g.mimeType) && !g.optimised) stats.optimisableFiles += count
  }

  for (const r of rows) {
    if (!isMediaInUse(r, usage)) {
      stats.unusedFiles += 1
      stats.unusedSize += r.sizeBytes
    }
  }

  return stats
}

/**
 * The same "unused" verdict as the stat tile, broken down by the folder each
 * file sits in - what the media page's folder filter lists while the Unused view
 * is on. `folderId` null is the library root.
 *
 * Only folders with something unused in them come back. A folder with nothing
 * spare has no business in a list whose whole job is "where is the reclaimable
 * stuff", and listing it would invite unticking a box that changes nothing.
 *
 * Its own scan rather than a field on LibraryStats: the stat bar is computed
 * once on the server at first paint and never refreshed, whereas this list has
 * to be re-read after a deletion or it keeps offering folders that are now
 * empty.
 */
export type UnusedFolderTally = { folderId: string | null; files: number; size: number }

export async function computeUnusedByFolder(): Promise<UnusedFolderTally[]> {
  const [rows, usage] = await Promise.all([
    prisma.media.findMany({ select: { id: true, key: true, url: true, sizeBytes: true, folderId: true } }),
    loadMediaUsageIndex(),
  ])

  // Keyed on the folder id with a separate slot for null, because a Map keyed on
  // `string | null` is exactly what it says and needs no sentinel.
  const tally = new Map<string | null, UnusedFolderTally>()
  for (const r of rows) {
    if (isMediaInUse(r, usage)) continue
    const existing = tally.get(r.folderId)
    if (existing) {
      existing.files += 1
      existing.size += r.sizeBytes
    } else {
      tally.set(r.folderId, { folderId: r.folderId, files: 1, size: r.sizeBytes })
    }
  }
  return [...tally.values()]
}
