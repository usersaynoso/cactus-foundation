import { NextRequest, NextResponse } from 'next/server'
import { getMemberAuthFromRequest } from '@/lib/members/api-auth'
import {
  listMemberSessions,
  deleteAllMemberSessions,
  getCurrentMemberSessionTokenHash,
} from '@/lib/members/session'

// Browser sessions. An app signed in with a module's token (lib/members/api-auth.ts)
// is not one of them: every row is a browser, so none is `isCurrent` for it, and
// "sign out everywhere else" signs every browser out. The app's own device is
// listed by the module that issued its token.
async function currentHashFor(via: 'cookie' | 'token'): Promise<string | null> {
  return via === 'cookie' ? getCurrentMemberSessionTokenHash() : null
}

export async function GET(request: NextRequest) {
  const auth = await getMemberAuthFromRequest(request)
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const currentHash = await currentHashFor(auth.via)
  const sessions = await listMemberSessions(auth.member.id)
  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      location: s.location,
      lastActiveAt: s.lastActiveAt,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      isCurrent: currentHash !== null && s.tokenHash === currentHash,
    })),
  })
}

// Revoke every session except the caller's own (mirrors admin's account/sessions).
export async function DELETE(request: NextRequest) {
  const auth = await getMemberAuthFromRequest(request)
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const currentHash = await currentHashFor(auth.via)
  await deleteAllMemberSessions(auth.member.id, currentHash ?? undefined)
  return NextResponse.json({ ok: true })
}
