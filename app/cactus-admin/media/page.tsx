import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermissions } from '@/lib/permissions/check'
import { parsePaginationParams } from '@/lib/utils'
import { queryMediaLibrary, parseLibraryQuery } from '@/lib/media/library-query'
import { computeLibraryStats } from '@/lib/media/library-stats'
import MediaLibrary from './MediaLibrary'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Media — Admin' }

const FOLDER_LIMIT = 500
const TAG_LIMIT = 500

type Props = { searchParams: Promise<Record<string, string>> }

export default async function MediaPage({ searchParams }: Props) {
  const user = await getSessionFromCookie()
  if (!user) return null

  // Both permissions in one query rather than a round-trip each.
  const granted = await hasPermissions(user, ['media.upload', 'media.delete'])
  const canUpload = granted['media.upload'] === true
  const canDelete = granted['media.delete'] === true

  const sp = await searchParams
  const params = new URLSearchParams(sp)
  const { perPage } = parsePaginationParams(params)

  // First paint: the library root, newest first. All further navigation, sorting
  // and filtering happens client-side against /api/admin/media.
  const query = parseLibraryQuery(new URLSearchParams(), perPage, 1)

  // Folder and tag lists are sidebar furniture, so they're capped rather than
  // unbounded. A library with more than FOLDER_LIMIT folders or TAG_LIMIT tags is
  // well past the point where a flat sidebar list is the right UI anyway.
  const [initial, folders, folderCounts, tags, stats] = await Promise.all([
    queryMediaLibrary(query),
    prisma.folder.findMany({ orderBy: { name: 'asc' }, take: FOLDER_LIMIT, select: { id: true, name: true, parentId: true } }),
    prisma.media.groupBy({ by: ['folderId'], _count: { _all: true } }),
    prisma.tag.findMany({ orderBy: { name: 'asc' }, take: TAG_LIMIT, select: { id: true, name: true, _count: { select: { media: true } } } }),
    computeLibraryStats(),
  ])

  const countByFolder = new Map<string, number>()
  let rootCount = 0
  for (const c of folderCounts) {
    if (c.folderId) countByFolder.set(c.folderId, c._count._all)
    else rootCount = c._count._all
  }

  return (
    <MediaLibrary
      initialItems={initial.items}
      initialHasMore={initial.hasMore}
      initialTotal={initial.total}
      folders={folders.map((f) => ({ ...f, mediaCount: countByFolder.get(f.id) ?? 0 }))}
      rootCount={rootCount}
      tags={tags.map((t) => ({ id: t.id, name: t.name, count: t._count.media }))}
      stats={stats}
      canUpload={canUpload}
      canDelete={canDelete}
      perPage={perPage}
    />
  )
}
