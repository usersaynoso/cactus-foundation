import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { validateRecoveryToken, consumeRecoveryToken } from '@/lib/auth/recovery'
import { hashPassword, validateNewPassword } from '@/lib/auth/password'
import { prisma } from '@/lib/db/prisma'
import { deleteAllUserSessions, revokeAllTrustedDevices, createSession, setSessionCookie } from '@/lib/auth/session'
import { sendRecoveryNotification } from '@/lib/email/index'
import { isEmailConfigured } from '@/lib/config/env'

// GET: validate a recovery token (renders a form in the browser)
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const result = await validateRecoveryToken(token)
  if (!result) {
    // Redirect to a "link expired" message — for now just redirect home
    return NextResponse.redirect(new URL('/?recovery=expired', request.url))
  }

  // Redirect to a recovery form page (the admin path's recovery page)
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { adminPath: true },
  })
  const adminPath = config?.adminPath ?? ''
  // Hand the token to the login page via a short-lived HttpOnly cookie rather
  // than the query string: a token in ?recovery_token= lands in browser history,
  // server logs and any Referer header. The cookie is invisible to page JS
  // (HttpOnly) and to the address bar; the login page only flips into recovery
  // mode from the ?recovery=1 flag, and the POST below reads the token back out
  // of the cookie. SameSite=Lax so it survives the top-level navigation from the
  // emailed link.
  const res = NextResponse.redirect(new URL(`/${adminPath}/login?recovery=1`, request.url))
  res.cookies.set(RECOVERY_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 60, // matches the token's own 30-minute TTL
  })
  return res
}

const RECOVERY_COOKIE = 'cactus_recovery_token'

// POST: complete recovery via email token. The token normally rides in the
// HttpOnly cookie set by GET; a token in the body is still accepted for older
// links already in flight.
const Body = z.object({
  token: z.string().optional(),
  newPassword: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { newPassword } = parsed.data
  const token = parsed.data.token || request.cookies.get(RECOVERY_COOKIE)?.value || ''
  if (!token) {
    return NextResponse.json({ error: 'Recovery link is invalid or expired' }, { status: 400 })
  }

  if (!isEmailConfigured()) {
    return NextResponse.json({ error: 'Email recovery is not available' }, { status: 503 })
  }
  const result = await validateRecoveryToken(token)
  if (!result) {
    return NextResponse.json({ error: 'Recovery link is invalid or expired' }, { status: 400 })
  }
  const userId = result.userId

  // Validate the new password BEFORE spending the token. A weak password used
  // to return 400 with the token already consumed, forcing the user to request
  // a fresh recovery link just to try a stronger one.
  let hash: string | null = null
  if (newPassword) {
    const pwResult = await validateNewPassword(newPassword)
    if (!pwResult.valid) {
      return NextResponse.json({ error: pwResult.reason }, { status: 400 })
    }
    hash = await hashPassword(newPassword)
  }

  await consumeRecoveryToken(token)

  if (hash) {
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } })
  }

  // Invalidate all other sessions and trusted devices
  await deleteAllUserSessions(userId)
  await revokeAllTrustedDevices(userId)

  // Create a new session for the recovered account
  const sessionToken = await createSession(userId)
  await setSessionCookie(sessionToken)

  // Notify the user
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  const config = await prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { siteName: true } })
  if (user && isEmailConfigured()) {
    await sendRecoveryNotification(user.email, config?.siteName ?? 'Cactus').catch(() => {})
  }

  const done = NextResponse.json({ ok: true, userId })
  done.cookies.set(RECOVERY_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return done
}
