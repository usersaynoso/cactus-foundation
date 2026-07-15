import { Render } from '@puckeditor/core/rsc'
import { puckRscConfig } from '@/lib/puck/config.rsc'
import { renderLayoutWithContent } from '@/lib/puck/renderLayoutWithContent'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { markdownToHtml } from '@/lib/sanitize'
import { obfuscateEmailsInHtml } from '@/lib/email-obfuscate'
import type { Data } from '@puckeditor/core'

type PageShape = {
  id: string
  slug: string
  title: string
  body: string
  bodyFormat: string
  builderData: unknown
  publishedData: unknown
  status: string
}

// Selects the content blob to render: live pages use publishedData (with
// builderData as a fallback for un-backfilled rows), draft pages use builderData.
export function resolveContentData(page: PageShape): unknown {
  if (page.status === 'published') {
    return page.publishedData ?? page.builderData
  }
  return page.builderData
}

type RenderOptions = {
  draftBanner?: React.ReactNode
  isHomepage?: boolean
}

export async function renderInfoPageContent(page: PageShape, options: RenderOptions = {}) {
  const { draftBanner = null, isHomepage = false } = options
  const layout = await resolveThemeLayout('infoPage', { pageId: page.id, slug: page.slug, isHomepage })

  if (page.bodyFormat === 'builder') {
    const pageData = resolveContentData(page) as Data | null
    if (!pageData) {
      return (
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
          {draftBanner}
          <p style={{ color: 'var(--color-muted)', textAlign: 'center', padding: '4rem 0' }}>This page has no builder content yet.</p>
        </div>
      )
    }

    if (layout?.builderData) {
      const pageContent = <Render config={puckRscConfig as any} data={pageData} />
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
        <Render config={puckRscConfig as any} data={pageData} />
      </>
    )
  }

  // Obfuscate AFTER the markdown render: markdownToHtml sanitises internally,
  // and DOMPurify's re-serialisation would decode the obfuscator's entities
  // (same order invariant as sanitizeAndObfuscateRichText in lib/sanitize.ts).
  // These are public pages and the deobfuscator is mounted on every route that
  // renders them, so a typed address gets the same protection as builder copy.
  const html = obfuscateEmailsInHtml(markdownToHtml(page.body))
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
