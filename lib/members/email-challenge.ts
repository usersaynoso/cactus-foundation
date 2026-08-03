import { createHash, randomInt } from 'crypto'
import { prisma } from '@/lib/db/prisma'
import { safeCompare } from '@/lib/auth/session'

// Mirrors lib/auth/email-challenge.ts against MemberEmailChallenge instead of
// EmailChallenge. Purposes: 'login_2fa' (password login's mandatory second
// factor) | 'setup_2fa' (Phase 3 account Security page, enabling email 2FA) |
// 'email_change' (moving the account to a new address, gated on a code sent to
// that address).

const CODE_LENGTH = 6
const CODE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const MAX_ATTEMPTS = 5

export type MemberChallengePurpose = 'login_2fa' | 'setup_2fa' | 'email_change'

function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0')
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

// `pendingEmail` is only meaningful for the 'email_change' purpose: it parks the
// address being moved to, so the change can be applied when - and only when -
// the code sent to that address comes back verified.
export async function createMemberEmailChallenge(
  memberId: string,
  purpose: MemberChallengePurpose,
  pendingEmail?: string
): Promise<string> {
  await prisma.memberEmailChallenge.deleteMany({ where: { memberId, purpose } })

  const code = generateCode()
  const codeHash = hashCode(code)
  const expiresAt = new Date(Date.now() + CODE_TTL_MS)

  await prisma.memberEmailChallenge.create({
    data: { memberId, codeHash, purpose, expiresAt, pendingEmail: pendingEmail ?? null },
  })

  return code
}

/** The address an unexpired email_change challenge is waiting on, or null.
 * Lets the account page put a member back where they were after a reload,
 * rather than silently forgetting a code that is still live in their inbox. */
export async function pendingMemberEmailChange(memberId: string): Promise<string | null> {
  const challenge = await prisma.memberEmailChallenge.findFirst({
    where: { memberId, purpose: 'email_change', expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { pendingEmail: true },
  })
  return challenge?.pendingEmail ?? null
}

export type MemberChallengeVerifyResult =
  // `pendingEmail` is returned because verifying consumes (deletes) the row, so
  // this is the caller's only chance to learn which address was being confirmed.
  | { success: true; pendingEmail: string | null }
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
  return { success: true, pendingEmail: challenge.pendingEmail }
}
