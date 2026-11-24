import { createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/db/prisma'
import { getSessionSecret } from '@/lib/config/env'
import { getMembersConfigCached } from '@/lib/members/config'
import type { Member } from '@prisma/client'

// Cookie-free core of the member session layer. Split out from
// lib/members/session.ts so that proxy.ts (Next.js 16 Node-runtime proxy,
// bundled outside the Server Components graph) can call
// validateMemberSession() without pulling in next/headers, which that
// bundle context rejects.

const DAY_MS = 24 * 60 * 60 * 1000

// How often a live session's row is rewritten. Every signed-in page view used to
// write it (sometimes twice: once in the proxy, once in the page), which is a
// database write per click for a "last active" time nobody reads to the second.
export const MEMBER_SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000

// The member cookies outlive any setting on purpose - 400 days is the most a
// browser will keep one. Whether a session or a trusted browser is still good is
// decided here on the server, from the row and the current settings, never by
// the cookie quietly expiring. Tying the cookie's life to the setting meant a
// "sliding" session the browser threw away a fixed number of days after sign-in
// however busy the member was, and a new setting that never reached anyone
// already signed in.
export const MEMBER_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60

// Whether a session is still good: inside its stored expiry AND inside the
// current setting, counted from the member's last visit. The second half is
// what makes shortening "Session duration" bite at once instead of waiting for
// each session's old expiry to run out.
export function isMemberSessionLive(
  session: { expiresAt: Date; lastActiveAt: Date },
  sessionDays: number,
  now: Date = new Date()
): boolean {
  if (session.expiresAt <= now) return false
  return session.lastActiveAt.getTime() + sessionDays * DAY_MS > now.getTime()
}

// A trusted browser lasts the configured number of days from the day it was
// trusted - the current setting, so changing it reaches browsers already
// trusted - and is never extended by being used.
export function memberTrustedBrowserExpiresAt(createdAt: Date, trustedBrowserDays: number): Date {
  return new Date(createdAt.getTime() + trustedBrowserDays * DAY_MS)
}

export function hashToken(token: string): string {
  const secret = getSessionSecret()
  return createHash('sha256').update(token + secret).digest('hex')
}

export function generateMemberSessionToken(): string {
  return randomBytes(32).toString('hex')
}

// ---------------------------------------------------------------------------
// Session create / validate / revoke / list
// ---------------------------------------------------------------------------

export async function createMemberSession(
  memberId: string,
  opts?: { ipAddress?: string; userAgent?: string }
): Promise<string> {
  const config = await getMembersConfigCached()
  const token = generateMemberSessionToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + config.sessionDays * DAY_MS)

  await prisma.memberSession.create({
    data: {
      memberId,
      tokenHash,
      ipAddress: opts?.ipAddress,
      userAgent: opts?.userAgent,
      expiresAt,
    },
  })

  return token
}

// Only ever returns a member whose status is ACTIVE — every other status
// (PENDING_VERIFICATION, PENDING_APPROVAL, SUSPENDED, DELETED) is rejected
// here even if the session row itself is unexpired. Non-ACTIVE members are
// never supposed to hold a live session in the first place (login endpoints
// refuse to create one for them - see the passkey/magic-link/password routes),
// so this check mainly guards the case where a member's status changes to
// something other than ACTIVE while an already-issued session is still live.
// Sliding expiry: a valid check pushes expiresAt forward by sessionDays, at most
// once per MEMBER_SESSION_TOUCH_INTERVAL_MS. `touched` says whether it did, so a
// caller that can write cookies knows when renewing one is worth it.
export async function validateMemberSessionDetailed(
  token: string
): Promise<{ member: Member; touched: boolean } | null> {
  const tokenHash = hashToken(token)
  const session = await prisma.memberSession.findUnique({
    where: { tokenHash },
    include: { member: true },
  })

  if (!session) return null
  const config = await getMembersConfigCached()
  const now = new Date()
  if (!isMemberSessionLive(session, config.sessionDays, now)) {
    await prisma.memberSession.deleteMany({ where: { id: session.id } })
    return null
  }
  if (session.member.status !== 'ACTIVE') return null

  if (now.getTime() - session.lastActiveAt.getTime() < MEMBER_SESSION_TOUCH_INTERVAL_MS) {
    return { member: session.member, touched: false }
  }
  await prisma.memberSession.update({
    where: { id: session.id },
    data: { expiresAt: new Date(now.getTime() + config.sessionDays * DAY_MS), lastActiveAt: now },
  })
  return { member: session.member, touched: true }
}

