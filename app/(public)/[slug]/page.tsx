import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { markdownToHtml } from '@/lib/sanitize'
import { getSessionFromCookie } from '@/lib/auth/session'
import { isAdmin } from '@/lib/permissions/check'
import { Render } from '@puckeditor/core/rsc'
import { puckRscConfig } from '@/lib/puck/config'
import { renderLayoutWithContent } from '@/lib/puck/renderLayoutWithContent'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import type { Data } from '@puckeditor/core'
import type { Metadata } from 'next'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const page = await prisma.infoPage.findUnique({
      where: { slug },
      select: { title: true, metaDescription: true, status: true, ogImageId: true },
    })
    if (!page || page.status === 'draft') return {}
    const ogImageUrl = page.ogImageId
      ? await prisma.media.findUnique({ where: { id: page.ogImageId }, select: { url: true } }).then((m) => m?.url)
      : undefined
    return { title: page.title, description: page.metaDescription ?? undefined, openGraph: ogImageUrl ? { images: [{ url: ogImageUrl }] } : undefined }
  } catch { return {} }
}

export async function generateStaticParams() {
  try {
    const pages = await prisma.infoPage.findMany({ where: { status: 'published' }, select: { slug: true } })
    return pages.map((p) => ({ slug: p.slug }))
  } catch { return [] }
}

export const dynamicParams = true
export const revalidate = false

export default async function InfoPageRoute({ params }: Props) {
  const { slug } = await params
  const page = await prisma.infoPage.findUnique({
    where: { slug },
    select: {
      id: true, title: true, body: true, bodyFormat: true, builderData: true, status: true,
    },
  }).catch(() => null)

  if (!page) notFound()

  if (page.status === 'draft') {
    const user = await getSessionFromCookie()
    if (!user || !isAdmin(user)) notFound()
  }

  const isDraft = page.status === 'draft'

  const layout = await resolveThemeLayout('infoPage', { pageId: page.id, slug })

  const draftBanner = isDraft ? (
    <div style={{ margin: 0, borderRadius: 0, padding: '0.75rem 1.5rem', textAlign: 'center', background: '#fef9c3', color: '#a16207', fontSize: '0.875rem', fontWeight: 500 }}>
      Draft — not visible to the public
    </div>
  ) : null

  if (page.bodyFormat === 'builder') {
    const pageData = page.builderData as Data | null
    if (!pageData) {
      return (
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
          {draftBanner}
          <p style={{ color: 'var(--color-muted)', textAlign: 'center', padding: '4rem 0' }}>This page has no builder content yet.</p>
        </div>
      )
    }

    if (layout?.builderData) {
      const pageContent = (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <Render config={puckRscConfig as any} data={pageData} />
      )
      return (
        <>
          {draftBanner}
          {renderLayoutWithContent(layout.builderData as Data, pageContent)}
        </>
      )
    }

    return (
      <>
        {draftBanner}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Render config={puckRscConfig as any} data={pageData} />
      </>
    )
  }

  const html = markdownToHtml(page.body)
  const markdownContent = (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <article>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 800, margin: '0 0 1.5rem', lineHeight: 1.2 }}>{page.title}</h1>
        <div className="prose" dangerouslySetInnerHTML={{ __html: html }} style={{ lineHeight: 1.75, color: 'var(--color-fg-secondary)' }} />
      </article>
    </div>
  )

  if (layout?.builderData) {
    return (
      <>
        {draftBanner}
        {renderLayoutWithContent(layout.builderData as Data, markdownContent)}
      </>
    )
  }

  return <>{draftBanner}{markdownContent}</>
}
