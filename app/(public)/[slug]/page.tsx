import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { isAdmin } from '@/lib/permissions/check'
import { renderInfoPageContent } from '@/lib/puck/renderInfoPage'
import type { Metadata } from 'next'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const page = await prisma.infoPage.findUnique({
      where: { slug },
      select: { title: true, metaDescription: true, status: true, ogImageId: true },
    })
    if (!page || page.status === 'draft') return {}
    const ogImageUrl = page.ogImageId
      ? await prisma.media.findUnique({ where: { id: page.ogImageId }, select: { url: true } }).then((m) => m?.url)
      : undefined
    return { title: page.title, description: page.metaDescription ?? undefined, openGraph: ogImageUrl ? { images: [{ url: ogImageUrl }] } : undefined }
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

export default async function InfoPageRoute({ params }: Props) {
  const { slug } = await params
  const page = await prisma.infoPage.findUnique({
    where: { slug },
    select: {
      id: true, title: true, body: true, bodyFormat: true,
      builderData: true, publishedData: true, status: true,
    },
  }).catch(() => null)

  if (!page) notFound()

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
