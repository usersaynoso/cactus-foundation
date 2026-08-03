// Public member registration. See MEMBERS_SPEC.md "Registration".
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getMembersConfig, registrationPasswordPolicy } from '@/lib/members/config'
import { hashPassword, validateNewPassword } from '@/lib/auth/password'
import {
  isUsernameFormatValid,
  isUsernameAvailable,
  isEmailDomainAllowed,
  deriveInitialStatus,
  validateInviteToken,
  consumeInviteToken,
  sendVerificationEmail,
  generateUsernameFromEmail,
} from '@/lib/members/registration'
import { canResendVerification } from '@/lib/members/tokens'
import { sendMagicLink } from '@/lib/members/magic-link'
import { getOrCreateMembersRoleId } from '@/lib/members/default-role'
import { verifyTurnstile } from '@/lib/auth/turnstile'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'
import { isEmailConfigured } from '@/lib/config/env'
import { notifyAdminMemberPendingApproval } from '@/lib/members/admin-notify'

const Body = z.object({
  email: z.string().email(),
  // Optional in the schema because the site may not ask for one - see the
  // registrationCollectUsername branch below, which is what actually decides
  // whether a supplied value is required, honoured, or ignored outright.
  username: z.string().min(2).max(32).optional(),
  displayName: z.string().trim().max(80).optional(),
  // Same story: whether a password is asked for, insisted on, or ignored is
  // the registration form's password policy, checked below.
  password: z.string().optional(),
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
  const { email, turnstileToken, agreedToPolicy } = parsed.data
  // A hidden field is not a field: anything sent for one the site doesn't ask
  // for is dropped rather than trusted, so hiding the username picker actually
  // stops handles being chosen instead of merely hiding the box.
  const displayName = config.registrationCollectDisplayName ? parsed.data.displayName : undefined
  const suppliedUsername = config.registrationCollectUsername
    ? parsed.data.username?.toLowerCase()
    : undefined
  // The registration form's policy, not the site's: with the password box
  // switched off, a password sent anyway is dropped like any other hidden
  // field rather than quietly honoured.
  const passwordPolicy = registrationPasswordPolicy(config)
  const suppliedPassword = passwordPolicy === 'OFF' ? undefined : parsed.data.password
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

  if (config.registrationCollectUsername) {
    if (!suppliedUsername) {
      return NextResponse.json({ error: 'Choose a username' }, { status: 400 })
    }
    if (!isUsernameFormatValid(suppliedUsername)) {
      return NextResponse.json(
        { error: 'Usernames must be 2-32 characters: lowercase letters, numbers, hyphens and underscores only' },
        { status: 400 }
      )
    }
    if (!(await isUsernameAvailable(suppliedUsername))) {
      return NextResponse.json({ error: `Username "${suppliedUsername}" is not available` }, { status: 409 })
    }
  }

  // Deliberately settled before the existing-email lookup below. That branch
  // answers identically to a fresh registration so an address can't be probed
  // for; rejecting a weak password only on the fresh path would hand back the
  // difference the branch exists to hide.
  let passwordHash: string | null = null
  if (passwordPolicy === 'REQUIRED' && !suppliedPassword) {
    return NextResponse.json({ error: 'Choose a password' }, { status: 400 })
  }
  if (suppliedPassword) {
    const pwResult = await validateNewPassword(suppliedPassword)
    if (!pwResult.valid) {
      return NextResponse.json({ error: pwResult.reason ?? 'Password is not strong enough' }, { status: 400 })
    }
    passwordHash = await hashPassword(suppliedPassword)
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
    // verificationEmailSent has to mean the same thing on both branches or it
    // becomes the enumeration signal the rest of this branch exists to avoid,
    // so an existing account gets a real send too: a sign-in link if it can
    // sign in, or its verification link again if it never got one (which is
    // usually why someone is registering the same address twice).
    let emailSent = true
    if (isEmailConfigured()) {
      const siteConfig = await prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { siteName: true } })
      const siteName = siteConfig?.siteName ?? 'Cactus'
      if (existing.status === 'ACTIVE') {
        emailSent = await sendMagicLink(existing.id, email, siteName).then(
          () => true,
          (err: unknown) => {
            console.error('[members/register] sign-in link failed to send', err)
            return false
          }
        )
      } else if (existing.status === 'PENDING_VERIFICATION' && (await canResendVerification(existing.id))) {
        emailSent = await sendVerificationEmail(existing.id, email, siteName).then(
          () => true,
          (err: unknown) => {
            console.error('[members/register] verification email failed to send', err)
            return false
          }
        )
      }
    }
    // Same deterministic values a genuine new registration would get under
    // the current config - a fixed fake status here would itself become an
    // enumeration signal the moment emailVerificationRequired/registrationMode
    // differ from the defaults.
    const fakeRequireVerification = config.emailVerificationRequired && isEmailConfigured()
    const fakeStatus = deriveInitialStatus(fakeRequireVerification, config.registrationMode)
    return NextResponse.json({
      status: fakeStatus,
      verifyEmailRequired: fakeRequireVerification,
      verificationEmailSent: emailSent,
    })
  }

  const requireVerification = config.emailVerificationRequired && isEmailConfigured()
  const status = deriveInitialStatus(requireVerification, config.registrationMode)

  const roleId = await getOrCreateMembersRoleId()

  // Generated only once the address is known to be new - an existing email
  // returns above without ever burning a candidate handle.
  const username = suppliedUsername ?? (await generateUsernameFromEmail(email))

  const member = await prisma.member.create({
    data: {
      email,
      username,
      displayName: displayName || null,
      status,
      roleId,
      // Password sign-in also needs a second factor, which can only be enrolled
      // from inside the account - the setup gate asks for it on the way in.
      ...(passwordHash ? { password: { create: { hash: passwordHash } } } : {}),
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

  // The member row exists by this point, so a failed send is reported, not
  // thrown. Throwing turned a working sign-up into a 500 whose non-JSON body
  // surfaced in the browser as a parse error ("The string did not match the
  // expected pattern." in Safari), while the account sat unusable on
  // PENDING_VERIFICATION with no link ever sent and no way to tell why.
  let verificationEmailSent = true
  if (requireVerification) {
    const siteConfig = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { siteName: true },
    })
    try {
      await sendVerificationEmail(member.id, email, siteConfig?.siteName ?? 'Cactus')
    } catch (err) {
      console.error('[members/register] verification email failed to send', err)
      verificationEmailSent = false
    }
  } else if (member.status === 'PENDING_APPROVAL' && config.notifyAdminOnPendingApproval) {
    await notifyAdminMemberPendingApproval(member.id, member.username).catch(() => {})
  }

  return NextResponse.json({
    status: member.status,
    verifyEmailRequired: requireVerification,
    verificationEmailSent,
  })
}
