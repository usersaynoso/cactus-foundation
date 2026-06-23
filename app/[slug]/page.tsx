import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { markdownToHtml } from '@/lib/sanitize'
import { getSessionFromCookie } from '@/lib/auth/session'
import { isAdmin } from '@/lib/permissions/check'
import { Render } from '@puckeditor/core/rsc'
import puckConfig from '@/lib/puck/config'
import type { Data } from '@puckeditor/core'
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

    return {
      title: page.title,
      description: page.metaDescription ?? undefined,
      openGraph: ogImageUrl ? { images: [{ url: ogImageUrl }] } : undefined,
    }
  } catch {
    return {}
  }
}

// Static generation for published pages.
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
      id: true, title: true, body: true, bodyFormat: true, builderData: true,
      status: true, metaDescription: true, ogImageId: true,
      createdBy: { select: { username: true, displayName: true } },
      createdAt: true, updatedAt: true,
    },
  }).catch(() => null)

  if (!page) notFound()

  // Draft gate — one check, upstream of the format branch. Both formats respect it.
  if (page.status === 'draft') {
    const user = await getSessionFromCookie()
    if (!user || !isAdmin(user)) notFound()
  }

  const isDraft = page.status === 'draft'

  if (page.bodyFormat === 'builder') {
    // Builder format — use Puck's RSC Render. No markdown pipeline, no sanitization needed:
    // builderData only ever contains props from the registered component schema.
    const data = page.builderData as Data | null
    if (!data) {
      // Page switched to builder but has no content yet
      return (
        <main style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
          {isDraft && (
            <div className="alert alert-warning" style={{ marginBottom: '1.5rem' }}>
              This page is a draft and is not visible to the public.
            </div>
          )}
          <p style={{ color: '#9ca3af', textAlign: 'center', padding: '4rem 0' }}>
            This page has no builder content yet.
          </p>
        </main>
      )
    }
    return (
      <>
        {isDraft && (
          <div
            className="alert alert-warning"
            style={{ margin: 0, borderRadius: 0, padding: '0.75rem 1.5rem', textAlign: 'center' }}
          >
            This page is a draft and is not visible to the public.
          </div>
        )}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Render config={puckConfig} data={data as any} />
      </>
    )
  }

  // Markdown format — existing sanitized-markdown pipeline unchanged.
  const html = markdownToHtml(page.body)

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
      {isDraft && (
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
