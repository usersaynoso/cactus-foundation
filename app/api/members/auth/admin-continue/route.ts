// Signs a site admin into the member area as themselves. The account layout
// sends them here rather than to the sign-in page: they have already proved who
// they are to the admin, and being asked to do it again by the same site is the
// sort of thing that gets described, fairly, as broken.
import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { sanitizeRedirect } from '@/lib/auth/redirect'
import { getMembersConfig } from '@/lib/members/config'
import { getMemberAreaPath } from '@/lib/members/paths'
import { createMemberSession, MEMBER_SESSION_COOKIE, memberSessionCookieOptions } from '@/lib/members/session'
import { recordMemberActivity } from '@/lib/members/activity'
import { getClientIp } from '@/lib/auth/rate-limit'
import {
  findOrCreateMemberForUser,
  MEMBER_ADMIN_ATTEMPT_COOKIE,
  MEMBER_ADMIN_ATTEMPT_MAX_AGE,
  MEMBER_ADMIN_OPTOUT_COOKIE,
  tooManyRecentSessions,
} from '@/lib/members/admin-link'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const basePath = `/${getMemberAreaPath()}`
  const target = sanitizeRedirect(request.nextUrl.searchParams.get('redirect'), basePath)

  // Every failure ends on the ordinary sign-in page - there is always a way in
  // by member credentials, whatever went wrong with the staff shortcut.
  function toLogin(reason?: string): NextResponse {
    const url = new URL(`${basePath}/login`, request.url)
    if (reason) url.searchParams.set('admin_link', reason)
    if (target !== basePath) url.searchParams.set('redirect', target)
    const res = NextResponse.redirect(url)
    res.cookies.delete(MEMBER_ADMIN_ATTEMPT_COOKIE)
    return res
  }

  // Second automatic hop with still no member session: the cookie is being
  // dropped somewhere between here and the browser. Say so rather than loop.
  // Only the account layout's automatic redirect carries `auto` - somebody
  // pressing "Continue to your account" is asking on purpose and gets a go,
  // whatever happened last time.
  const automatic = request.nextUrl.searchParams.get('auto') === '1'
  if (automatic && request.cookies.get(MEMBER_ADMIN_ATTEMPT_COOKIE)) return toLogin('failed')

  const user = await getSessionFromCookie()
  if (!user) return toLogin()

  const config = await getMembersConfig()
  if (!config.enabled) return toLogin()

  const link = await findOrCreateMemberForUser({
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
  })
  if (!link.ok) return toLogin('unavailable')

  // Three sessions in two minutes and still coming back means the browser is
  // keeping none of them. Stop issuing rather than loop until the browser does.
  if (await tooManyRecentSessions(link.memberId)) return toLogin('failed')

  const token = await createMemberSession(link.memberId, {
    ipAddress: await getClientIp(request),
    userAgent: request.headers.get('user-agent') ?? undefined,
  })

  // Set on the response rather than through cookies(): this answer is a
  // redirect, and the response object is the one place a Set-Cookie is certain
  // to survive being one.
  const res = NextResponse.redirect(new URL(target, request.url))
  res.cookies.set(MEMBER_SESSION_COOKIE, token, await memberSessionCookieOptions())
  res.cookies.set(MEMBER_ADMIN_ATTEMPT_COOKIE, '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MEMBER_ADMIN_ATTEMPT_MAX_AGE,
    path: '/',
  })
  // Choosing to come in clears the earlier choice to leave.
  res.cookies.delete(MEMBER_ADMIN_OPTOUT_COOKIE)

  await recordMemberActivity(link.memberId, 'login', { metadata: { method: 'ADMIN_SESSION' } })

  return res
}
