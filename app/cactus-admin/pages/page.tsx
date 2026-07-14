import { headers } from 'next/headers'
import { prisma } from '@/lib/db/prisma'
import { parsePaginationParams } from '@/lib/utils'
import { hasPermissions } from '@/lib/permissions/check'
import { getSessionFromCookie } from '@/lib/auth/session'
import Link from 'next/link'
import type { Metadata } from 'next'
import PagesTable from './PagesTable'

export const metadata: Metadata = { title: 'Pages — Admin' }

type Props = { searchParams: Promise<Record<string, string>> }

export default async function PagesPage({ searchParams }: Props) {
  const headersList = await headers()
  const adminPath = headersList.get('x-cactus-admin-path') ?? ''
  const user = await getSessionFromCookie()
  // Both permissions in one query rather than a round-trip each.
  const granted = user ? await hasPermissions(user, ['pages.write', 'pages.delete']) : {}
  const canWrite = granted['pages.write'] === true
  const canDelete = granted['pages.delete'] === true

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

      <PagesTable
        pages={pages}
        page={page}
        totalPages={totalPages}
        adminPath={adminPath}
        canWrite={canWrite}
        canDelete={canDelete}
      />
    </div>
  )
}
