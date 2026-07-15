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
  const expiresAt = new Date(Date.now() + config.sessionDays * 24 * 60 * 60 * 1000)

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
// Sliding expiry: every valid check pushes expiresAt forward by sessionDays.
export async function validateMemberSession(token: string): Promise<Member | null> {
  const tokenHash = hashToken(token)
  const session = await prisma.memberSession.findUnique({
    where: { tokenHash },
    include: { member: true },
  })

  if (!session) return null
  if (session.expiresAt < new Date()) {
    await prisma.memberSession.delete({ where: { id: session.id } })
    return null
  }
  if (session.member.status !== 'ACTIVE') return null

  const config = await getMembersConfigCached()
  const expiresAt = new Date(Date.now() + config.sessionDays * 24 * 60 * 60 * 1000)
  await prisma.memberSession.update({
    where: { id: session.id },
    data: { expiresAt, lastActiveAt: new Date() },
  })

  return session.member
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
  return prisma.memberSession.findMany({
    where: { memberId, expiresAt: { gt: new Date() } },
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
  const expiresAt = new Date(Date.now() + config.trustedBrowserDays * 24 * 60 * 60 * 1000)

  await prisma.memberTrustedBrowser.create({
    data: { memberId, tokenHash, deviceInfo, expiresAt },
  })

  return token
}

export async function revokeAllMemberTrustedBrowsers(memberId: string): Promise<void> {
  await prisma.memberTrustedBrowser.deleteMany({ where: { memberId } })
}

export async function listMemberTrustedBrowsers(memberId: string) {
  return prisma.memberTrustedBrowser.findMany({
    where: { memberId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, deviceInfo: true, createdAt: true, expiresAt: true, tokenHash: true },
  })
}

export async function revokeMemberTrustedBrowserById(id: string, memberId: string): Promise<void> {
  await prisma.memberTrustedBrowser.deleteMany({ where: { id, memberId } })
}
