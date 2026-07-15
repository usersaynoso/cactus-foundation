import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getMemberFromCookie, isCurrentMemberSessionFresh } from '@/lib/members/session'
import { generateTotpSecret, buildOtpauthUri, generateQrDataUrl } from '@/lib/auth/totp'
import { encryptSecret } from '@/lib/crypto/secrets'
import { createMemberEmailChallenge } from '@/lib/members/email-challenge'
import { isEmailConfigured } from '@/lib/config/env'

const Body = z.object({ method: z.enum(['EMAIL', 'AUTHENTICATOR_APP']) })

export async function POST(request: NextRequest) {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Step-up: enrolling a second factor is durable persistence and must not ride
  // a stale session. Require a recent authentication.
  if (!(await isCurrentMemberSessionFresh())) {
    return NextResponse.json(
      { error: 'For your security, please sign in again before setting up two-factor authentication.', reauthRequired: true },
      { status: 403 }
    )
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  if (parsed.data.method === 'EMAIL') {
    if (!isEmailConfigured()) {
      return NextResponse.json({ error: 'Email is not configured' }, { status: 503 })
    }
    const code = await createMemberEmailChallenge(member.id, 'setup_2fa')
    const siteConfig = await prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { siteName: true } })
    const { sendLoginOtp } = await import('@/lib/email/index')
    await sendLoginOtp(member.email, code, siteConfig?.siteName ?? 'Cactus')
    return NextResponse.json({ sent: true })
  }

  // AUTHENTICATOR_APP: generate + store an unverified secret; setup-verify
  // confirms the member's authenticator app produces a matching code.
  const secret = generateTotpSecret()
  const uri = buildOtpauthUri(secret, member.email)
  const qrDataUrl = await generateQrDataUrl(uri)

  await prisma.memberTwoFactor.upsert({
    where: { memberId_method: { memberId: member.id, method: 'AUTHENTICATOR_APP' } },
    create: { memberId: member.id, method: 'AUTHENTICATOR_APP', secretEncrypted: encryptSecret(secret), verified: false },
    update: { secretEncrypted: encryptSecret(secret), verified: false, lastStep: null },
  })

  return NextResponse.json({ qrDataUrl, secret, otpauthUri: uri })
}
