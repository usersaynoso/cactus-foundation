import { cache } from 'react'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { isAdmin } from '@/lib/permissions/check'
import { renderInfoPageContent } from '@/lib/puck/renderInfoPage'
import { resolveModulePublicPage, resolveModuleRootSlugPage } from '@/lib/modules/router.public'
import type { Metadata } from 'next'
import { canonicalPath, withPublicSeo } from '@/lib/seo/public-metadata'
import { resolveBranding } from '@/lib/config/branding'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

// generateMetadata and the render below both need this row. Selecting the union of
// the two field sets once, behind React cache(), makes it a single query per request
// instead of the same row being fetched twice. Deliberately does not swallow errors:
// each caller keeps its own failure handling (metadata falls back to {}, the render
// falls through to the module router), exactly as when they queried separately.
const getPageBySlug = cache((slug: string) =>
  prisma.infoPage.findUnique({
    where: { slug },
    select: {
      id: true, title: true, body: true, bodyFormat: true,
      builderData: true, publishedData: true, status: true,
      metaDescription: true, ogImageId: true,
    },
  })
)

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  // The address this render is answering, whatever ends up serving it - a core
  // page, a module index or a module's claim on the bare slug. A draft returns
  // it too: a draft page is only visible to a signed-in admin, and the tag
  // costs nothing there while saving a branch that is easy to get wrong.
  const path = canonicalPath(slug)
  try {
    const branding = await resolveBranding().catch(() => null)
    const siteName = branding?.name

    const page = await getPageBySlug(slug)
    if (page) {
      if (page.status === 'draft') return withPublicSeo({}, path, siteName)
      const ogImageUrl = page.ogImageId
        ? await prisma.media.findUnique({ where: { id: page.ogImageId }, select: { url: true } }).then((m) => m?.url)
        : undefined
      return withPublicSeo(
        { title: page.title, description: page.metaDescription ?? undefined, openGraph: ogImageUrl ? { images: [{ url: ogImageUrl }] } : undefined },
        path,
        siteName,
      )
    }

    // No InfoPage at this slug - fall through to a module's public index, if any.
    // searchParams must travel too (the search module titles the page from ?q=),
    // and the call must be awaited INSIDE the try: returning the bare promise let
    // a rejection escape the catch and kill the whole page render.
    const resolved = (await resolveModulePublicPage(slug, [])) ?? (await resolveModuleRootSlugPage(slug))
    if (resolved?.generateMetadata) {
      // withPublicSeo only fills blanks, so a module that publishes a canonical
      // of its own - a paginated listing pointing back at page one, say - keeps it.
      const moduleMeta = await resolved.generateMetadata({ params: Promise.resolve(resolved.mappedParams), searchParams })
      return withPublicSeo(moduleMeta ?? {}, path, siteName)
    }
    return withPublicSeo({}, path, siteName)
  } catch { return withPublicSeo({}, path) }
}

export async function generateStaticParams() {
  try {
    const pages = await prisma.infoPage.findMany({ where: { status: 'published' }, select: { slug: true } })
    return pages.map((p) => ({ slug: p.slug }))
  } catch { return [] }
}

export const dynamicParams = true
export const revalidate = false

export default async function InfoPageRoute({ params, searchParams }: Props) {
  const { slug } = await params
  const page = await getPageBySlug(slug).catch(() => null)

  if (!page) {
    // No InfoPage at this slug - fall through to a module's public index, then to
    // a module claiming the bare slug for content of its own (a gazette post at
    // /my-post). InfoPage always wins on a collision (checked above); this only
    // runs on a miss, and a module index beats a claim for the same reason.
    const resolved = (await resolveModulePublicPage(slug, [])) ?? (await resolveModuleRootSlugPage(slug))
    if (!resolved) notFound()

    // Calling a dynamic API before rendering forces this request to render dynamically
    // rather than being cached forever under revalidate = false — without this, the
    // module's index page would go stale (e.g. scheduled posts never appearing).
    await getSessionFromCookie()

    const { Component, mappedParams } = resolved
    return <Component params={Promise.resolve(mappedParams)} searchParams={searchParams} />
  }

  if (page.status === 'draft') {
    const user = await getSessionFromCookie()
    if (!user || !isAdmin(user)) notFound()
  }

  const isDraft = page.status === 'draft'

  const draftBanner = isDraft ? (
    <div style={{ margin: 0, borderRadius: 0, padding: '0.75rem 1.5rem', textAlign: 'center', background: 'var(--color-warning-bg)', color: 'var(--color-warning)', fontSize: '0.875rem', fontWeight: 500 }}>
      Draft — not visible to the public
    </div>
  ) : null

  return renderInfoPageContent({ ...page, slug }, { draftBanner })
}
