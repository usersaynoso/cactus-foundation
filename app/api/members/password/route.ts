import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { deleteAllMemberSessions, getCurrentMemberSessionTokenHash, revokeAllMemberTrustedBrowsers, isCurrentMemberSessionFresh } from '@/lib/members/session'
import { getMemberAuthFromRequest, getMemberFromRequest } from '@/lib/members/api-auth'
import { requireStepUpGrant, spendStepUpGrant } from '@/lib/members/api-step-up'
import { hashPassword, verifyPassword, validateNewPassword } from '@/lib/auth/password'
import { checkAndRecord } from '@/lib/auth/rate-limit'
import { getMembersConfig, isAuthMethodEnabled, isAuthMethodRequired } from '@/lib/members/config'
import { notifyMemberSecurityAlert } from '@/lib/members/security-alerts'
import { isEmailConfigured } from '@/lib/config/env'

export async function GET(request: NextRequest) {
  const member = await getMemberFromRequest(request)
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const [password, twoFactor, config] = await Promise.all([
    prisma.memberPassword.findUnique({ where: { memberId: member.id } }),
    prisma.memberTwoFactor.findFirst({ where: { memberId: member.id, verified: true } }),
    getMembersConfig(),
  ])

  return NextResponse.json({
    hasPassword: !!password,
    hasTwoFactor: isEmailConfigured() || !!twoFactor,
    passwordsEnabled: isAuthMethodEnabled(config, 'PASSWORD'),
    passwordRequired: isAuthMethodRequired(config, 'PASSWORD'),
  })
}

const Body = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string(),
  signOutOtherSessions: z.boolean().optional(),
})

// From an app (a module token) adding or changing a password needs a step-up
// grant (lib/members/api-step-up.ts) as well as the current password: a token
// alone is not proof the member is the one holding the phone.
export async function POST(request: NextRequest) {
  const auth = await getMemberAuthFromRequest(request)
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { member } = auth

  const needsStepUp = await requireStepUpGrant(auth, request)
  if (needsStepUp) return needsStepUp

  const config = await getMembersConfig()
  if (!isAuthMethodEnabled(config, 'PASSWORD')) {
    return NextResponse.json({ error: 'Password sign-in is not enabled for this site' }, { status: 403 })
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const { currentPassword, newPassword } = parsed.data

  const existing = await prisma.memberPassword.findUnique({ where: { memberId: member.id } })
  // Adding a FIRST password plants a durable sign-in method, so it needs a
  // recent sign-in, exactly like adding a passkey. An app caller has no browser
  // session; its step-up grant above is its proof of a recent sign-in.
  if (auth.via === 'cookie' && !existing && !(await isCurrentMemberSessionFresh())) {
    return NextResponse.json(
      { error: 'For your security, please sign in again before adding a password.', reauthRequired: true },
      { status: 403 }
    )
  }
  if (existing) {
    if (!currentPassword) {
      return NextResponse.json({ error: 'Current password is required' }, { status: 400 })
    }
    // Guesses at the current password are counted, like any other step-up.
    const limit = await checkAndRecord('step_up', ['member:' + member.id])
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Too many attempts. Please wait a few minutes and try again.' }, { status: 429 })
    }
    const valid = await verifyPassword(currentPassword, existing.hash)
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }
  }

  const pwResult = await validateNewPassword(newPassword)
  if (!pwResult.valid) {
    return NextResponse.json({ error: pwResult.reason ?? 'Password is not strong enough' }, { status: 400 })
  }

  const spent = await spendStepUpGrant(auth, request)
  if (spent) return spent

  const hash = await hashPassword(newPassword)
  await prisma.memberPassword.upsert({
    where: { memberId: member.id },
    create: { memberId: member.id, hash },
    update: { hash },
  })

  // Always evict everyone else on a password change: revoke every other session
  // and every trusted browser, keeping only the current one. A trusted browser
  // otherwise bypasses OTP/2FA, so leaving one alive would defeat the change.
  // (signOutOtherSessions is still accepted for client compatibility but ignored.)
  // An app (module token) has no browser session of its own, so every browser
  // session goes; its own token, and the module's other device tokens, are the
  // module's business.
  const currentHash = auth.via === 'cookie' ? await getCurrentMemberSessionTokenHash() : null
  await deleteAllMemberSessions(member.id, currentHash ?? undefined)
  await revokeAllMemberTrustedBrowsers(member.id)

  await notifyMemberSecurityAlert(member, existing ? 'Your password was changed.' : 'A password was added to your account.')

  const twoFactor = await prisma.memberTwoFactor.findFirst({
    where: { memberId: member.id, verified: true },
  })
  return NextResponse.json({ ok: true, twoFactorRequired: !isEmailConfigured() && !twoFactor })
}

export async function DELETE(request: NextRequest) {
  const auth = await getMemberAuthFromRequest(request)
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { member } = auth

  const needsStepUp = await requireStepUpGrant(auth, request)
  if (needsStepUp) return needsStepUp

  // Same reasoning as removing a last passkey on a passkey-required site: the
  // setup gate would only ask for it straight back, so say why instead.
  const config = await getMembersConfig()
  if (isAuthMethodRequired(config, 'PASSWORD')) {
    return NextResponse.json(
      { error: 'This site requires a password on every account, so yours cannot be removed.' },
      { status: 400 }
    )
  }

  const spent = await spendStepUpGrant(auth, request)
  if (spent) return spent

  const { count } = await prisma.memberPassword.deleteMany({ where: { memberId: member.id } })
  // Told like every other change to how the account is signed in to: a password
  // quietly vanishing is exactly what an owner would want to hear about.
  if (count > 0) await notifyMemberSecurityAlert(member, 'The password was removed from your account.')
  return NextResponse.json({ ok: true })
}
