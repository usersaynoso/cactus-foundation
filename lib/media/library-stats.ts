import { prisma } from '@/lib/db/prisma'
import { loadMediaUsageIndex, isMediaInUse } from '@/lib/media/references'

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
  const [rows, usage] = await Promise.all([
    prisma.media.findMany({
      select: { id: true, key: true, url: true, mimeType: true, sizeBytes: true, optimised: true },
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

  for (const r of rows) {
    stats.totalFiles += 1
    stats.totalSize += r.sizeBytes
    const isImage = r.mimeType.startsWith('image/')
    const isSvg = r.mimeType === 'image/svg+xml'
    if (isImage) stats.imageFiles += 1
    if (r.optimised) stats.optimisedFiles += 1
    if (isImage && !isSvg && !r.optimised) stats.optimisableFiles += 1
    if (!isMediaInUse(r, usage)) {
      stats.unusedFiles += 1
      stats.unusedSize += r.sizeBytes
    }
  }

  return stats
}
