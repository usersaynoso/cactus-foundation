import { createHash, randomInt } from 'crypto'
import { prisma } from '@/lib/db/prisma'
import { safeCompare } from '@/lib/auth/session'

// Mirrors lib/auth/email-challenge.ts against MemberEmailChallenge instead of
// EmailChallenge. Purposes: 'login_2fa' (password login's mandatory second
// factor) | 'setup_2fa' (Phase 3 account Security page, enabling email 2FA).

const CODE_LENGTH = 6
const CODE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const MAX_ATTEMPTS = 5

export type MemberChallengePurpose = 'login_2fa' | 'setup_2fa'

function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0')
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

export async function createMemberEmailChallenge(
  memberId: string,
  purpose: MemberChallengePurpose
): Promise<string> {
  await prisma.memberEmailChallenge.deleteMany({ where: { memberId, purpose } })

  const code = generateCode()
  const codeHash = hashCode(code)
  const expiresAt = new Date(Date.now() + CODE_TTL_MS)

  await prisma.memberEmailChallenge.create({
    data: { memberId, codeHash, purpose, expiresAt },
  })

  return code
}

export type MemberChallengeVerifyResult =
  | { success: true }
  | { success: false; reason: 'invalid' | 'expired' | 'max_attempts' }

export async function verifyMemberEmailChallenge(
  memberId: string,
  purpose: MemberChallengePurpose,
  code: string
): Promise<MemberChallengeVerifyResult> {
  const challenge = await prisma.memberEmailChallenge.findFirst({
    where: { memberId, purpose },
    orderBy: { createdAt: 'desc' },
  })

  if (!challenge) return { success: false, reason: 'invalid' }
  if (challenge.expiresAt < new Date()) {
    await prisma.memberEmailChallenge.delete({ where: { id: challenge.id } })
    return { success: false, reason: 'expired' }
  }
  if (challenge.attempts >= MAX_ATTEMPTS) {
    await prisma.memberEmailChallenge.delete({ where: { id: challenge.id } })
    return { success: false, reason: 'max_attempts' }
  }

  const codeHash = hashCode(code.trim())
  if (!safeCompare(codeHash, challenge.codeHash)) {
    await prisma.memberEmailChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    })
    if (challenge.attempts + 1 >= MAX_ATTEMPTS) {
      await prisma.memberEmailChallenge.delete({ where: { id: challenge.id } })
    }
    return { success: false, reason: 'invalid' }
  }

  await prisma.memberEmailChallenge.delete({ where: { id: challenge.id } })
  return { success: true }
}
