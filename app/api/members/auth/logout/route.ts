import { NextRequest, NextResponse } from 'next/server'
import {
  getMemberFromCookie,
  getMemberSessionTokenFromCookie,
  deleteMemberSession,
  clearMemberSessionCookie,
} from '@/lib/members/session'
import { getSessionFromCookie } from '@/lib/auth/session'
import { MEMBER_ADMIN_OPTOUT_COOKIE } from '@/lib/members/admin-link'

export async function POST(request: NextRequest) {
  // Read before the session goes: an admin-linked member signing out needs the
  // opt-out marker set, or the account layout would hand their still-live admin
  // session a fresh member one on the very next page view, and "Sign out" would
  // look like it did nothing at all.
  const member = await getMemberFromCookie()
  const token = await getMemberSessionTokenFromCookie()
  if (token) {
    await deleteMemberSession(token).catch(() => {})
  }
  await clearMemberSessionCookie()

  // Either an admin-linked member signing out, or an admin who never had a
  // member session pressing the same button (the sign-in block offers it to
  // them once the account page is willing to let them in). Both mean the same
  // thing: stop putting me in the member area.
  const optOut = member ? !!member.userId : !!(await getSessionFromCookie())

  const res = NextResponse.redirect(new URL('/logged-out', request.url))
  if (optOut) {
    res.cookies.set(MEMBER_ADMIN_OPTOUT_COOKIE, '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    })
  }
  return res
}
