import { cookies } from 'next/headers'
import { prisma } from '@/lib/db/prisma'
import { getMembersConfigCached } from '@/lib/members/config'
import {
  hashToken,
  generateMemberSessionToken,
  createMemberSession,
  validateMemberSession,
  validateMemberSessionDetailed,
  deleteMemberSession,
  deleteAllMemberSessions,
  listMemberSessions,
  revokeMemberSessionById,
  createMemberTrustedBrowser,
  revokeAllMemberTrustedBrowsers,
  listMemberTrustedBrowsers,
  revokeMemberTrustedBrowserById,
  getMemberSessionCreatedAt,
  memberTrustedBrowserExpiresAt,
  MEMBER_COOKIE_MAX_AGE_SECONDS,
} from '@/lib/members/session-core'
import type { Member } from '@prisma/client'

// Member session/cookie layer. Deliberately separate from lib/auth/session.ts:
// members never share a table, cookie, or token namespace with admin Users
// (see MEMBERS_SPEC.md amendment 1). Token hashing mirrors the admin pattern
// exactly (sha256(token + SESSION_SECRET) — the HMAC-like mixing is reserved
// for long-lived credentials; the shorter-lived tokens in lib/members/tokens.ts
// intentionally omit it, matching lib/auth/recovery.ts).

export {
  generateMemberSessionToken,
  createMemberSession,
  validateMemberSession,
  deleteMemberSession,
  deleteAllMemberSessions,
  listMemberSessions,
  revokeMemberSessionById,
  createMemberTrustedBrowser,
  revokeAllMemberTrustedBrowsers,
  listMemberTrustedBrowsers,
  revokeMemberTrustedBrowserById,
}

export const MEMBER_SESSION_COOKIE = 'cactus_member_session'
const SESSION_COOKIE = MEMBER_SESSION_COOKIE
const TRUSTED_BROWSER_COOKIE = 'cactus_member_trusted'

// Split out from the setter below because a route that answers with a redirect
// has to stamp the cookie onto the response it built itself, and then needs the
// exact same attributes - a session cookie that differs by one flag from the
// one every other sign-in path sets is a bug waiting for a quiet afternoon.
//
// maxAge is deliberately not the session setting: see
// MEMBER_COOKIE_MAX_AGE_SECONDS. The server decides when a session ends.
export async function memberSessionCookieOptions(): Promise<{
  httpOnly: true
  secure: boolean
  sameSite: 'lax'
  maxAge: number
  path: string
}> {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MEMBER_COOKIE_MAX_AGE_SECONDS,
    path: '/',
  }
}

export async function setMemberSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, await memberSessionCookieOptions())
}

export async function clearMemberSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

export async function getMemberSessionTokenFromCookie(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(SESSION_COOKIE)?.value ?? null
}

export async function getMemberFromCookie(): Promise<Member | null> {
  const token = await getMemberSessionTokenFromCookie()
  if (!token) return null
  const result = await validateMemberSessionDetailed(token)
  if (!result) return null
  // Cookies signed in before the cookie stopped following the setting carry
  // that old, fixed lifetime. Re-issued here whenever the session slides, which
  // also keeps every cookie a long way from its end. Only route handlers and
  // server actions may write cookies; a server component throws, and simply
  // leaves it to the next request that can.
  if (result.touched) {
    try {
      const cookieStore = await cookies()
      cookieStore.set(SESSION_COOKIE, token, await memberSessionCookieOptions())
    } catch {
      // Rendering a page - not allowed to set cookies here. Harmless.
    }
  }
  return result.member
}

// Step-up window: enrolling a new authenticator (passkey / TOTP) must not ride
// a stale session, or a borrowed unlocked browser could plant its own sign-in
// method. Require the current session to have authenticated within this window.
export const MEMBER_STEP_UP_MAX_AGE_MS = 10 * 60 * 1000 // 10 minutes

export async function isCurrentMemberSessionFresh(maxAgeMs = MEMBER_STEP_UP_MAX_AGE_MS): Promise<boolean> {
  const token = await getMemberSessionTokenFromCookie()
  if (!token) return false
  const createdAt = await getMemberSessionCreatedAt(token)
  if (!createdAt) return false
  return Date.now() - createdAt.getTime() <= maxAgeMs
}

// Lets a route mark which entry in listMemberSessions() is "this browser"
// without re-implementing the hashing scheme itself.
export async function getCurrentMemberSessionTokenHash(): Promise<string | null> {
  const token = await getMemberSessionTokenFromCookie()
  return token ? hashToken(token) : null
}

function trustedBrowserCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: MEMBER_COOKIE_MAX_AGE_SECONDS,
    path: '/',
  }
}

export async function setMemberTrustedBrowserCookie(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(TRUSTED_BROWSER_COOKIE, token, trustedBrowserCookieOptions())
}

export async function isMemberBrowserTrusted(memberId: string): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(TRUSTED_BROWSER_COOKIE)?.value
  if (!token) return false

  const tokenHash = hashToken(token)
  const trusted = await prisma.memberTrustedBrowser.findUnique({ where: { tokenHash } })
  if (!trusted) return false
  if (trusted.memberId !== memberId) return false

  // Counted from the day it was trusted, under the current setting, and never
  // extended by use (see memberTrustedBrowserExpiresAt). The stored expiresAt is
  // kept in step so the column still means what it says.
  const config = await getMembersConfigCached()
  const expiresAt = memberTrustedBrowserExpiresAt(trusted.createdAt, config.trustedBrowserDays)
  if (expiresAt <= new Date()) {
    await prisma.memberTrustedBrowser.deleteMany({ where: { id: trusted.id } })
    return false
  }
  if (expiresAt.getTime() !== trusted.expiresAt.getTime()) {
    await prisma.memberTrustedBrowser.update({ where: { id: trusted.id }, data: { expiresAt } })
  }

  // Called from the password sign-in route, which may write cookies: renew the
  // cookie so one issued under the old fixed lifetime does not drop out early.
  try {
    const cookieStore = await cookies()
    cookieStore.set(TRUSTED_BROWSER_COOKIE, token, trustedBrowserCookieOptions())
  } catch {
    // Not in a context that can write cookies. Harmless.
  }
  return true
}

export async function getCurrentMemberTrustedBrowserTokenHash(): Promise<string | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(TRUSTED_BROWSER_COOKIE)?.value
  return token ? hashToken(token) : null
}
