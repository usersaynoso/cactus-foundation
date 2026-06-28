import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { markdownToHtml } from '@/lib/sanitize'
import { getSessionFromCookie } from '@/lib/auth/session'
import { isAdmin } from '@/lib/permissions/check'
import { Render } from '@puckeditor/core/rsc'
import { puckRscConfig } from '@/lib/puck/config'
import { renderLayoutWithContent } from '@/lib/puck/renderLayoutWithContent'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { resolveTemplateData } from '@/lib/puck/resolveTemplateData'
import { StarterGalleryPage } from '@/lib/puck/StarterGalleryPage'
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

  const draftBanner = isDraft ? (
    <div style={{ margin: 0, borderRadius: 0, padding: '0.75rem 1.5rem', textAlign: 'center', background: '#fef9c3', color: '#a16207', fontSize: '0.875rem', fontWeight: 500 }}>
      Draft — not visible to the public
    </div>
  ) : null

  // Layouts gallery: admin-only page showing live previews of all starter templates
  if (slug === 'layouts') {
    try {
      const [starters, siteConfig] = await Promise.all([
        prisma.layout.findMany({
          where: { isStarter: true },
          orderBy: [{ type: 'asc' }, { name: 'asc' }],
          select: { id: true, name: true, type: true, description: true, builderData: true },
        }),
        prisma.siteConfig.findUnique({
          where: { id: 'singleton' },
          select: { siteName: true, adminPath: true, logoMediaId: true },
        }),
      ])
      const logoMedia = siteConfig?.logoMediaId
        ? await prisma.media.findUnique({ where: { id: siteConfig.logoMediaId }, select: { url: true } }).catch(() => null)
        : null
      const ctx = {
        siteName: siteConfig?.siteName ?? '',
        logoUrl: logoMedia?.url ?? null,
        isLoggedIn: false,
        adminPath: siteConfig?.adminPath ?? '',
      }
      const resolvedLayouts: Array<{ id: string; name: string; type: string; description: string | null; builderData: unknown }> = []
      for (const l of starters) {
        let builderData: unknown = null
        if (l.builderData) {
          try {
            builderData = await resolveTemplateData(l.builderData, ctx)
          } catch {
            builderData = l.builderData
          }
        }
        resolvedLayouts.push({ ...l, builderData })
      }
      return <StarterGalleryPage layouts={resolvedLayouts} draftBanner={draftBanner} />
    } catch (err) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '900px', margin: '0 auto' }}>
          {draftBanner}
          <h2 style={{ color: '#b91c1c', margin: '1rem 0 0.5rem' }}>Layouts gallery error (admin only)</h2>
          <pre style={{ background: '#fef2f2', padding: '1rem', borderRadius: '0.5rem', overflow: 'auto', fontSize: '0.8rem', color: '#7f1d1d', whiteSpace: 'pre-wrap' }}>
            {String(err instanceof Error ? err.stack ?? err.message : err)}
          </pre>
        </div>
      )
    }
  }

  const layout = await resolveThemeLayout('infoPage', { pageId: page.id, slug })

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
