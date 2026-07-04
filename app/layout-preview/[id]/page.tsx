import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { isAdmin } from '@/lib/permissions/check'
import { Render } from '@puckeditor/core/rsc'
import {
  headerPuckRscConfig,
  footerPuckRscConfig,
  layoutPuckRscConfig,
  fullPagePuckRscConfig,
  getModuleLayoutPuckRscConfig,
} from '@/lib/puck/config.rsc'
import { moduleLayoutTypeToGroup } from '@/lib/layout/module-layout-types'
import { resolveTemplateData } from '@/lib/puck/resolveTemplateData'
import type { Data } from '@puckeditor/core'
import type { Metadata } from 'next'
import { buildTokenStyles, buildFontHref } from '@/lib/design/tokens'
import type { DesignTokens } from '@/lib/design/tokens'

export const metadata: Metadata = { robots: { index: false, follow: false } }

const TYPE_LABELS: Record<string, string> = {
  header: 'Header',
  footer: 'Footer',
  infoPage: 'Page Layout',
  notFound: '404 Page',
  statusPage: 'Status Page',
}


function getConfig(type: string): any {
  switch (type) {
    case 'header':     return headerPuckRscConfig
    case 'footer':     return footerPuckRscConfig
    case 'infoPage':   return layoutPuckRscConfig
    case 'notFound':
    case 'statusPage': return fullPagePuckRscConfig
    default:
      if (moduleLayoutTypeToGroup[type]) return getModuleLayoutPuckRscConfig(type)
      return fullPagePuckRscConfig
  }
}

type Props = { params: Promise<{ id: string }> }

export default async function LayoutPreviewPage({ params }: Props) {
  const { id } = await params

  const user = await getSessionFromCookie().catch(() => null)
  if (!user || !isAdmin(user)) notFound()

  const layout = await prisma.layout.findUnique({
    where: { id },
    select: { id: true, name: true, type: true, builderData: true },
  }).catch(() => null)

  if (!layout?.builderData) notFound()

  const siteConfig = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { siteName: true, adminPath: true, logoMediaId: true, designTokens: true },
  })
  const logoMedia = siteConfig?.logoMediaId
    ? await prisma.media.findUnique({ where: { id: siteConfig.logoMediaId }, select: { url: true } }).catch(() => null)
    : null
  const ctx = {
    siteName: siteConfig?.siteName ?? '',
    logoUrl: logoMedia?.url ?? null,
    isLoggedIn: false,
    adminPath: siteConfig?.adminPath ?? '',
  }

  const previewTokens = siteConfig?.designTokens as DesignTokens | undefined
  const cssStyles = buildTokenStyles(previewTokens)
  const fontHref = buildFontHref(previewTokens)

  let builderData: unknown = layout.builderData
  try { builderData = await resolveTemplateData(layout.builderData, ctx) } catch {}

  const config = getConfig(layout.type)
  const typeLabel = TYPE_LABELS[layout.type] ?? moduleLayoutTypeToGroup[layout.type]?.label ?? layout.type

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
      {infoBar}
      <div style={{ paddingTop: '2rem' }}>
        {layout.type === 'header' && (
          <>
            <Render config={config} data={builderData as Data} />
            {placeholder('Page content would appear here')}
          </>
        )}
        {layout.type === 'footer' && (
          <>
            {placeholder('Page content would appear here')}
            <Render config={config} data={builderData as Data} />
          </>
        )}
        {layout.type !== 'header' && layout.type !== 'footer' && (
          <Render config={config} data={builderData as Data} />
        )}
      </div>
    </>
  )
}
