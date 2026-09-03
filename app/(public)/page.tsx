import { cache } from 'react'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { isAdmin } from '@/lib/permissions/check'
import { renderInfoPageContent } from '@/lib/puck/renderInfoPage'
import type { Metadata } from 'next'
import { canonicalPath, withPublicSeo } from '@/lib/seo/public-metadata'
import { resolveBranding } from '@/lib/config/branding'

export const dynamic = 'force-dynamic'

// generateMetadata and RootPage both need the singleton config and, when one
// is assigned, the homepage row. cache() keeps each at a single query per
// request, same as the [slug] route does for its page row.
//
// This one deliberately does NOT swallow its errors. A missing row means the
// site has never been set up; a failed query means the database is having a
// moment. Reading the second as the first sends every visitor on the homepage -
// the address every shared link and every crawler starts from - to the first-run
// wizard for as long as the blip lasts. Letting it throw gives an error page
// instead, which is both true and temporary.
const getRootConfig = cache(() =>
  prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: {
      setupCompleted: true,
      siteName: true, tagline: true, description: true, homepageId: true,
    },
  })
)

const getHomepage = cache((id: string) =>
  prisma.infoPage
    .findUnique({
      where: { id },
      select: {
        id: true, title: true, body: true, bodyFormat: true,
        builderData: true, publishedData: true, status: true,
        metaDescription: true, ogImageId: true,
      },
    })
    .catch(() => null)
)

// Without this, the root URL - the address every crawler and shared link
// starts from - served the layout's install defaults while the same content
// on /<slug> carried the page's real title, description and OG image.
export async function generateMetadata(): Promise<Metadata> {
  // The canonical belongs on the homepage whether or not a page is assigned to
  // it: the root URL is the one address every crawler starts from, and it is
  // reachable with any query string anybody cares to append.
  const home = canonicalPath()
  try {
    const [config, branding] = await Promise.all([getRootConfig(), resolveBranding()])
    if (!config?.setupCompleted || !config.homepageId) return withPublicSeo({}, home, branding.name)
    const page = await getHomepage(config.homepageId)
    if (!page || page.status === 'draft') return withPublicSeo({}, home, branding.name)
    const ogImageUrl = page.ogImageId
      ? await prisma.media.findUnique({ where: { id: page.ogImageId }, select: { url: true } }).then((m) => m?.url)
      : undefined
    return withPublicSeo(
      { title: page.title, description: page.metaDescription ?? undefined, openGraph: ogImageUrl ? { images: [{ url: ogImageUrl }] } : undefined },
      home,
      branding.name,
    )
  } catch { return withPublicSeo({}, home) }
}

export default async function RootPage() {
  // No row means not set up. A failed read throws out of here on purpose (see
  // getRootConfig) - and redirect() throws too, so neither may sit in a catch.
  const config = await getRootConfig()

  if (!config?.setupCompleted) {
    redirect('/setup')
  }

  if (config.homepageId) {
    const page = await getHomepage(config.homepageId)

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
