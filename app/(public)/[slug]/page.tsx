import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { isAdmin } from '@/lib/permissions/check'
import { renderInfoPageContent } from '@/lib/puck/renderInfoPage'
import { resolveModulePublicPage } from '@/lib/modules/router'
import type { Metadata } from 'next'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const page = await prisma.infoPage.findUnique({
      where: { slug },
      select: { title: true, metaDescription: true, status: true, ogImageId: true },
    })
    if (page) {
      if (page.status === 'draft') return {}
      const ogImageUrl = page.ogImageId
        ? await prisma.media.findUnique({ where: { id: page.ogImageId }, select: { url: true } }).then((m) => m?.url)
        : undefined
      return { title: page.title, description: page.metaDescription ?? undefined, openGraph: ogImageUrl ? { images: [{ url: ogImageUrl }] } : undefined }
    }

    // No InfoPage at this slug - fall through to a module's public index, if any.
    const resolved = await resolveModulePublicPage(slug, [])
    if (resolved?.generateMetadata) {
      return resolved.generateMetadata({ params: Promise.resolve(resolved.mappedParams) })
    }
    return {}
  } catch { return {} }
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
  const page = await prisma.infoPage.findUnique({
    where: { slug },
    select: {
      id: true, title: true, body: true, bodyFormat: true,
      builderData: true, publishedData: true, status: true,
    },
  }).catch(() => null)

  if (!page) {
    // No InfoPage at this slug - fall through to a module's public index, if any.
    // InfoPage always wins on a collision (checked above); this only runs on a miss.
    const resolved = await resolveModulePublicPage(slug, [])
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
