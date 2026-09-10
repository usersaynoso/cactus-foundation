import { NextResponse } from 'next/server'
import { readLlmsIndex } from '@/lib/agent-content/providers'
import { agentContentAllowed } from '@/lib/agent-content/visibility'
import { resolveSiteUrl } from '@/lib/seo/site-url'

// /llms.txt - the site index written for a language model rather than a browser.
// Core owns the address; the contents come from whichever module registered a
// provider on 'core.agent-content'. See lib/agent-content/providers.ts.
//
// Rendered per request for the same reason robots.ts is: it reads live settings
// and live content, and a copy frozen at build time would describe a catalogue
// that has since changed.
export const dynamic = 'force-dynamic'

export async function GET() {
  const siteUrl = resolveSiteUrl()
  if (!siteUrl) return new NextResponse('Not found', { status: 404 })
  if (!await agentContentAllowed()) return new NextResponse('Not found', { status: 404 })

  const body = await readLlmsIndex(siteUrl)
  if (body === null) return new NextResponse('Not found', { status: 404 })

  return new NextResponse(body, {
    status: 200,
    headers: {
      // text/markdown is what the convention asks for, and what every reader of
      // this file expects. charset spelled out: a product name with a £ in it
      // is otherwise anyone's guess.
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
