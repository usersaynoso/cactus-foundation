import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { isAdmin } from '@/lib/permissions/check'
import { renderInfoPageContent } from '@/lib/puck/renderInfoPage'

export const dynamic = 'force-dynamic'

export default async function RootPage() {
  // One read of the singleton row covers both the setup gate and the welcome
  // screen below. A failed read means "not set up", same as before, and
  // redirect() throws, so it must stay outside the catch.
  const config = await prisma.siteConfig
    .findUnique({
      where: { id: 'singleton' },
      select: {
        setupCompleted: true,
        siteName: true, tagline: true, description: true, homepageId: true,
      },
    })
    .catch(() => null)

  if (!config?.setupCompleted) {
    redirect('/setup')
  }

  if (config.homepageId) {
    const page = await prisma.infoPage.findUnique({
      where: { id: config.homepageId },
      select: {
        id: true, title: true, body: true, bodyFormat: true,
        builderData: true, publishedData: true, status: true,
      },
    }).catch(() => null)

    if (page) {
      const isDraft = page.status === 'draft'

      if (isDraft) {
        const user = await getSessionFromCookie()
        if (!user || !isAdmin(user)) {
          // Fall through to welcome screen for non-admins
        } else {
          const draftBanner = (
            <div style={{ margin: 0, borderRadius: 0, padding: '0.75rem 1.5rem', textAlign: 'center', background: 'var(--color-warning-bg)', color: 'var(--color-warning)', fontSize: '0.875rem', fontWeight: 500 }}>
              Draft — not visible to the public
            </div>
          )
          return renderInfoPageContent({ ...page, slug: 'home' }, { draftBanner, isHomepage: true })
        }
      } else {
        return renderInfoPageContent({ ...page, slug: 'home' }, { isHomepage: true })
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
