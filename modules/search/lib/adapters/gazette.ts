import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { extractPuckText, makeExcerpt } from '../extract'
import type { SearchDocument } from '../types'
import type { SearchAdapter } from './types'

// A post is public when (PUBLISHED with published_at in the past) OR (SCHEDULED
// with scheduled_for in the past), and not private. Source of truth:
// modules/gazette/lib/visibility.ts publicVisibleSql() - re-implemented here
// (not imported: gazette may not be installed). Scheduled posts go live lazily
// with no cron, which is exactly why every index run re-evaluates this
// predicate rather than trusting a status snapshot.
function publicVisible() {
  return Prisma.sql`
    (
      (p."status" = 'PUBLISHED' AND p."published_at" <= NOW())
      OR (p."status" = 'SCHEDULED' AND p."scheduled_for" <= NOW())
    )
    AND p."is_private" = false
  `
}

export const gazettePostAdapter: SearchAdapter = {
  source: 'gazette-post',
  label: 'Articles',

  isAvailable(installed) {
    return installed.has('gazette')
  },

  async listIds() {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT p."id" FROM "gz_posts" p WHERE ${publicVisible()}
    `
    return rows.map((r) => r.id)
  },

  async listChangedSince(since) {
    if (!since) return gazettePostAdapter.listIds()
    // updated_at catches edits; the scheduled_for window catches posts whose
    // only "change" is that their go-live time has now passed.
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT p."id" FROM "gz_posts" p
      WHERE p."updated_at" > ${since}
         OR (p."status" = 'SCHEDULED' AND p."scheduled_for" > ${since} AND p."scheduled_for" <= NOW())
    `
    return rows.map((r) => r.id)
  },

  async fetchDocuments(ids, opts) {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT p."id", p."title", p."slug", p."excerpt", p."builder_data", p."updated_at",
             p."imported_author_name",
             COALESCE(p."published_at", p."scheduled_for") AS effective_published,
             COALESCE(u."displayName", u."username") AS author_name,
             m."url" AS image_url,
             (SELECT string_agg(t."name", ' ') FROM "gz_post_tags" pt
                JOIN "gz_tags" t ON t."id" = pt."tag_id"
                WHERE pt."post_id" = p."id") AS tag_names
      FROM "gz_posts" p
      LEFT JOIN "User" u ON u."id" = p."author_id"
      LEFT JOIN "Media" m ON m."id" = p."featured_image_id"
      WHERE p."id" = ANY(${ids}) AND ${publicVisible()}
    `
    return rows.map((r): SearchDocument => {
      const bodyText = extractPuckText(r.builder_data)
      const excerpt = (r.excerpt as string | null)?.trim() || makeExcerpt(bodyText, opts.excerptLength)
      const author = (r.author_name as string | null) ?? (r.imported_author_name as string | null)
      return {
        source: 'gazette-post',
        entityId: r.id as string,
        title: r.title as string,
        excerpt,
        body: [bodyText, (r.tag_names as string | null) ?? ''].filter(Boolean).join(' '),
        url: `/gazette/${r.slug as string}`,
        imageUrl: (r.image_url as string | null) ?? null,
        extra: author ? { author } : null,
        tier: 'public',
        sourceUpdatedAt: (r.effective_published as Date | null) ?? (r.updated_at as Date | null),
      }
    })
  },
}
