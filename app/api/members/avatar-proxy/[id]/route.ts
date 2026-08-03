import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { prisma } from '@/lib/db/prisma'
import { getMembersConfigCached } from '@/lib/members/config'

// Server-side Gravatar proxy: the email never reaches the client, only this
// memberId-keyed URL does, and the response is streamed through our own
// origin rather than redirecting to gravatar.com - so no CSP img-src change
// is needed and no email hash ever appears in a client-visible URL.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [member, config] = await Promise.all([
    prisma.member.findUnique({
      where: { id },
      select: { email: true, avatarChoice: true, status: true },
    }),
    getMembersConfigCached(),
  ])

  // gravatarEnabled re-checked here (not just by callers deciding whether to
  // render this URL) so disabling it takes effect immediately even for a
  // stale client that still requests it.
  if (!member || member.status !== 'ACTIVE' || member.avatarChoice !== 'GRAVATAR' || !config.gravatarEnabled) {
    return new NextResponse(null, { status: 404 })
  }

  const hash = createHash('sha256').update(member.email.trim().toLowerCase()).digest('hex')

  try {
    const gravatarRes = await fetch(`https://www.gravatar.com/avatar/${hash}?d=404&s=200`, {
      next: { revalidate: 86400 },
    })
    // Cached, unlike the gate 404s above: with GRAVATAR as the default choice
    // most members won't have one, and an uncached miss means a request on
    // every avatar on every page load for the rest of the site's life. Short
    // enough that a member who signs up at gravatar.com sees it the same hour.
    if (!gravatarRes.ok) {
      return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=3600' } })
    }

    const buffer = await gravatarRes.arrayBuffer()
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': gravatarRes.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}
