import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getMemberFromCookie } from '@/lib/members/session'
import { verifyTotpCode } from '@/lib/auth/totp'
import { decryptSecret } from '@/lib/crypto/secrets'
import { verifyMemberEmailChallenge } from '@/lib/members/email-challenge'
import { generateMemberRecoveryCodes } from '@/lib/members/recovery-codes'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'
import { notifyMemberSecurityAlert } from '@/lib/members/security-alerts'

const Body = z.object({
  method: z.enum(['EMAIL', 'AUTHENTICATOR_APP']),
  code: z.string().min(6).max(6),
})

export async function POST(request: NextRequest) {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const { method, code } = parsed.data

  const ip = await getClientIp(request)
  const rl = await checkAndRecord('member_2fa', [`ip:${ip}`, `account:${member.id}`])
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please wait and try again.' }, { status: 429 })
  }

  const hadTwoFactorBefore = !!(await prisma.memberTwoFactor.findFirst({ where: { memberId: member.id, verified: true } }))

  if (method === 'EMAIL') {
    const result = await verifyMemberEmailChallenge(member.id, 'setup_2fa', code)
    if (!result.success) {
      return NextResponse.json({ error: 'Incorrect or expired code' }, { status: 400 })
    }
    // Members have a single active 2FA method - drop any other before adding this one.
    await prisma.memberTwoFactor.deleteMany({ where: { memberId: member.id, NOT: { method: 'EMAIL' } } })
    await prisma.memberTwoFactor.upsert({
      where: { memberId_method: { memberId: member.id, method: 'EMAIL' } },
      create: { memberId: member.id, method: 'EMAIL', verified: true },
      update: { verified: true },
    })
  } else {
    const pending = await prisma.memberTwoFactor.findUnique({
      where: { memberId_method: { memberId: member.id, method: 'AUTHENTICATOR_APP' } },
    })
    if (!pending?.secretEncrypted) {
      return NextResponse.json({ error: 'No pending authenticator setup for this account' }, { status: 400 })
    }
    const secret = decryptSecret(pending.secretEncrypted)
    const result = verifyTotpCode(secret, code, pending.lastStep)
    if (!result.valid) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 })
    }
    await prisma.memberTwoFactor.deleteMany({ where: { memberId: member.id, NOT: { method: 'AUTHENTICATOR_APP' } } })
    await prisma.memberTwoFactor.update({
      where: { id: pending.id },
      data: { verified: true, lastStep: result.step },
    })
  }

  await notifyMemberSecurityAlert(
    member,
    hadTwoFactorBefore
      ? `Your two-factor authentication method was changed to ${method === 'EMAIL' ? 'email' : 'an authenticator app'}.`
      : `Two-factor authentication was enabled on your account (${method === 'EMAIL' ? 'email' : 'authenticator app'}).`
  )

  if (!hadTwoFactorBefore) {
    const recoveryCodes = await generateMemberRecoveryCodes(member.id)
    return NextResponse.json({ verified: true, recoveryCodes })
  }

  return NextResponse.json({ verified: true })
}
