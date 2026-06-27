import { createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/db/prisma'

const RECOVERY_TTL_MS = 30 * 60 * 1000 // 30 minutes

// ---------------------------------------------------------------------------
// Email-based recovery tokens
// ---------------------------------------------------------------------------

export function generateRecoveryToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createRecoveryRequest(userId: string): Promise<string> {
  // Invalidate any existing unused requests for this user
  await prisma.recoveryRequest.deleteMany({ where: { userId, used: false } })

  const token = generateRecoveryToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + RECOVERY_TTL_MS)

  await prisma.recoveryRequest.create({
    data: { userId, tokenHash, expiresAt },
  })

  return token
}

export async function validateRecoveryToken(
  token: string
): Promise<{ userId: string } | null> {
  const tokenHash = hashToken(token.trim())
  const request = await prisma.recoveryRequest.findUnique({
    where: { tokenHash },
  })

  if (!request) return null
  if (request.used) return null
  if (request.expiresAt < new Date()) {
    await prisma.recoveryRequest.delete({ where: { id: request.id } })
    return null
  }

  return { userId: request.userId }
}

export async function consumeRecoveryToken(token: string): Promise<boolean> {
  const tokenHash = hashToken(token.trim())
  const updated = await prisma.recoveryRequest.updateMany({
    where: { tokenHash, used: false, expiresAt: { gt: new Date() } },
    data: { used: true },
  })
  return updated.count > 0
}
