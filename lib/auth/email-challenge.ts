import { createHmac, randomInt } from 'crypto'
import { prisma } from '@/lib/db/prisma'
import { safeCompare } from '@/lib/auth/session'
import { getSessionSecret } from '@/lib/config/env'

const CODE_LENGTH = 6
const CODE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const MAX_ATTEMPTS = 5

export type ChallengePurpose = 'login_otp' | 'verify_email' | 'email_change'

function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0')
}

// Keyed with the session secret rather than a bare digest.
//
// A six-digit code is a keyspace of one million: a plain sha256 of it is
// reversible by anyone who can read the table, in about a second, on a laptop.
// Anyone with read access to the database could therefore turn a live login
// challenge back into the code it was minted from. An HMAC can't be brute-forced
// without the secret, which lives in the environment and not in the database.
// (Session tokens are already hashed this way - this brings OTP into line.)
function hashCode(code: string): string {
  return createHmac('sha256', getSessionSecret()).update(code).digest('hex')
}

// `pendingEmail` is only meaningful for the 'email_change' purpose: it parks the
// address being moved to, so the change can be applied when - and only when -
// the code sent to that address comes back verified.
export async function createEmailChallenge(
  userId: string,
  purpose: ChallengePurpose,
  pendingEmail?: string
): Promise<string> {
  // Invalidate any existing challenges for this user + purpose
  await prisma.emailChallenge.deleteMany({ where: { userId, purpose } })

  const code = generateCode()
  const codeHash = hashCode(code)
  const expiresAt = new Date(Date.now() + CODE_TTL_MS)

  await prisma.emailChallenge.create({
    data: { userId, codeHash, purpose, expiresAt, pendingEmail: pendingEmail ?? null },
  })

  return code
}

// Spends the live challenge for this user and purpose without looking at a code,
// and says whether there was one to spend. For the trusted-browser shortcut on
// the admin sign-in: a trusted browser is excused the emailed code, never the
// password, and a login_otp challenge only ever exists because
// app/api/auth/login has just checked the password. Without this, a trusted
// browser cookie plus the account's id was a session, password unasked.
export async function consumeLiveEmailChallenge(userId: string, purpose: ChallengePurpose): Promise<boolean> {
  const { count } = await prisma.emailChallenge.deleteMany({
    where: { userId, purpose, expiresAt: { gt: new Date() }, attempts: { lt: MAX_ATTEMPTS } },
  })
  return count > 0
}

export type ChallengeVerifyResult =
  // `pendingEmail` is returned because verifying consumes (deletes) the row, so
  // this is the caller's only chance to learn which address was being confirmed.
  | { success: true; pendingEmail: string | null }
  | { success: false; reason: 'invalid' | 'expired' | 'max_attempts' }

export async function verifyEmailChallenge(
  userId: string,
  purpose: ChallengePurpose,
  code: string
): Promise<ChallengeVerifyResult> {
  const challenge = await prisma.emailChallenge.findFirst({
    where: { userId, purpose },
    orderBy: { createdAt: 'desc' },
  })

  if (!challenge) return { success: false, reason: 'invalid' }
  if (challenge.expiresAt < new Date()) {
    await prisma.emailChallenge.delete({ where: { id: challenge.id } })
    return { success: false, reason: 'expired' }
  }
  if (challenge.attempts >= MAX_ATTEMPTS) {
    await prisma.emailChallenge.delete({ where: { id: challenge.id } })
    return { success: false, reason: 'max_attempts' }
  }

  const codeHash = hashCode(code.trim())
  if (!safeCompare(codeHash, challenge.codeHash)) {
    await prisma.emailChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    })
    // If this was the last attempt, delete
    if (challenge.attempts + 1 >= MAX_ATTEMPTS) {
      await prisma.emailChallenge.delete({ where: { id: challenge.id } })
    }
    return { success: false, reason: 'invalid' }
  }

  // Success — consume the challenge
  await prisma.emailChallenge.delete({ where: { id: challenge.id } })
  return { success: true, pendingEmail: challenge.pendingEmail }
}
