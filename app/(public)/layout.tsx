import { prisma } from '@/lib/db/prisma'
import { getSiteConfig as getSharedSiteConfig } from '@/lib/config/site'
import { Render } from '@puckeditor/core/rsc'
import { headerPuckRscConfig, footerPuckRscConfig } from '@/lib/puck/config.rsc'
import { getPuckRenderMetadata } from '@/lib/puck/renderMetadata'
import type { Data } from '@puckeditor/core'
import AosInit from '@/lib/puck/components/AosInit'
import EmailDeobfuscator from '@/components/EmailDeobfuscator'
import { resolveTemplateData } from '@/lib/puck/resolveTemplateData'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { getSessionFromCookie } from '@/lib/auth/session'
import { getMemberFromCookie } from '@/lib/members/session'
import ConsentBanner from '@/components/consent/ConsentBanner'
import type { ConsentBannerConfig } from '@/lib/consent/types'
import { buildTokenStyles, buildFontHref } from '@/lib/design/tokens'
import type { DesignTokens } from '@/lib/design/tokens'
import { ensureLayoutsCurrent } from '@/lib/setup/starterLayouts'
import { collectModulePublicHead } from '@/lib/modules/router.public'
import { resolveSiteUrl } from '@/lib/seo/site-url'
import { jsonLdScript } from '@/lib/seo/json-ld'

// Favicon / app-icon metadata is resolved once at the root layout
// (app/layout.tsx + app/manifest.ts) so it applies on every route, not just
// here — see lib/config/branding.ts.
//
// The config row itself comes from the shared cache()d reader rather than a
// narrow select of this layout's own. SiteConfig is a single ~5kB row that four
// things on the render path all wanted - the root layout's branding, this
// layout, the menu resolver and getPuckRenderMetadata - and because each asked
// for a different set of columns, React's cache() had four different queries to
// memoise rather than one. Same shape everywhere means one round trip.
function getSiteConfig() {
  return getSharedSiteConfig().catch(() => null)
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  // Retire the old read-only starter rows after a core update (no-op once
  // stamped; see ensureLayoutsCurrent). It prunes the very table
  // resolveThemeLayout reads, so it has to finish before the layouts below -
  // but it needs nothing from the config or session reads, so the three run
  // together.
  //
  // The module head contributions ride along in the same batch: the structured
  // data describing the business behind the site, and any meta tag that belongs
  // on every page rather than on one. They need nothing any of the others
  // return, so awaiting them separately would have added a serial round trip to
  // every public page render for a tag nobody can see. Best-effort by design -
  // a module having a bad day must not cost the visitor the page.
  const siteUrl = resolveSiteUrl()
  const [, config, user, member, modulePublicHead] = await Promise.all([
    ensureLayoutsCurrent(),
    getSiteConfig(),
    getSessionFromCookie().catch(() => null),
    // Cheap for the common anonymous case - no member cookie means this returns
    // null after a single cookie read, no database round trip. Only a present
    // member cookie costs a session lookup. Needed so menu items restricted to
    // signed-in / signed-out audiences resolve correctly for members too.
    getMemberFromCookie().catch(() => null),
    siteUrl ? collectModulePublicHead(siteUrl).catch(() => null) : Promise.resolve(null),
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
    // Admin session and member session both count as "signed in"; only the admin
    // session counts as staff. Drives per-item menu visibility in resolveMenu.
    viewer: { isAuthenticated: !!user || !!member, isAdmin: !!user },
  }

  const [headerData, footerData] = await Promise.all([
    headerLayout?.builderData
      ? resolveTemplateData(headerLayout.builderData, ctx).catch(() => null)
      : Promise.resolve(null),
    footerLayout?.builderData
      ? resolveTemplateData(footerLayout.builderData, ctx).catch(() => null)
      : Promise.resolve(null),
  ])

  // Read through the shared cache()d helper rather than the narrow select above,
  // so the default for a missing config row is decided in exactly one place and
  // the page's own render (renderInfoPage) reuses the same query.
  const puckMetadata = await getPuckRenderMetadata()

  const tokens = config?.designTokens as DesignTokens | undefined
  const cssStyles = buildTokenStyles(tokens)
  const fontHref = buildFontHref(tokens)
  const consentBannerConfig = config?.consentBannerConfig as ConsentBannerConfig | null
  const privacyPolicyUrl = privacyPage?.slug ? `/${privacyPage.slug}` : undefined

  return (
    <>
      {modulePublicHead?.meta.map((tag, i) => (
        <meta key={`module-meta-${tag.name ?? tag.property ?? i}`} {...(tag.name ? { name: tag.name } : {})} {...(tag.property ? { property: tag.property } : {})} content={tag.content} />
      ))}
      {/* JSON-LD is read just as happily from the body as from the head, which
          is what lets a layout contribute it at all - same as the SEO module's
          own page-builder block. */}
      {modulePublicHead?.jsonLd.map((data, i) => (
        <script key={`module-jsonld-${i}`} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />
      ))}
      {fontHref && <link rel="stylesheet" href={fontHref} />}
      {cssStyles && <style dangerouslySetInnerHTML={{ __html: cssStyles }} />}
      <AosInit />
      <EmailDeobfuscator />
      {headerData

        ? <Render config={headerPuckRscConfig as any} data={headerData as Data} metadata={puckMetadata} />
        : null
      }
      <main>{children}</main>
      {footerData

        ? <Render config={footerPuckRscConfig as any} data={footerData as Data} metadata={puckMetadata} />
        : null
      }
      {consentBannerConfig?.enabled && (
        <ConsentBanner config={consentBannerConfig} privacyPolicyUrl={privacyPolicyUrl} />
      )}
    </>
  )
}
