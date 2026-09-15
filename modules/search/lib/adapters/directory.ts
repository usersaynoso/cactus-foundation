import { prisma } from '@/lib/db/prisma'
import { extractPuckText, makeExcerpt } from '../extract'
import type { SearchDocument } from '../types'
import type { SearchAdapter } from './types'

// Directory entries. Visibility: status = 'published' (source of truth:
// modules/directory/lib/sitemap.ts). The public URL needs the category join -
// /directory/<category-slug>/<entry-slug>. `description` is Puck JSONB;
// `tags` is a JSONB string array; `images` is a JSONB array of Media ids.
export const directoryEntryAdapter: SearchAdapter = {
  source: 'directory-entry',
  label: 'Directory',

  isAvailable(installed) {
    return installed.has('directory')
  },

  async listIds() {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "dir_entries" WHERE "status" = 'published'
    `
    return rows.map((r) => r.id)
  },

  async listChangedSince(since) {
    if (!since) return directoryEntryAdapter.listIds()
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "dir_entries" WHERE "updated_at" > ${since}
    `
    return rows.map((r) => r.id)
  },

  async fetchDocuments(ids, opts) {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT e."id", e."name", e."slug", e."short_description", e."description",
             e."address", e."area", e."sub_area", e."tags", e."images", e."updated_at",
             c."name" AS category_name, c."slug" AS category_slug
      FROM "dir_entries" e
      JOIN "dir_categories" c ON c."id" = e."category_id"
      WHERE e."id" = ANY(${ids}) AND e."status" = 'published'
    `
    // First image id per entry -> Media.url, resolved in one query.
    const firstImageIds = rows
      .map((r) => (Array.isArray(r.images) ? (r.images as unknown[])[0] : null))
      .filter((id): id is string => typeof id === 'string')
    const media = firstImageIds.length
      ? await prisma.media.findMany({ where: { id: { in: firstImageIds } }, select: { id: true, url: true } })
      : []
    const mediaUrlById = new Map(media.map((m) => [m.id, m.url]))

    return rows.map((r): SearchDocument => {
      const descriptionText = extractPuckText(r.description)
      const tags = Array.isArray(r.tags) ? (r.tags as unknown[]).filter((t): t is string => typeof t === 'string') : []
      const body = [
        (r.short_description as string | null) ?? '',
        descriptionText,
        (r.address as string | null) ?? '',
        (r.area as string | null) ?? '',
        (r.sub_area as string | null) ?? '',
        tags.join(' '),
      ].filter(Boolean).join(' ')
      const firstImageId = Array.isArray(r.images) ? (r.images as unknown[])[0] : null
      return {
        source: 'directory-entry',
        entityId: r.id as string,
        title: r.name as string,
        excerpt: makeExcerpt((r.short_description as string | null) || descriptionText, opts.excerptLength),
        body,
        url: `/directory/${r.category_slug as string}/${r.slug as string}`,
        imageUrl: typeof firstImageId === 'string' ? (mediaUrlById.get(firstImageId) ?? null) : null,
        extra: { category: r.category_name as string },
        tier: 'public',
        sourceUpdatedAt: (r.updated_at as Date | null) ?? null,
      }
    })
  },
}
