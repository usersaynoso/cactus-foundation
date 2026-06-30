import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { markdownToHtml } from '@/lib/sanitize'
import { getSessionFromCookie } from '@/lib/auth/session'
import { isAdmin } from '@/lib/permissions/check'
import { Render } from '@puckeditor/core/rsc'
import { puckRscConfig } from '@/lib/puck/config'
import { renderLayoutWithContent } from '@/lib/puck/renderLayoutWithContent'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import type { Data } from '@puckeditor/core'

export const dynamic = 'force-dynamic'

export default async function RootPage() {
  let setupCompleted = false
  try {
    const cfg = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { setupCompleted: true },
    })
    setupCompleted = cfg?.setupCompleted ?? false
  } catch {
    setupCompleted = false
  }

  if (!setupCompleted) {
    redirect('/setup')
  }

  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { siteName: true, tagline: true, description: true, homepageId: true },
  })

  if (config?.homepageId) {
    const page = await prisma.infoPage.findUnique({
      where: { id: config.homepageId },
      select: {
        id: true, title: true, body: true, bodyFormat: true, builderData: true, status: true,
      },
    }).catch(() => null)

    if (page) {
      if (page.status === 'draft') {
        const user = await getSessionFromCookie()
        if (user && isAdmin(user)) {
          return renderHomePage(page, true, config.homepageId)
        }
        // fall through to welcome screen for non-admins
      } else {
        return renderHomePage(page, false, config.homepageId)
      }
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '4rem 1.5rem' }}>
      <h1>{config?.siteName ?? 'Welcome'}</h1>
      {config?.tagline && <p style={{ fontSize: '1.25rem', color: 'var(--color-fg-secondary)' }}>{config.tagline}</p>}
      {config?.description && <p>{config.description}</p>}
    </div>
  )
}

type PageData = {
  id: string
  title: string
  body: string
  bodyFormat: string
  builderData: unknown
  status: string
}

async function renderHomePage(page: PageData, isDraft: boolean, pageId: string) {
  const layout = await resolveThemeLayout('infoPage', { pageId, slug: 'home', isHomepage: true })

  const draftBanner = isDraft ? (
    <div style={{ margin: 0, borderRadius: 0, padding: '0.75rem 1.5rem', textAlign: 'center', background: 'var(--color-warning-bg)', color: 'var(--color-warning)', fontSize: '0.875rem', fontWeight: 500 }}>
      Draft — not visible to the public
    </div>
  ) : null

  if (page.bodyFormat === 'builder') {
    const data = page.builderData as Data | null
    if (!data) {
      return (
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
          {draftBanner}
          <p style={{ color: 'var(--color-muted)', textAlign: 'center', padding: '4rem 0' }}>This page has no builder content yet.</p>
        </div>
      )
    }

    if (layout?.builderData) {

      const pageContent = <Render config={puckRscConfig as any} data={data} />
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
        <Render config={puckRscConfig as any} data={data} />
      </>
    )
  }

  const html = markdownToHtml(page.body)
  const markdownContent = (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
      {draftBanner}
      <article>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 800, margin: '0 0 1.5rem', lineHeight: 1.2 }}>{page.title}</h1>
        <div className="prose" dangerouslySetInnerHTML={{ __html: html }} style={{ lineHeight: 1.75, color: 'var(--color-fg)' }} />
      </article>
    </div>
  )

  if (layout?.builderData) {
    return renderLayoutWithContent(layout.builderData as Data, markdownContent)
  }

  return markdownContent
}
