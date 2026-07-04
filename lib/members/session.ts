import { cookies } from 'next/headers'
import { prisma } from '@/lib/db/prisma'
import { getMembersConfigCached } from '@/lib/members/config'
import {
  hashToken,
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

const SESSION_COOKIE = 'cactus_member_session'
const TRUSTED_BROWSER_COOKIE = 'cactus_member_trusted'

export async function setMemberSessionCookie(token: string): Promise<void> {
  const config = await getMembersConfigCached()
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: config.sessionDays * 24 * 60 * 60,
    path: '/',
  })
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
  return validateMemberSession(token)
}

// Lets a route mark which entry in listMemberSessions() is "this browser"
// without re-implementing the hashing scheme itself.
export async function getCurrentMemberSessionTokenHash(): Promise<string | null> {
  const token = await getMemberSessionTokenFromCookie()
  return token ? hashToken(token) : null
}

export async function setMemberTrustedBrowserCookie(token: string): Promise<void> {
  const config = await getMembersConfigCached()
  const cookieStore = await cookies()
  cookieStore.set(TRUSTED_BROWSER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: config.trustedBrowserDays * 24 * 60 * 60,
    path: '/',
  })
}

export async function isMemberBrowserTrusted(memberId: string): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(TRUSTED_BROWSER_COOKIE)?.value
  if (!token) return false

  const tokenHash = hashToken(token)
  const trusted = await prisma.memberTrustedBrowser.findUnique({ where: { tokenHash } })
  if (!trusted) return false
  if (trusted.memberId !== memberId) return false
  if (trusted.expiresAt < new Date()) {
    await prisma.memberTrustedBrowser.delete({ where: { id: trusted.id } })
    return false
  }

  const config = await getMembersConfigCached()
  await prisma.memberTrustedBrowser.update({
    where: { id: trusted.id },
    data: { expiresAt: new Date(Date.now() + config.trustedBrowserDays * 24 * 60 * 60 * 1000) },
  })

  return true
}

export async function getCurrentMemberTrustedBrowserTokenHash(): Promise<string | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(TRUSTED_BROWSER_COOKIE)?.value
  return token ? hashToken(token) : null
}
