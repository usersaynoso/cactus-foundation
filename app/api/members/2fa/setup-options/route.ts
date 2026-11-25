import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { isCurrentMemberSessionFresh } from '@/lib/members/session'
import { getMemberAuthFromRequest } from '@/lib/members/api-auth'
import { requireStepUpGrant, spendStepUpGrant } from '@/lib/members/api-step-up'
import { generateTotpSecret, buildOtpauthUri, generateQrDataUrl } from '@/lib/auth/totp'
import { encryptSecret } from '@/lib/crypto/secrets'
import { createMemberEmailChallenge } from '@/lib/members/email-challenge'
import { isEmailConfigured } from '@/lib/config/env'
import { getMembersConfig, isAuthMethodEnabled } from '@/lib/members/config'

const Body = z.object({ method: z.enum(['EMAIL', 'AUTHENTICATOR_APP']) })

export async function POST(request: NextRequest) {
  const auth = await getMemberAuthFromRequest(request)
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { member } = auth

  // Step-up: enrolling a second factor is durable persistence and must not ride
  // a stale session. Require a recent authentication - or, from an app (a
  // module token, which has no sign-in moment), a step-up grant.
  if (auth.via === 'cookie') {
    if (!(await isCurrentMemberSessionFresh())) {
      return NextResponse.json(
        { error: 'For your security, please sign in again before setting up two-factor authentication.', reauthRequired: true },
        { status: 403 }
      )
    }
  } else {
    const needsStepUp = await requireStepUpGrant(auth, request)
    if (needsStepUp) return needsStepUp
  }

  // Codes are only ever asked for at password sign-in (passkeys and sign-in
  // links never use them), so with password sign-in off there is nothing for a
  // second step to protect. The security page stops offering it; this stops a
  // stray request setting one up anyway.
  if (!isAuthMethodEnabled(await getMembersConfig(), 'PASSWORD')) {
    return NextResponse.json(
      { error: 'Two-factor codes are only used with password sign-in, which is switched off on this site.' },
      { status: 400 }
    )
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  // The app's grant is spent here, on the step that plants something. The
  // verify step that follows is bound to what this one minted (a code to the
  // member's address, or an unverified secret), so it needs no second grant.
  const spent = await spendStepUpGrant(auth, request)
  if (spent) return spent

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
