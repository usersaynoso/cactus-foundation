import { createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/db/prisma'

// One-time 2FA-bypass codes. Shown once at generation, stored hashed only.
// Generation is a Phase 3 Security-page action; consumption is used here as
// a login-time fallback when a member has lost access to their 2FA method.

const CODE_COUNT = 10

function generateCode(): string {
  const raw = randomBytes(6).toString('hex')
  return `${raw.slice(0, 6)}-${raw.slice(6, 12)}`
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

// Replaces any existing *unused* codes with a fresh set - already-used codes
// are left in place as a record, but stop counting toward "remaining".
export async function generateMemberRecoveryCodes(memberId: string): Promise<string[]> {
  await prisma.memberRecoveryCode.deleteMany({ where: { memberId, usedAt: null } })

  const codes = Array.from({ length: CODE_COUNT }, generateCode)
  await prisma.memberRecoveryCode.createMany({
    data: codes.map((code) => ({ memberId, codeHash: hashCode(code) })),
  })

  return codes
}

export async function consumeMemberRecoveryCode(memberId: string, code: string): Promise<boolean> {
  const codeHash = hashCode(code.trim().toLowerCase())
  const updated = await prisma.memberRecoveryCode.updateMany({
    where: { memberId, codeHash, usedAt: null },
    data: { usedAt: new Date() },
  })
  return updated.count > 0
}

export async function countRemainingRecoveryCodes(memberId: string): Promise<number> {
  return prisma.memberRecoveryCode.count({ where: { memberId, usedAt: null } })
}
