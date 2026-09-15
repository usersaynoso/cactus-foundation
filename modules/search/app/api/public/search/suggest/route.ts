import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { getMemberFromCookie } from '@/lib/members/session'
import { searchDocuments, parseSourcesParam } from '@/modules/search/lib/query'

// Lightweight typeahead: few results, no highlighting, never logged.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const q = (sp.get('q') ?? '').trim().slice(0, 200)
  if (!q) return NextResponse.json({ hits: [], total: 0, sources: [] })

  const [adminUser, member] = await Promise.all([
    getSessionFromCookie().catch(() => null),
    getMemberFromCookie().catch(() => null),
  ])
  const sources = parseSourcesParam(sp.get('sources'))
  const result = await searchDocuments({
    q,
    sources: sources.length ? sources : undefined,
    includeMembersTier: Boolean(adminUser || member),
    limit: 8,
    offset: 0,
    highlight: false,
  })
  return NextResponse.json(result)
}
