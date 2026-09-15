import { prisma } from '@/lib/db/prisma'
import { extractPuckText, makeExcerpt } from '../extract'
import type { SearchDocument } from '../types'
import type { SearchAdapter } from './types'

// Core info pages. Visibility: status = 'published' (draft pages 404 publicly -
// see app/(public)/[slug]/page.tsx). The homepage (SiteConfig.homepageId) is
// indexed once with url '/', mirroring ultimate-seo/lib/inventory.ts.
export const pagesAdapter: SearchAdapter = {
  source: 'page',
  label: 'Pages',

  isAvailable() {
    return true
  },

  async listIds() {
    const rows = await prisma.infoPage.findMany({ where: { status: 'published' }, select: { id: true } })
    return rows.map((r) => r.id)
  },

  async listChangedSince(since) {
    const rows = await prisma.infoPage.findMany({
      where: since ? { updatedAt: { gt: since } } : {},
      select: { id: true },
    })
    return rows.map((r) => r.id)
  },

  async fetchDocuments(ids, opts) {
    const [pages, config] = await Promise.all([
      prisma.infoPage.findMany({ where: { id: { in: ids }, status: 'published' } }),
      prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { homepageId: true } }),
    ])

    const ogImageIds = pages.map((p) => p.ogImageId).filter((id): id is string => Boolean(id))
    const media = ogImageIds.length
      ? await prisma.media.findMany({ where: { id: { in: ogImageIds } }, select: { id: true, url: true } })
      : []
    const mediaUrlById = new Map(media.map((m) => [m.id, m.url]))

    const docs: SearchDocument[] = []
    for (const page of pages) {
      // Published pages render publishedData ?? builderData
      // (lib/puck/renderInfoPage.tsx resolveContentData) - mirror that exactly.
      const body = page.bodyFormat === 'builder'
        ? extractPuckText(page.publishedData ?? page.builderData)
        : page.body
      docs.push({
        source: 'page',
        entityId: page.id,
        title: page.title,
        excerpt: page.metaDescription?.trim() || makeExcerpt(body, opts.excerptLength),
        body,
        url: config?.homepageId === page.id ? '/' : `/${page.slug}`,
        imageUrl: page.ogImageId ? (mediaUrlById.get(page.ogImageId) ?? null) : null,
        extra: null,
        tier: 'public',
        sourceUpdatedAt: page.updatedAt,
      })
    }
    return docs
  },
}
