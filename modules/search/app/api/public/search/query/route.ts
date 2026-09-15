import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionFromCookie } from '@/lib/auth/session'
import { getMemberFromCookie } from '@/lib/members/session'
import { searchDocuments, parseSourcesParam } from '@/modules/search/lib/query'
import { logQuery } from '@/modules/search/lib/indexer'
import { getSearchSettings } from '@/modules/search/lib/settings'

const paramsSchema = z.object({
  q: z.string().trim().min(1).max(200),
  sources: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
  sort: z.enum(['relevance', 'newest']).default('relevance'),
  highlight: z.enum(['yes', 'no']).default('yes'),
  snippet: z.enum(['short', 'medium', 'long']).default('medium'),
})

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const parsed = paramsSchema.safeParse({
    q: sp.get('q') ?? '',
    sources: sp.get('sources') ?? undefined,
    limit: sp.get('limit') ?? undefined,
    offset: sp.get('offset') ?? undefined,
    sort: sp.get('sort') ?? undefined,
    highlight: sp.get('highlight') ?? undefined,
    snippet: sp.get('snippet') ?? undefined,
  })
  if (!parsed.success) return NextResponse.json({ hits: [], total: 0, sources: [] })
  const params = parsed.data

  // Any session (admin or member) widens results to members-only content.
  const [adminUser, member] = await Promise.all([
    getSessionFromCookie().catch(() => null),
    getMemberFromCookie().catch(() => null),
  ])

  const sources = parseSourcesParam(params.sources)
  const result = await searchDocuments({
    q: params.q,
    sources: sources.length ? sources : undefined,
    includeMembersTier: Boolean(adminUser || member),
    limit: params.limit,
    offset: params.offset,
    sort: params.sort,
    highlight: params.highlight === 'yes',
    snippetLength: params.snippet,
  })

  // Relaxed hits are near misses, not matches: nothing matched the words as
  // typed. The owner's most useful report is "searches that found nothing", so
  // it counts as nothing here even though the visitor is shown the near misses.
  const strictTotal = result.relaxed ? 0 : result.total

  // An empty first page might mean "nothing matches" or "nothing indexed yet" -
  // let the alert sync decide (it only bells on a genuinely empty index).
  if (params.offset === 0 && strictTotal === 0) {
    const { syncIndexAlert } = await import('@/modules/search/lib/alerts')
    await syncIndexAlert()
  }

  // Log once per query (first page only), when logging is on. Query text and
  // counts only - never who searched.
  if (params.offset === 0) {
    try {
      const settings = await getSearchSettings()
      if (settings.queryLogging) {
        await logQuery(params.q, strictTotal, sources.length ? sources.join(',') : null)
      }
    } catch {
      // Logging must never break search.
    }
  }

  return NextResponse.json(result)
}
