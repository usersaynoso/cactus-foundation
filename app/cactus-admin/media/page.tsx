import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermissions } from '@/lib/permissions/check'
import { parsePaginationParams } from '@/lib/utils'
import { queryMediaLibrary, parseLibraryQuery } from '@/lib/media/library-query'
import { computeLibraryStats } from '@/lib/media/library-stats'
import MediaLibrary from './MediaLibrary'
import MediaStorageCheck from './MediaStorageCheck'
import MediaTabs from './MediaTabs'
import { getSequenceConfig } from '@/lib/media/sequence-presets'
import { listSequenceJobs } from '@/lib/media/sequence-jobs'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Media — Admin' }

const FOLDER_LIMIT = 500
const TAG_LIMIT = 500

type Props = { searchParams: Promise<Record<string, string>> }

export default async function MediaPage({ searchParams }: Props) {
  const user = await getSessionFromCookie()
  if (!user) return null

  // Both permissions in one query rather than a round-trip each.
  const granted = await hasPermissions(user, ['media.upload', 'media.delete', 'config.manage'])
  const canUpload = granted['media.upload'] === true
  const canDelete = granted['media.delete'] === true
  // The storage check reports on the bucket as a whole, including files no media
  // item claims, so it sits behind the same permission as the other storage
  // settings rather than the media.* pair.
  const canCheckStorage = granted['config.manage'] === true

  const sp = await searchParams
  const params = new URLSearchParams(sp)
  const { perPage } = parsePaginationParams(params)

  // The folder you were standing in, carried in the URL so a refresh (or a
  // shared link) lands back in it rather than dumping you at the root. Verified
  // before it is used: a stale or hand-typed id would otherwise render an empty
  // grid with no way back except the breadcrumb.
  const requested = params.get('folder')
  const initialFolderId =
    requested && requested !== 'root' && requested !== 'all'
      ? (await prisma.folder.findUnique({ where: { id: requested }, select: { id: true } }))?.id ?? null
      : null

  // First paint: that folder (or the library root), newest first. All further
  // navigation, sorting and filtering happens client-side against
  // /api/admin/media.
  const firstPaint = new URLSearchParams()
  if (initialFolderId) firstPaint.set('folder', initialFolderId)
  const query = parseLibraryQuery(firstPaint, perPage, 1)

  // The stat bar needs a scan of the whole library (every row plus the usage
  // index), which has no business holding up first paint - a visitor opening the
  // media page wants the grid and the folder tree, not to wait on four count
  // tiles. So the scan is kicked off but deliberately left un-awaited here; the
  // promise is handed to the client, which streams the tiles in under a Suspense
  // boundary once they resolve. Nothing below blocks on it.
  const statsPromise = computeLibraryStats()

  // Folder and tag lists are sidebar furniture, so they're capped rather than
  // unbounded. A library with more than FOLDER_LIMIT folders or TAG_LIMIT tags is
  // well past the point where a flat sidebar list is the right UI anyway.
  const [initial, folders, folderCounts, tags, sequencePresets, sequenceJobs] = await Promise.all([
    queryMediaLibrary(query),
    prisma.folder.findMany({ orderBy: { name: 'asc' }, take: FOLDER_LIMIT, select: { id: true, name: true, parentId: true } }),
    prisma.media.groupBy({ by: ['folderId'], _count: { _all: true } }),
    prisma.tag.findMany({ orderBy: { name: 'asc' }, take: TAG_LIMIT, select: { id: true, name: true, _count: { select: { media: true } } } }),
    getSequenceConfig(),
    listSequenceJobs(),
  ])

  const countByFolder = new Map<string, number>()
  let rootCount = 0
  for (const c of folderCounts) {
    if (c.folderId) countByFolder.set(c.folderId, c._count._all)
    else rootCount = c._count._all
  }

  return (
    <MediaTabs
      presets={sequencePresets}
      jobs={sequenceJobs}
      canManagePresets={canCheckStorage}
      library={
        <>
          <MediaLibrary
            initialItems={initial.items}
            initialHasMore={initial.hasMore}
            initialTotal={initial.total}
            folders={folders.map((f) => ({ ...f, mediaCount: countByFolder.get(f.id) ?? 0 }))}
            rootCount={rootCount}
            initialFolderId={initialFolderId}
            tags={tags.map((t) => ({ id: t.id, name: t.name, count: t._count.media }))}
            statsPromise={statsPromise}
            canUpload={canUpload}
            canDelete={canDelete}
            perPage={perPage}
          />
          {canCheckStorage && <MediaStorageCheck canDelete={canDelete} />}
        </>
      }
    />
  )
}
