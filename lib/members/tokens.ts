import { createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/db/prisma'

// Hashed single-use tokens for member verification links. Mirrors the core
// lib/auth/recovery.ts pattern: raw token goes out in the email, only its
// hash is ever persisted.

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const RESEND_THROTTLE_MS = 60 * 1000 // 60 seconds, per MEMBERS_SPEC.md

export function generateMemberToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashMemberToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createVerificationToken(memberId: string): Promise<string> {
  const token = generateMemberToken()
  await prisma.memberVerificationToken.create({
    data: {
      memberId,
      tokenHash: hashMemberToken(token),
      expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
    },
  })
  return token
}

export async function consumeVerificationToken(
  token: string
): Promise<{ memberId: string } | null> {
  const tokenHash = hashMemberToken(token.trim())
  const record = await prisma.memberVerificationToken.findUnique({ where: { tokenHash } })
  if (!record || record.usedAt || record.expiresAt < new Date()) return null

  await prisma.memberVerificationToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  })
  return { memberId: record.memberId }
}

// Throttles resend requests per-member regardless of whether earlier tokens
// were used — a fresh row is written on every send attempt.
export async function canResendVerification(memberId: string): Promise<boolean> {
  const last = await prisma.memberVerificationToken.findFirst({
    where: { memberId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  if (!last) return true
  return Date.now() - last.createdAt.getTime() > RESEND_THROTTLE_MS
}
