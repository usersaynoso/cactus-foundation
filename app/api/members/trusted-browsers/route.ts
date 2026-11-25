import { NextRequest, NextResponse } from 'next/server'
import { getMemberAuthFromRequest, getMemberFromRequest } from '@/lib/members/api-auth'
import {
  listMemberTrustedBrowsers,
  revokeAllMemberTrustedBrowsers,
  getCurrentMemberTrustedBrowserTokenHash,
} from '@/lib/members/session'

export async function GET(request: NextRequest) {
  const auth = await getMemberAuthFromRequest(request)
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { member } = auth

  // An app is not a browser, so nothing in the list is "this one" for it.
  const currentHash = auth.via === 'cookie' ? await getCurrentMemberTrustedBrowserTokenHash() : null
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

export async function DELETE(request: NextRequest) {
  const member = await getMemberFromRequest(request)
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  await revokeAllMemberTrustedBrowsers(member.id)
  return NextResponse.json({ ok: true })
}
