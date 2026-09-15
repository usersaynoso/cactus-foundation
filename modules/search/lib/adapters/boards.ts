import { prisma } from '@/lib/db/prisma'
import { extractPuckText, makeExcerpt } from '../extract'
import type { SearchDocument } from '../types'
import type { SearchAdapter } from './types'

// Boards threads. Visibility is per-board (source of truth:
// modules/boards/lib/visibility.ts): PUBLIC boards index as tier 'public',
// MEMBERS boards as tier 'members' (any session may see them - the query path
// widens the tier on session presence), PRIVATE boards are never indexed at
// all. Sub-boards inherit the parent board's visibility, so the board join
// suffices. Replies (brd_posts) are deliberately not indexed in v1.
export const boardsThreadAdapter: SearchAdapter = {
  source: 'boards-thread',
  label: 'Forum',

  isAvailable(installed) {
    return installed.has('boards')
  },

  async listIds() {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT t."id" FROM "brd_threads" t
      JOIN "brd_boards" b ON b."id" = t."board_id"
      WHERE t."status" = 'PUBLISHED' AND b."visibility" IN ('PUBLIC', 'MEMBERS')
    `
    return rows.map((r) => r.id)
  },

  async listChangedSince(since) {
    if (!since) return boardsThreadAdapter.listIds()
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT t."id" FROM "brd_threads" t WHERE t."updated_at" > ${since}
    `
    return rows.map((r) => r.id)
  },

  async fetchDocuments(ids, opts) {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT t."id", t."title", t."slug", t."opener_data", t."author_name",
             t."created_at", t."last_post_at", t."updated_at",
             b."title" AS board_title, b."visibility" AS board_visibility
      FROM "brd_threads" t
      JOIN "brd_boards" b ON b."id" = t."board_id"
      WHERE t."id" = ANY(${ids})
        AND t."status" = 'PUBLISHED' AND b."visibility" IN ('PUBLIC', 'MEMBERS')
    `
    return rows.map((r): SearchDocument => {
      const bodyText = extractPuckText(r.opener_data)
      return {
        source: 'boards-thread',
        entityId: r.id as string,
        title: r.title as string,
        excerpt: makeExcerpt(bodyText, opts.excerptLength),
        body: bodyText,
        url: `/boards/t/${r.slug as string}`,
        imageUrl: null,
        extra: {
          board: r.board_title as string,
          ...(r.author_name ? { author: r.author_name as string } : {}),
        },
        tier: (r.board_visibility as string) === 'MEMBERS' ? 'members' : 'public',
        sourceUpdatedAt: (r.last_post_at as Date | null) ?? (r.created_at as Date | null),
      }
    })
  },
}
