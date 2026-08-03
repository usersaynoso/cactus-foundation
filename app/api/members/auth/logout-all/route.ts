import { NextRequest, NextResponse } from 'next/server'
import { getMemberFromCookie, deleteAllMemberSessions, clearMemberSessionCookie } from '@/lib/members/session'
import { MEMBER_ADMIN_OPTOUT_COOKIE } from '@/lib/members/admin-link'

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

  const res = NextResponse.redirect(new URL('/logged-out', request.url))
  // Same reason as the ordinary sign-out: an admin-linked member who asks to be
  // signed out everywhere means it, live admin session or not.
  if (member.userId) {
    res.cookies.set(MEMBER_ADMIN_OPTOUT_COOKIE, '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    })
  }
  return res
}
