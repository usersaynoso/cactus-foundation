import { NextResponse } from 'next/server'
import { readAgentMarkdown } from '@/lib/agent-content/providers'
import { agentContentAllowed } from '@/lib/agent-content/visibility'
import { resolveSiteUrl } from '@/lib/seo/site-url'

// The Markdown twin of a public page, reached at the page's own address with
// .md on the end - /about.md, /shop/products/task-chair.md. next.config.ts
// rewrites those here (afterFiles, so a real file in /public still wins).
//
// The convention is worth following exactly rather than inventing a tidier one:
// an agent handed /shop/products/task-chair will try appending .md before it
// tries anything else, and a site that answers somewhere else is a site it
// gives up on.
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const siteUrl = resolveSiteUrl()
  if (!siteUrl) return new NextResponse('Not found', { status: 404 })
  if (!await agentContentAllowed()) return new NextResponse('Not found', { status: 404 })

  const { path } = await params
  // The rewrite captures the whole path INCLUDING the suffix, so that a page
  // whose slug genuinely ends in ".md" is still reachable by its own name.
  const joined = path.join('/')
  if (!joined.endsWith('.md')) return new NextResponse('Not found', { status: 404 })
  const pagePath = joined.slice(0, -3)

  const doc = await readAgentMarkdown(pagePath, siteUrl)
  // Not found is the ordinary answer, not a fault: something appended .md to an
  // address that has no page behind it.
  if (!doc) return new NextResponse('Not found', { status: 404 })

  return new NextResponse(doc.markdown, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...(doc.lastModified ? { 'Last-Modified': doc.lastModified.toUTCString() } : {}),
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
