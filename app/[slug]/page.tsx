import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { markdownToHtml } from '@/lib/sanitize'
import { getSessionFromCookie } from '@/lib/auth/session'
import { isAdmin } from '@/lib/permissions/check'
import type { Metadata } from 'next'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const page = await prisma.infoPage.findUnique({
      where: { slug },
      select: { title: true, metaDescription: true, status: true },
    })
    if (!page || page.status === 'draft') return {}
    return {
      title: page.title,
      description: page.metaDescription ?? undefined,
    }
  } catch {
    return {}
  }
}

// Static generation for published pages. Returns empty on initial build (no DB yet);
// subsequent deploys after setup fill this in so ISR works as intended.
export async function generateStaticParams() {
  try {
    const pages = await prisma.infoPage.findMany({
      where: { status: 'published' },
      select: { slug: true },
    })
    return pages.map((p) => ({ slug: p.slug }))
  } catch {
    return []
  }
}

export const dynamicParams = true
export const revalidate = false // on-demand revalidation only (triggered by publish/edit)

export default async function InfoPageRoute({ params }: Props) {
  const { slug } = await params
  const page = await prisma.infoPage.findUnique({
    where: { slug },
    select: {
      id: true, title: true, body: true, status: true,
      metaDescription: true, ogImageId: true,
      createdBy: { select: { username: true, displayName: true } },
      createdAt: true, updatedAt: true,
    },
  }).catch(() => null)

  if (!page) notFound()

  // Draft pages: only admins can view
  if (page.status === 'draft') {
    const user = await getSessionFromCookie()
    if (!user || !isAdmin(user)) notFound()
  }

  const html = markdownToHtml(page.body)

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
      {page.status === 'draft' && (
        <div className="alert alert-warning" style={{ marginBottom: '1.5rem' }}>
          This page is a draft and is not visible to the public.
        </div>
      )}
      <article>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 800, margin: '0 0 1.5rem', lineHeight: 1.2 }}>
          {page.title}
        </h1>
        <div
          className="prose"
          dangerouslySetInnerHTML={{ __html: html }}
          style={{ lineHeight: 1.75, color: '#374151' }}
        />
      </article>
    </main>
  )
}
