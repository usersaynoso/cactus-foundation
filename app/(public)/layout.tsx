import { prisma } from '@/lib/db/prisma'
import { Render } from '@puckeditor/core/rsc'
import { headerPuckRscConfig, footerPuckRscConfig } from '@/lib/puck/config.rsc'
import type { Data } from '@puckeditor/core'
import AosInit from '@/lib/puck/components/AosInit'
import EmailDeobfuscator from '@/components/EmailDeobfuscator'
import { resolveTemplateData } from '@/lib/puck/resolveTemplateData'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { getSessionFromCookie } from '@/lib/auth/session'
import ConsentBanner from '@/components/consent/ConsentBanner'
import type { ConsentBannerConfig } from '@/lib/consent/types'
import { buildTokenStyles, buildFontHref } from '@/lib/design/tokens'
import type { DesignTokens } from '@/lib/design/tokens'
import { ensureLayoutsCurrent } from '@/lib/setup/starterLayouts'

// Favicon / app-icon metadata is resolved once at the root layout
// (app/layout.tsx + app/manifest.ts) so it applies on every route, not just
// here — see lib/config/branding.ts.
async function getSiteConfig() {
  return prisma.siteConfig
    .findUnique({
      where: { id: 'singleton' },
      select: {
        siteName: true,
        adminPath: true,
        logoMediaId: true,
        logoDarkMediaId: true,
        designTokens: true,
        consentBannerConfig: true,
        privacyPolicyPageId: true,
      },
    })
    .catch(() => null)
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  // Retire the old read-only starter rows after a core update (no-op once
  // stamped; see ensureLayoutsCurrent). It prunes the very table
  // resolveThemeLayout reads, so it has to finish before the layouts below -
  // but it needs nothing from the config or session reads, so the three run
  // together.
  const [, config, user] = await Promise.all([
    ensureLayoutsCurrent(),
    getSiteConfig(),
    getSessionFromCookie().catch(() => null),
  ])

  // The media/privacy lookups need `config`; the layout reads need the prune
  // above. Both hold by here, so all five go out together.
  const [logoMedia, logoDarkMedia, privacyPage, headerLayout, footerLayout] = await Promise.all([
    config?.logoMediaId
      ? prisma.media.findUnique({ where: { id: config.logoMediaId }, select: { url: true } }).catch(() => null)
      : Promise.resolve(null),
    config?.logoDarkMediaId
      ? prisma.media.findUnique({ where: { id: config.logoDarkMediaId }, select: { url: true } }).catch(() => null)
      : Promise.resolve(null),
    config?.privacyPolicyPageId
      ? prisma.infoPage.findUnique({ where: { id: config.privacyPolicyPageId }, select: { slug: true } }).catch(() => null)
      : Promise.resolve(null),
    resolveThemeLayout('header', {}),
    resolveThemeLayout('footer', {}),
  ])

  const isLoggedIn = !!user

  const ctx = {
    siteName: config?.siteName ?? '',
    logoUrl: logoMedia?.url ?? null,
    logoDarkUrl: logoDarkMedia?.url ?? null,
    isLoggedIn,
    adminPath: config?.adminPath ?? '',
  }

  const [headerData, footerData] = await Promise.all([
    headerLayout?.builderData
      ? resolveTemplateData(headerLayout.builderData, ctx).catch(() => null)
      : Promise.resolve(null),
    footerLayout?.builderData
      ? resolveTemplateData(footerLayout.builderData, ctx).catch(() => null)
      : Promise.resolve(null),
  ])

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
      <EmailDeobfuscator />
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
