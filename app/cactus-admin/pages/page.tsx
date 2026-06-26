import { headers } from 'next/headers'
import { prisma } from '@/lib/db/prisma'
import { parsePaginationParams } from '@/lib/utils'
import { hasPermission } from '@/lib/permissions/check'
import { getSessionFromCookie } from '@/lib/auth/session'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Pages — Admin' }

type Props = { searchParams: Promise<Record<string, string>> }

export default async function PagesPage({ searchParams }: Props) {
  const headersList = await headers()
  const adminPath = headersList.get('x-cactus-admin-path') ?? ''
  const user = await getSessionFromCookie()
  const canWrite = user ? await hasPermission(user, 'pages.write') : false
  const canPublish = user ? await hasPermission(user, 'pages.publish') : false
  const canDelete = user ? await hasPermission(user, 'pages.delete') : false

  const sp = await searchParams
  const params = new URLSearchParams(sp)
  const { page, perPage, skip } = parsePaginationParams(params)

  const [pages, total] = await Promise.all([
    prisma.infoPage.findMany({
      skip,
      take: perPage,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, slug: true, title: true, status: true,
        createdAt: true, updatedAt: true,
        createdBy: { select: { username: true } },
      },
    }),
    prisma.infoPage.count(),
  ])

  const totalPages = Math.ceil(total / perPage)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Info Pages</h1>
        {canWrite && (
          <Link href={`/${adminPath}/pages/new`} className="btn btn-primary">+ New page</Link>
        )}
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Slug</th>
              <th>Status</th>
              <th>Author</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pages.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af' }}>No pages yet</td></tr>
            )}
            {pages.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.title}</strong>
                </td>
                <td><code style={{ fontSize: '0.875rem' }}>{p.slug}</code></td>
                <td>
                  <span className={`badge ${p.status === 'published' ? 'badge-green' : 'badge-gray'}`}>
                    {p.status}
                  </span>
                </td>
                <td>{p.createdBy?.username ?? '—'}</td>
                <td style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  {new Date(p.updatedAt).toLocaleDateString()}
                </td>
                <td>
                  {canWrite && (
                    <Link href={`/${adminPath}/pages/${p.id}`} className="btn btn-secondary btn-sm">Edit</Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          {page > 1 && <Link href={`?page=${page - 1}`}>←</Link>}
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <Link key={n} href={`?page=${n}`} className={n === page ? 'current' : ''}>{n}</Link>
          ))}
          {page < totalPages && <Link href={`?page=${page + 1}`}>→</Link>}
        </div>
      )}
    </div>
  )
}
