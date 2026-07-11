import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { parsePaginationParams } from '@/lib/utils'
import { loadMediaUsageIndex, isMediaInUse } from '@/lib/media/references'
import { TabStrip, type TabStripItem } from '@/components/admin/TabStrip'
import MediaUpload from './MediaUpload'
import MediaGrid from './MediaGrid'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Media — Admin' }

type Props = { searchParams: Promise<Record<string, string>> }

type MediaFilter = 'all' | 'in-use' | 'unused'

export default async function MediaPage({ searchParams }: Props) {
  const user = await getSessionFromCookie()
  if (!user) return null

  const canUpload = await hasPermission(user, 'media.upload')
  const canDelete = await hasPermission(user, 'media.delete')

  const sp = await searchParams
  const params = new URLSearchParams(sp)
  const { perPage } = parsePaginationParams(params)

  const search = params.get('q') ?? ''
  const rawFilter = params.get('filter')
  const filter: MediaFilter = rawFilter === 'in-use' || rawFilter === 'unused' ? rawFilter : 'all'
  const where = search ? { OR: [{ key: { contains: search } }, { originalName: { contains: search } }, { altText: { contains: search } }] } : {}

  // "In use" is computed, not a column, so we load every matching row, classify
  // it against the usage index, then filter and paginate in memory.
  const [allItems, usage] = await Promise.all([
    prisma.media.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, key: true, url: true, altText: true, originalName: true, mimeType: true,
        sizeBytes: true, createdAt: true, isDecorative: true,
        uploadedBy: { select: { username: true } },
      },
    }),
    loadMediaUsageIndex(),
  ])

  const classified = allItems.map((item) => ({ ...item, inUse: isMediaInUse(item, usage) }))
  const total = classified.length
  const inUseCount = classified.filter((i) => i.inUse).length
  const unusedCount = total - inUseCount

  const filtered =
    filter === 'in-use' ? classified.filter((i) => i.inUse)
      : filter === 'unused' ? classified.filter((i) => !i.inUse)
        : classified

  const items = filtered.slice(0, perPage)
  const hasMore = filtered.length > items.length

  // Preserve the search term across tab switches; drop page (filtered counts differ).
  const hrefFor = (f: MediaFilter) => {
    const u = new URLSearchParams()
    if (search) u.set('q', search)
    if (f !== 'all') u.set('filter', f)
    const qs = u.toString()
    return qs ? `?${qs}` : '?'
  }
  const tabs: TabStripItem[] = [
    { key: 'all', label: `All (${total})`, href: hrefFor('all'), active: filter === 'all' },
    { key: 'in-use', label: `In Use (${inUseCount})`, href: hrefFor('in-use'), active: filter === 'in-use' },
    { key: 'unused', label: `Not In Use (${unusedCount})`, href: hrefFor('unused'), active: filter === 'unused' },
  ]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Media Library</h1>
        {canUpload && <MediaUpload />}
      </div>

      <TabStrip items={tabs} />

      <form style={{ marginBottom: '1.5rem' }}>
        {filter !== 'all' && <input type="hidden" name="filter" value={filter} />}
        <input
          name="q"
          defaultValue={search}
          placeholder="Search by filename or alt text…"
          style={{ padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', width: '100%', maxWidth: 360, fontFamily: 'inherit', fontSize: 'var(--text-base)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
        />
      </form>

      {items.length === 0 ? (
        <div style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '3rem' }}>
          {search ? 'No media matches your search'
            : filter === 'in-use' ? 'No media is currently in use'
              : filter === 'unused' ? 'Every media item is in use'
                : 'No media files yet'}
        </div>
      ) : (
        <MediaGrid items={items} canDelete={canDelete} hasMore={hasMore} search={search} filter={filter} perPage={perPage} />
      )}
    </div>
  )
}
