import { prisma } from '@/lib/db/prisma'
import { resolveMainMenu } from '@/lib/menu/resolve'
import { resolveTemplateData } from '@/lib/puck/resolveTemplateData'
import { getSessionFromCookie } from '@/lib/auth/session'
import { Render } from '@puckeditor/core/rsc'
import { puckHeaderTemplateConfig, puckFooterTemplateConfig } from '@/lib/puck/config'
import PricklyLayout from '@/themes/prickly/components/Layout'
import Nav from '@/themes/prickly/components/Nav'
import Footer from '@/themes/prickly/components/Footer'
import '@/themes/prickly/styles/prickly.css'
import type { Data } from '@puckeditor/core'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const config = await prisma.siteConfig
    .findUnique({
      where: { id: 'singleton' },
      select: {
        siteName: true, adminPath: true,
        logoMediaId: true,
        privacyPolicyPageId: true, termsPageId: true,
        headerTemplateId: true, footerTemplateId: true,
      },
    })
    .catch(() => null)

  const [privacyPage, termsPage, logoMedia] = await Promise.all([
    config?.privacyPolicyPageId
      ? prisma.infoPage.findUnique({ where: { id: config.privacyPolicyPageId }, select: { slug: true } }).catch(() => null)
      : null,
    config?.termsPageId
      ? prisma.infoPage.findUnique({ where: { id: config.termsPageId }, select: { slug: true } }).catch(() => null)
      : null,
    config?.logoMediaId
      ? prisma.media.findUnique({ where: { id: config.logoMediaId }, select: { url: true } }).catch(() => null)
      : null,
  ])

  const mainMenu = await resolveMainMenu()

  // Check auth for LoginButton block injection
  const user = await getSessionFromCookie().catch(() => null)
  const isLoggedIn = !!user

  const ctx = {
    siteName: config?.siteName ?? 'Cactus',
    logoUrl: logoMedia?.url ?? null,
    isLoggedIn,
    adminPath: config?.adminPath ?? '',
  }

  // Fetch and resolve header/footer templates (only published ones)
  const [headerTmpl, footerTmpl] = await Promise.all([
    config?.headerTemplateId
      ? prisma.pageTemplate.findFirst({ where: { id: config.headerTemplateId, status: 'published' } }).catch(() => null)
      : null,
    config?.footerTemplateId
      ? prisma.pageTemplate.findFirst({ where: { id: config.footerTemplateId, status: 'published' } }).catch(() => null)
      : null,
  ])

  const [headerData, footerData] = await Promise.all([
    headerTmpl?.builderData
      ? resolveTemplateData(headerTmpl.builderData, ctx).catch(() => null)
      : null,
    footerTmpl?.builderData
      ? resolveTemplateData(footerTmpl.builderData, ctx).catch(() => null)
      : null,
  ])

  const useCustomHeader = !!headerData
  const useCustomFooter = !!footerData

  if (!useCustomHeader && !useCustomFooter) {
    // Pure theme fallback — existing behaviour
    return (
      <PricklyLayout
        siteName={config?.siteName}
        privacyPolicySlug={privacyPage?.slug}
        termsSlug={termsPage?.slug}
        mainMenu={mainMenu}
      >
        {children}
      </PricklyLayout>
    )
  }

  return (
    <div className="prickly-shell">
      {useCustomHeader
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? <Render config={puckHeaderTemplateConfig as any} data={headerData as Data} />
        : <Nav siteName={config?.siteName ?? 'Cactus'} mainMenu={mainMenu} />
      }
      <main className="prickly-main">{children}</main>
      {useCustomFooter
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? <Render config={puckFooterTemplateConfig as any} data={footerData as Data} />
        : <Footer siteName={config?.siteName ?? 'Cactus'} privacyPolicySlug={privacyPage?.slug} termsSlug={termsPage?.slug} />
      }
    </div>
  )
}
