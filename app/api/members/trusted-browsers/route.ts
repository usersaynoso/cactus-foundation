import { NextResponse } from 'next/server'
import {
  getMemberFromCookie,
  listMemberTrustedBrowsers,
  revokeAllMemberTrustedBrowsers,
  getCurrentMemberTrustedBrowserTokenHash,
} from '@/lib/members/session'

export async function GET() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const currentHash = await getCurrentMemberTrustedBrowserTokenHash()
  const browsers = await listMemberTrustedBrowsers(member.id)
  return NextResponse.json({
    trustedBrowsers: browsers.map((b) => ({
      id: b.id,
      deviceInfo: b.deviceInfo,
      createdAt: b.createdAt,
      expiresAt: b.expiresAt,
      isCurrent: b.tokenHash === currentHash,
    })),
  })
}

export async function DELETE() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  await revokeAllMemberTrustedBrowsers(member.id)
  return NextResponse.json({ ok: true })
}
