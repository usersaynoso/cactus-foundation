import { NextResponse } from 'next/server'
import { readLlmsFull } from '@/lib/agent-content/providers'
import { agentContentAllowed } from '@/lib/agent-content/visibility'
import { resolveSiteUrl } from '@/lib/seo/site-url'

// /llms-full.txt - the same index as /llms.txt with the documents inlined, for
// a reader that would rather make one request than two hundred. Core owns the
// address and nothing else; see lib/agent-content/providers.ts.
export const dynamic = 'force-dynamic'

export async function GET() {
  const siteUrl = resolveSiteUrl()
  if (!siteUrl) return new NextResponse('Not found', { status: 404 })
  if (!await agentContentAllowed()) return new NextResponse('Not found', { status: 404 })

  const body = await readLlmsFull(siteUrl)
  if (body === null) return new NextResponse('Not found', { status: 404 })

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      // Longer than the index: this one is expensive to assemble and changes no
      // more often than the pages it quotes.
      'Cache-Control': 'public, max-age=0, s-maxage=21600, stale-while-revalidate=86400',
    },
  })
}
