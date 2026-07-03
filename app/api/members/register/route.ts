// Public member registration. See MEMBERS_SPEC.md "Registration".
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getMembersConfig } from '@/lib/members/config'
import {
  isUsernameFormatValid,
  isUsernameAvailable,
  isEmailDomainAllowed,
  deriveInitialStatus,
  validateInviteToken,
  consumeInviteToken,
  sendVerificationEmail,
} from '@/lib/members/registration'
import { sendMagicLink } from '@/lib/members/magic-link'
import { verifyTurnstile } from '@/lib/auth/turnstile'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'
import { isEmailConfigured } from '@/lib/config/env'
import { notifyAdminMemberPendingApproval } from '@/lib/members/admin-notify'

const Body = z.object({
  email: z.string().email(),
  username: z.string().min(2).max(32),
  displayName: z.string().trim().max(80).optional(),
  turnstileToken: z.string().optional(),
  inviteToken: z.string().optional(),
  agreedToPolicy: z.boolean(),
})

export async function POST(request: NextRequest) {
  const config = await getMembersConfig()
  if (!config.enabled) {
    return NextResponse.json({ error: 'Member registration is not available' }, { status: 403 })
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const { email, displayName, turnstileToken, agreedToPolicy } = parsed.data
  const username = parsed.data.username.toLowerCase()
  const inviteToken = parsed.data.inviteToken?.trim()

  if (!agreedToPolicy) {
    return NextResponse.json({ error: 'You must accept the privacy policy to register' }, { status: 400 })
  }

  const ts = await verifyTurnstile(turnstileToken)
  if (!ts) {
    return NextResponse.json({ error: 'Bot check failed' }, { status: 400 })
  }

  const ip = await getClientIp(request)
  const rl = await checkAndRecord('member_register', [`ip:${ip}`])
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many registrations from this address. Try again later.' }, { status: 429 })
  }

  // Invite-only mode gates account creation on a valid, unused, unexpired invite.
  let invite: { id: string } | null = null
  if (config.registrationMode === 'INVITE_ONLY') {
    if (!inviteToken) {
      return NextResponse.json({ error: 'An invite is required to register' }, { status: 403 })
    }
    invite = await validateInviteToken(inviteToken)
    if (!invite) {
      return NextResponse.json({ error: 'This invite link is invalid or has expired' }, { status: 400 })
    }
  }

  if (!isEmailDomainAllowed(email, config)) {
    return NextResponse.json({ error: 'This email domain is not permitted to register' }, { status: 400 })
  }

  if (!isUsernameFormatValid(username)) {
    return NextResponse.json(
      { error: 'Usernames must be 2-32 characters: lowercase letters, numbers, hyphens and underscores only' },
      { status: 400 }
    )
  }
  if (!(await isUsernameAvailable(username))) {
    return NextResponse.json({ error: `Username "${username}" is not available` }, { status: 409 })
  }

  // Enumeration-safe: an existing email doesn't get a distinguishable error -
  // instead it's sent a sign-in link (if it can actually sign in) and the
  // response looks exactly like a fresh registration, so the API response
  // shape never reveals whether an email is already registered. Username
  // availability stays revealed above (a normal, expected part of picking a
  // handle - not the enumeration surface this addresses).
  const existing = await prisma.member.findUnique({
    where: { email },
    select: { id: true, status: true, username: true },
  })
  if (existing) {
    if (isEmailConfigured() && existing.status === 'ACTIVE') {
      const siteConfig = await prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { siteName: true } })
      await sendMagicLink(existing.id, email, siteConfig?.siteName ?? 'Cactus').catch(() => {})
    }
    // Same deterministic values a genuine new registration would get under
    // the current config - a fixed fake status here would itself become an
    // enumeration signal the moment emailVerificationRequired/registrationMode
    // differ from the defaults.
    const fakeRequireVerification = config.emailVerificationRequired && isEmailConfigured()
    const fakeStatus = deriveInitialStatus(fakeRequireVerification, config.registrationMode)
    return NextResponse.json({ status: fakeStatus, verifyEmailRequired: fakeRequireVerification })
  }

  const requireVerification = config.emailVerificationRequired && isEmailConfigured()
  const status = deriveInitialStatus(requireVerification, config.registrationMode)

  const member = await prisma.member.create({
    data: {
      email,
      username,
      displayName: displayName || null,
      status,
    },
  })

  if (invite) {
    await consumeInviteToken(invite.id, member.id)
  }

  const userAgent = request.headers.get('user-agent')
  await prisma.memberConsentRecord.create({
    data: {
      memberId: member.id,
      consentType: 'privacy_policy',
      granted: true,
      ipAddress: ip,
      userAgent,
    },
  })

  if (requireVerification) {
    const siteConfig = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { siteName: true },
    })
    await sendVerificationEmail(member.id, email, siteConfig?.siteName ?? 'Cactus')
  } else if (member.status === 'PENDING_APPROVAL' && config.notifyAdminOnPendingApproval) {
    await notifyAdminMemberPendingApproval(member.id, member.username).catch(() => {})
  }

  return NextResponse.json({
    status: member.status,
    verifyEmailRequired: requireVerification,
  })
}
