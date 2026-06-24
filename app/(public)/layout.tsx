import { prisma } from '@/lib/db/prisma'
import { resolveMainMenu } from '@/lib/menu/resolve'
import PricklyLayout from '@/themes/prickly/components/Layout'
import '@/themes/prickly/styles/prickly.css'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const config = await prisma.siteConfig
    .findUnique({
      where: { id: 'singleton' },
      select: { siteName: true, privacyPolicyPageId: true, termsPageId: true },
    })
    .catch(() => null)

  const [privacyPage, termsPage] = await Promise.all([
    config?.privacyPolicyPageId
      ? prisma.infoPage.findUnique({ where: { id: config.privacyPolicyPageId }, select: { slug: true } }).catch(() => null)
      : null,
    config?.termsPageId
      ? prisma.infoPage.findUnique({ where: { id: config.termsPageId }, select: { slug: true } }).catch(() => null)
      : null,
  ])

  const mainMenu = await resolveMainMenu()

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