export async function validateMemberSession(token: string): Promise<Member | null> {
  return (await validateMemberSessionDetailed(token))?.member ?? null
}

// Authentication time of the session behind this token, for step-up checks.
// A fresh login always creates a new session row, so createdAt marks when the
// member last proved who they are (lastActiveAt slides; createdAt does not).
// Returns null when the token maps to no live session.
export async function getMemberSessionCreatedAt(token: string): Promise<Date | null> {
  const tokenHash = hashToken(token)
  const session = await prisma.memberSession.findUnique({
    where: { tokenHash },
    select: { createdAt: true, expiresAt: true },
  })
  if (!session || session.expiresAt < new Date()) return null
  return session.createdAt
}

export async function deleteMemberSession(token: string): Promise<void> {
  const tokenHash = hashToken(token)
  await prisma.memberSession.deleteMany({ where: { tokenHash } })
}

export async function deleteAllMemberSessions(
  memberId: string,
  exceptTokenHash?: string
): Promise<void> {
  await prisma.memberSession.deleteMany({
    where: {
      memberId,
      ...(exceptTokenHash ? { NOT: { tokenHash: exceptTokenHash } } : {}),
    },
  })
}

export async function listMemberSessions(memberId: string) {
  const config = await getMembersConfigCached()
  const now = new Date()
  const rows = await prisma.memberSession.findMany({
    where: { memberId, expiresAt: { gt: now } },
    orderBy: { lastActiveAt: 'desc' },
    select: {
      id: true,
      ipAddress: true,
      userAgent: true,
      location: true,
      lastActiveAt: true,
      createdAt: true,
      expiresAt: true,
      tokenHash: true,
    },
  })
  // A session the current setting has already timed out is gone the moment it
  // is next used, so it is not listed as live in the meantime.
  return rows.filter((row) => isMemberSessionLive(row, config.sessionDays, now))
}

export async function revokeMemberSessionById(
  sessionId: string,
  memberId: string
): Promise<void> {
  await prisma.memberSession.deleteMany({ where: { id: sessionId, memberId } })
}

// ---------------------------------------------------------------------------
// Trusted browser
// ---------------------------------------------------------------------------

export async function createMemberTrustedBrowser(
  memberId: string,
  deviceInfo?: string
): Promise<string> {
  const config = await getMembersConfigCached()
  const token = generateMemberSessionToken()
  const tokenHash = hashToken(token)
  const createdAt = new Date()
  const expiresAt = memberTrustedBrowserExpiresAt(createdAt, config.trustedBrowserDays)

  await prisma.memberTrustedBrowser.create({
    data: { memberId, tokenHash, deviceInfo, createdAt, expiresAt },
  })

  return token
}

export async function revokeAllMemberTrustedBrowsers(memberId: string): Promise<void> {
  await prisma.memberTrustedBrowser.deleteMany({ where: { memberId } })
}

// Expiry worked out from the current setting rather than the stored column, so
// the list agrees with what the sign-in check will actually do.
export async function listMemberTrustedBrowsers(memberId: string) {
  const config = await getMembersConfigCached()
  const now = new Date()
  const rows = await prisma.memberTrustedBrowser.findMany({
    where: { memberId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, deviceInfo: true, createdAt: true, tokenHash: true },
  })
  return rows
    .map((row) => ({ ...row, expiresAt: memberTrustedBrowserExpiresAt(row.createdAt, config.trustedBrowserDays) }))
    .filter((row) => row.expiresAt > now)
}

export async function revokeMemberTrustedBrowserById(id: string, memberId: string): Promise<void> {
  await prisma.memberTrustedBrowser.deleteMany({ where: { id, memberId } })
}
