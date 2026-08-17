import { Render } from '@puckeditor/core/rsc'
import { puckRscConfig } from '@/lib/puck/config.rsc'
import { getPuckRenderMetadata } from '@/lib/puck/renderMetadata'
import { renderLayoutWithContent } from '@/lib/puck/renderLayoutWithContent'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { markdownToHtml } from '@/lib/sanitize'
import { obfuscateEmailsInHtml } from '@/lib/email-obfuscate'
import { getSiteConfig } from '@/lib/config/site'
import ConsentPreferencesPanel from '@/components/consent/ConsentPreferencesPanel'
import type { ConsentBannerConfig } from '@/lib/consent/types'
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

// The cookie switches, shown above the content of whichever page is linked as the
// privacy policy. Nothing to show unless the banner is collecting consent in the
// first place, and the owner can switch the panel off on its own.
async function resolveConsentPanel(pageId: string): Promise<React.ReactNode> {
  // getSiteConfig is cache()d and already read by getPuckRenderMetadata below,
  // so this costs no extra query.
  const config = await getSiteConfig().catch(() => null)
  if (!config || config.privacyPolicyPageId !== pageId) return null

  const consent = config.consentBannerConfig as ConsentBannerConfig | null
  if (!consent?.enabled) return null
  // Absent on configs saved before this setting existed - default it on, so the
  // panel appears without an owner having to go and find the switch.
  if (consent.showPrivacyPagePanel === false) return null

  return <ConsentPreferencesPanel config={consent} />
}

export async function renderInfoPageContent(page: PageShape, options: RenderOptions = {}) {
  const { draftBanner = null, isHomepage = false } = options
  const consentPanel = await resolveConsentPanel(page.id)
  const layout = await resolveThemeLayout('infoPage', { pageId: page.id, slug: page.slug, isHomepage })
  // Site-wide render settings (currently the lazy-load switch) reach blocks only
  // through Puck's metadata - config.tsx can't read them itself. Resolved once
  // here and handed to every Render this page makes; getSiteConfig is cache()d,
  // so the layout's own header/footer renders share the same query.
  const metadata = await getPuckRenderMetadata()

  if (page.bodyFormat === 'builder') {
    const pageData = resolveContentData(page) as Data | null
    if (!pageData) {
      return (
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
          {draftBanner}
          {consentPanel}
          <p style={{ color: 'var(--color-muted)', textAlign: 'center', padding: '4rem 0' }}>This page has no builder content yet.</p>
        </div>
      )
    }

    if (layout?.builderData) {
      // Inside the layout's content slot, not above it - otherwise the panel would
      // land above the site header.
      const pageContent = (
        <>
          {consentPanel}
          <Render config={puckRscConfig as any} data={pageData} metadata={metadata} />
        </>
      )
      return (
        <>
          {draftBanner}
          {renderLayoutWithContent(layout.builderData as Data, pageContent, metadata)}
        </>
      )
    }

    return (
      <>
        {draftBanner}
        {consentPanel}
        <Render config={puckRscConfig as any} data={pageData} metadata={metadata} />
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
      {consentPanel}
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
        {renderLayoutWithContent(layout.builderData as Data, markdownContent, metadata)}
      </>
    )
  }

  return <>{draftBanner}{markdownContent}</>
}
