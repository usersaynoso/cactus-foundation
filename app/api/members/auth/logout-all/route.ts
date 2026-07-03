import { NextRequest, NextResponse } from 'next/server'
import { getMemberFromCookie, deleteAllMemberSessions, clearMemberSessionCookie } from '@/lib/members/session'

// Signs the member out of every session, including the one making this
// request - unlike admin's "revoke all sessions" (which preserves the
// caller's own), forcing a full re-authentication is the point here.
export async function POST(request: NextRequest) {
  const member = await getMemberFromCookie()
  if (!member) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  await deleteAllMemberSessions(member.id)
  await clearMemberSessionCookie()

  return NextResponse.redirect(new URL('/logged-out', request.url))
}
