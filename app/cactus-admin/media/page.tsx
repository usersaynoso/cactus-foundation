import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { parsePaginationParams } from '@/lib/utils'
import { queryMediaLibrary, parseLibraryQuery } from '@/lib/media/library-query'
import MediaLibrary from './MediaLibrary'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Media — Admin' }

type Props = { searchParams: Promise<Record<string, string>> }

export default async function MediaPage({ searchParams }: Props) {
  const user = await getSessionFromCookie()
  if (!user) return null

  const canUpload = await hasPermission(user, 'media.upload')
  const canDelete = await hasPermission(user, 'media.delete')

  const sp = await searchParams
  const params = new URLSearchParams(sp)
  const { perPage } = parsePaginationParams(params)

  // First paint: the library root, newest first. All further navigation, sorting
  // and filtering happens client-side against /api/admin/media.
  const query = parseLibraryQuery(new URLSearchParams(), perPage, 1)

  const [initial, folders, folderCounts, tags] = await Promise.all([
    queryMediaLibrary(query),
    prisma.folder.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, parentId: true } }),
    prisma.media.groupBy({ by: ['folderId'], _count: { _all: true } }),
    prisma.tag.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, _count: { select: { media: true } } } }),
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
      canUpload={canUpload}
      canDelete={canDelete}
      perPage={perPage}
    />
  )
}
