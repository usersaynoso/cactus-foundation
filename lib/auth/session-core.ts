import { prisma } from '@/lib/db/prisma'
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { getSessionSecret } from '@/lib/config/env'
import type { User, Role } from '@prisma/client'

// Cookie-free core of the session layer. Split out from lib/auth/session.ts
// so that proxy.ts (Next.js 16 Node-runtime proxy, bundled outside the
// Server Components graph) can call validateSession() without pulling in
// next/headers, which that bundle context rejects.

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours

export type SessionUser = User & { role: Role }

export function hashToken(token: string): string {
  const secret = getSessionSecret()
  return createHash('sha256')
    .update(token + secret)
    .digest('hex')
}

export function generateToken(): string {
  return randomBytes(32).toString('hex')
}

export async function createSession(userId: string): Promise<string> {
  const token = generateToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)

  await prisma.session.create({
    data: { userId, tokenHash, expiresAt },
  })

  return token
}

export async function validateSession(token: string): Promise<SessionUser | null> {
  const tokenHash = hashToken(token)
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: { include: { role: true } } },
  })

  if (!session) return null
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } })
    return null
  }
  if (session.user.suspendedAt) return null

  return session.user as SessionUser
}

// Authentication time of the session behind this token, for step-up checks. A
// fresh login always creates a new session row, so createdAt is when the caller
// last proved who they are. Returns null when the token maps to no live session.
export async function getSessionCreatedAt(token: string): Promise<Date | null> {
  const tokenHash = hashToken(token)
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    select: { createdAt: true, expiresAt: true },
  })
  if (!session || session.expiresAt < new Date()) return null
  return session.createdAt
}

export async function deleteSession(token: string): Promise<void> {
  const tokenHash = hashToken(token)
  await prisma.session.deleteMany({ where: { tokenHash } })
}

export async function deleteAllUserSessions(
  userId: string,
  exceptTokenHash?: string
): Promise<void> {
  await prisma.session.deleteMany({
    where: {
      userId,
      ...(exceptTokenHash ? { NOT: { tokenHash: exceptTokenHash } } : {}),
    },
  })
}

// ---------------------------------------------------------------------------
// Trusted device
// ---------------------------------------------------------------------------

export async function createTrustedDevice(
  userId: string,
  durationDays: number
): Promise<string> {
  const token = generateToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)

  // Upsert: refresh if a trusted device cookie from this browser already exists.
  // In practice we key on the userId + browser, but since we have no device
  // fingerprint we just create a fresh record.
  await prisma.trustedDevice.create({ data: { userId, tokenHash, expiresAt } })

  return token
}

export async function revokeAllTrustedDevices(
  userId: string
): Promise<void> {
  await prisma.trustedDevice.deleteMany({ where: { userId } })
}

// ---------------------------------------------------------------------------
// Session list for account settings
// ---------------------------------------------------------------------------

export async function listUserSessions(userId: string) {
  return prisma.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true, expiresAt: true, tokenHash: true },
  })
}

export async function revokeSessionById(
  sessionId: string,
  userId: string
): Promise<void> {
  await prisma.session.deleteMany({
    where: { id: sessionId, userId },
  })
}

// Timing-safe token comparison helper
export function safeCompare(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a)
    const bb = Buffer.from(b)
    if (ab.length !== bb.length) return false
    return timingSafeEqual(ab, bb)
  } catch {
    return false
  }
}
