import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { parsePaginationParams } from '@/lib/utils'
import Link from 'next/link'
import MediaUpload from './MediaUpload'
import MediaDelete from './MediaDelete'
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
  const { skip, perPage, page } = parsePaginationParams(params)

  const search = params.get('q') ?? ''
  const where = search ? { OR: [{ key: { contains: search } }, { altText: { contains: search } }] } : {}

  const [items, total] = await Promise.all([
    prisma.media.findMany({
      where,
      skip, take: perPage,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, key: true, url: true, altText: true, mimeType: true,
        sizeBytes: true, createdAt: true, isDecorative: true,
        uploadedBy: { select: { username: true } },
      },
    }),
    prisma.media.count({ where }),
  ])

  const totalPages = Math.ceil(total / perPage)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Media Library</h1>
        {canUpload && <MediaUpload />}
      </div>

      <form style={{ marginBottom: '1.5rem' }}>
        <input
          name="q"
          defaultValue={search}
          placeholder="Search by filename or alt text…"
          style={{ padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', width: '100%', maxWidth: 360, fontFamily: 'inherit', fontSize: 'var(--text-base)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
        />
      </form>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
        {items.length === 0 && (
          <div style={{ gridColumn: '1/-1', color: 'var(--color-text-muted)', textAlign: 'center', padding: '3rem' }}>
            No media files yet
          </div>
        )}
        {items.map((item) => (
          <div key={item.id} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--color-bg-subtle)' }}>
            <div style={{ height: 140, background: 'var(--color-bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {item.mimeType.startsWith('image/') ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={item.url} alt={item.altText ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: '2rem' }}>📄</span>
              )}
            </div>
            <div style={{ padding: '0.625rem' }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.key.split('/').pop()}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                {(item.sizeBytes / 1024).toFixed(1)} KB
              </div>
              {canDelete && <MediaDelete mediaId={item.id} mediaUrl={item.url} />}
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          {page > 1 && <Link href={`?page=${page - 1}${search ? `&q=${search}` : ''}`}>←</Link>}
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <Link key={n} href={`?page=${n}${search ? `&q=${search}` : ''}`} className={n === page ? 'current' : ''}>{n}</Link>
          ))}
          {page < totalPages && <Link href={`?page=${page + 1}${search ? `&q=${search}` : ''}`}>→</Link>}
        </div>
      )}
    </div>
  )
}
