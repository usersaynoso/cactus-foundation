import { createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/db/prisma'
import { getMemberAreaPath } from '@/lib/members/paths'
import { sendMemberEmail } from '@/lib/email/templates'

// Magic-link sign-in tokens (MEMBERS_SPEC.md Authentication: 15-minute
// single-use email link). Hashed like lib/members/tokens.ts's verification
// tokens (plain sha256, no SESSION_SECRET mixing — that's reserved for the
// longer-lived session/trusted-browser tokens in lib/members/session.ts).

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function sendMagicLink(memberId: string, email: string, siteName: string): Promise<void> {
  const token = generateToken()
  await prisma.memberMagicLink.create({
    data: {
      memberId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
    },
  })

  const siteUrl = process.env.SITE_URL?.replace(/\/$/, '') ?? ''
  const magicUrl = `${siteUrl}/${getMemberAreaPath()}/login?magic_token=${token}`
  await sendMemberEmail({ email }, 'member.magic-link', { siteName, magicUrl })
}

// Status gating (loginRejectionForStatus) happens at the route level, not
// here — this only answers "is the token itself valid and unused."
export async function consumeMagicLink(token: string): Promise<{ memberId: string } | null> {
  const tokenHash = hashToken(token.trim())
  const record = await prisma.memberMagicLink.findUnique({ where: { tokenHash } })
  if (!record || record.usedAt || record.expiresAt < new Date()) return null

  await prisma.memberMagicLink.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  })
  return { memberId: record.memberId }
}
