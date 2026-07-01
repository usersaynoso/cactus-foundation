import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { renderInfoPageContent } from '@/lib/puck/renderInfoPage'
import type { Metadata } from 'next'

export const metadata: Metadata = { robots: { index: false, follow: false } }

type Props = { params: Promise<{ id: string }> }

export default async function PagePreviewRoute({ params }: Props) {
  const { id } = await params

  const user = await getSessionFromCookie().catch(() => null)
  if (!user || !await hasPermission(user, 'pages.read')) notFound()

  const page = await prisma.infoPage.findUnique({
    where: { id },
    select: {
      id: true, title: true, body: true, bodyFormat: true,
      builderData: true, publishedData: true, status: true, slug: true,
    },
  }).catch(() => null)

  if (!page) notFound()

  const previewBar = (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: 'var(--color-text)', color: 'var(--color-bg)',
      padding: '0.4rem 1rem', fontSize: '0.8rem',
      display: 'flex', gap: '0.75rem', alignItems: 'center',
    }}>
      <span style={{ fontWeight: 600 }}>Draft preview</span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span style={{ opacity: 0.7 }}>{page.title}</span>
      <span style={{ marginLeft: 'auto', opacity: 0.5 }}>Not live — close this tab to return</span>
    </div>
  )

  // Force draft content for preview: show builderData regardless of publish state
  const previewPage = { ...page, status: 'draft' as const, publishedData: null }

  return (
    <div style={{ paddingTop: '2rem' }}>
      {previewBar}
      {await renderInfoPageContent(previewPage, {})}
    </div>
  )
}
