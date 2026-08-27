import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { Render } from '@puckeditor/core/rsc'
import {
  headerPuckRscConfig,
  footerPuckRscConfig,
  layoutPuckRscConfig,
  fullPagePuckRscConfig,
  getModuleLayoutPuckRscConfig,
} from '@/lib/puck/config.rsc'
import { getPuckRenderMetadata } from '@/lib/puck/renderMetadata'
import { moduleLayoutTypeToGroup } from '@/lib/layout/module-layout-types'
import { isCoreModuleStyleLayoutType } from '@/lib/puck/core-layout-roots'
import { getLayoutTypeLabel } from '@/lib/layout/layout-type-labels'
import EmailDeobfuscator from '@/components/EmailDeobfuscator'
import { resolveTemplateData } from '@/lib/puck/resolveTemplateData'
import type { Data } from '@puckeditor/core'
import type { Metadata } from 'next'
import { buildTokenStyles, buildFontHref } from '@/lib/design/tokens'
import type { DesignTokens } from '@/lib/design/tokens'

export const metadata: Metadata = { robots: { index: false, follow: false } }

function getConfig(type: string): any {
  switch (type) {
    case 'header':     return headerPuckRscConfig
    case 'footer':     return footerPuckRscConfig
    case 'infoPage':
    // Same reason as infoPage: the login layout has a Content Slot, and the
    // full-page config has never heard of one - previewed through that, the
    // slot would render nothing and the design would look like it had lost its
    // sign-in form.
    case 'memberLogin': return layoutPuckRscConfig
    case 'notFound':
    case 'statusPage': return fullPagePuckRscConfig
    default:
      // standalone: nothing here is stamping this layout into a surface of its
      // own, so the preview has to draw the container the type declares itself.
      if (moduleLayoutTypeToGroup[type] || isCoreModuleStyleLayoutType(type)) return getModuleLayoutPuckRscConfig(type, { standalone: true })
      return fullPagePuckRscConfig
  }
}

type Props = { params: Promise<{ id: string }> }

export default async function LayoutPreviewPage({ params }: Props) {
  const { id } = await params

  // Whoever is allowed to edit layouts is allowed to look at one. isAdmin() here
  // meant the Preview button 404'd for anyone holding layouts.manage on a role
  // that isn't the protected Admin role - which is every role that grants it.
  const user = await getSessionFromCookie().catch(() => null)
  if (!user || !await hasPermission(user, 'layouts.manage')) notFound()

  const layout = await prisma.layout.findUnique({
    where: { id },
    select: { id: true, name: true, type: true, builderData: true },
  }).catch(() => null)

  if (!layout?.builderData) notFound()

  const siteConfig = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { siteName: true, adminPath: true, logoMediaId: true, logoDarkMediaId: true, designTokens: true },
  })
  const [logoMedia, logoDarkMedia] = await Promise.all([
    siteConfig?.logoMediaId
      ? prisma.media.findUnique({ where: { id: siteConfig.logoMediaId }, select: { url: true } }).catch(() => null)
      : null,
    siteConfig?.logoDarkMediaId
      ? prisma.media.findUnique({ where: { id: siteConfig.logoDarkMediaId }, select: { url: true } }).catch(() => null)
      : null,
  ])
  const ctx = {
    siteName: siteConfig?.siteName ?? '',
    logoUrl: logoMedia?.url ?? null,
    logoDarkUrl: logoDarkMedia?.url ?? null,
    isLoggedIn: false,
    adminPath: siteConfig?.adminPath ?? '',
  }

  const previewTokens = siteConfig?.designTokens as DesignTokens | undefined
  const cssStyles = buildTokenStyles(previewTokens)
  const fontHref = buildFontHref(previewTokens)
  // The preview is meant to look like the published page, lazy-loading included.
  const puckMetadata = await getPuckRenderMetadata()

  let builderData: unknown = layout.builderData
  try { builderData = await resolveTemplateData(layout.builderData, ctx) } catch {}

  const config = getConfig(layout.type)
  const typeLabel = getLayoutTypeLabel(layout.type)

  // An email wrapper has no Puck RSC config at all: its blocks emit inline-styled
  // table HTML rather than React, because that is the only thing an inbox will
  // render. Preview it the way it will actually be sent, in an isolated frame -
  // dropping an entire email document into this page would let its own styles
  // and the admin's fight each other.
  let emailPreviewHtml: string | null = null
  if (layout.type === 'emailWrapper') {
    const { wrapEmailHtml } = await import('@/lib/email/wrapper')
    const { paletteFromTokens } = await import('@/lib/email/palette')
    emailPreviewHtml = wrapEmailHtml({
      bodyHtml:
        '<p>This is where the message goes. Each email brings its own words - a sign-in link, an order confirmation, a welcome note - and they all land here, inside whatever you have built around them.</p><p><a href="#">A link, for illustration</a></p>',
      subject: layout.name,
      vars: {
        siteName: ctx.siteName,
        siteUrl: process.env.SITE_URL ?? '',
        logoUrl: ctx.logoUrl ?? '',
        year: String(new Date().getFullYear()),
      },
      palette: paletteFromTokens(previewTokens),
      layout: { id: layout.id, name: layout.name, builderData, publishedData: null },
    })
  }

  const infoBar = (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: 'var(--color-text)', color: 'var(--color-bg)',
      padding: '0.4rem 1rem', fontSize: '0.8rem',
      display: 'flex', gap: '0.75rem', alignItems: 'center',
    }}>
      <span style={{ fontWeight: 600 }}>{layout.name}</span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span style={{ opacity: 0.7 }}>{typeLabel}</span>
      <span style={{ marginLeft: 'auto', opacity: 0.5 }}>Close this tab to return</span>
    </div>
  )

  const placeholder = (label: string) => (
    <div style={{
      minHeight: '70vh', background: 'var(--color-bg-subtle)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--color-muted)', fontSize: '0.875rem', fontStyle: 'italic',
    }}>
      {label}
    </div>
  )

  return (
    <>
      {fontHref && <link rel="stylesheet" href={fontHref} />}
      {cssStyles && <style dangerouslySetInnerHTML={{ __html: cssStyles }} />}
      {/* Outside app/(public)/layout.tsx, so the preview needs its own copy or a
          protected mailto: link would render dead here (see lib/email-obfuscate). */}
      <EmailDeobfuscator />
      {infoBar}
      <div style={{ paddingTop: '2rem' }}>
        {layout.type === 'header' && (
          <>
            <Render config={config} data={builderData as Data} metadata={puckMetadata} />
            {placeholder('Page content would appear here')}
          </>
        )}
        {layout.type === 'footer' && (
          <>
            {placeholder('Page content would appear here')}
            <Render config={config} data={builderData as Data} metadata={puckMetadata} />
          </>
        )}
        {emailPreviewHtml && (
          <iframe
            title={`${layout.name} preview`}
            srcDoc={emailPreviewHtml}
            sandbox=""
            style={{ width: '100%', height: 'calc(100vh - 4rem)', border: 'none', display: 'block' }}
          />
        )}
        {!emailPreviewHtml && layout.type !== 'header' && layout.type !== 'footer' && (
          <Render config={config} data={builderData as Data} metadata={puckMetadata} />
        )}
      </div>
    </>
  )
}
