import { prisma } from '@/lib/db/prisma'
import { Render } from '@puckeditor/core/rsc'
import { headerPuckRscConfig, footerPuckRscConfig } from '@/lib/puck/config'
import type { Data } from '@puckeditor/core'
import AosInit from '@/lib/puck/components/AosInit'
import { resolveTemplateData } from '@/lib/puck/resolveTemplateData'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { getSessionFromCookie } from '@/lib/auth/session'
import ConsentBanner from '@/components/consent/ConsentBanner'
import type { ConsentBannerConfig } from '@/lib/consent/types'
import { buildTokenStyles, buildFontHref } from '@/lib/design/tokens'
import type { DesignTokens } from '@/lib/design/tokens'
import type { Metadata } from 'next'

async function getSiteConfig() {
  return prisma.siteConfig
    .findUnique({
      where: { id: 'singleton' },
      select: {
        siteName: true,
        adminPath: true,
        logoMediaId: true,
        faviconMediaId: true,
        designTokens: true,
        consentBannerConfig: true,
        privacyPolicyPageId: true,
      },
    })
    .catch(() => null)
}

export async function generateMetadata(): Promise<Metadata> {
  const config = await getSiteConfig()
  if (!config?.faviconMediaId) return {}
  const favicon = await prisma.media
    .findUnique({ where: { id: config.faviconMediaId }, select: { url: true } })
    .catch(() => null)
  if (!favicon?.url) return {}
  return { icons: { icon: favicon.url } }
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const config = await getSiteConfig()

  const [logoMedia, privacyPage] = await Promise.all([
    config?.logoMediaId
      ? prisma.media.findUnique({ where: { id: config.logoMediaId }, select: { url: true } }).catch(() => null)
      : Promise.resolve(null),
    config?.privacyPolicyPageId
      ? prisma.infoPage.findUnique({ where: { id: config.privacyPolicyPageId }, select: { slug: true } }).catch(() => null)
      : Promise.resolve(null),
  ])

  const user = await getSessionFromCookie().catch(() => null)
  const isLoggedIn = !!user

  const ctx = {
    siteName: config?.siteName ?? '',
    logoUrl: logoMedia?.url ?? null,
    isLoggedIn,
    adminPath: config?.adminPath ?? '',
  }

  const [headerLayout, footerLayout] = await Promise.all([
    resolveThemeLayout('header', {}),
    resolveThemeLayout('footer', {}),
  ])

  const headerData = headerLayout?.builderData
    ? await resolveTemplateData(headerLayout.builderData, ctx).catch(() => null)
    : null

  const footerData = footerLayout?.builderData
    ? await resolveTemplateData(footerLayout.builderData, ctx).catch(() => null)
    : null

  const tokens = config?.designTokens as DesignTokens | undefined
  const cssStyles = buildTokenStyles(tokens)
  const fontHref = buildFontHref(tokens)
  const consentBannerConfig = config?.consentBannerConfig as ConsentBannerConfig | null
  const privacyPolicyUrl = privacyPage?.slug ? `/${privacyPage.slug}` : undefined

  return (
    <>
      {fontHref && <link rel="stylesheet" href={fontHref} />}
      {cssStyles && <style dangerouslySetInnerHTML={{ __html: cssStyles }} />}
      <AosInit />
      {headerData

        ? <Render config={headerPuckRscConfig as any} data={headerData as Data} />
        : null
      }
      <main>{children}</main>
      {footerData

        ? <Render config={footerPuckRscConfig as any} data={footerData as Data} />
        : null
      }
      {consentBannerConfig?.enabled && (
        <ConsentBanner config={consentBannerConfig} privacyPolicyUrl={privacyPolicyUrl} />
      )}
    </>
  )
}
