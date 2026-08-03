import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getMemberFromCookie } from '@/lib/members/session'
import { verifyPassword } from '@/lib/auth/password'
import {
  createMemberEmailChallenge,
  pendingMemberEmailChange,
  verifyMemberEmailChallenge,
} from '@/lib/members/email-challenge'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'
import { getMembersConfig, isAccountSectionEnabled } from '@/lib/members/config'
import { isEmailDomainAllowed } from '@/lib/members/registration'
import { sendMemberEmail } from '@/lib/email/templates'
import { notifyMemberSecurityAlert } from '@/lib/members/security-alerts'
import { recordMemberActivity } from '@/lib/members/activity'
import { isEmailConfigured } from '@/lib/config/env'

// A member changing their own sign-in address, in two steps and deliberately so
// (the staff-side twin is app/api/account/email/route.ts, and it learnt this the
// hard way): POST parks the requested address on a challenge row and posts a
// code to it, PUT applies the change only once that code comes back. The account
// keeps its current address throughout, so a typo costs nothing but a wasted
// email - rather than quietly moving every sign-in link and recovery code to a
// mailbox nobody can read.

const RequestBody = z.object({
  newEmail: z.string().trim().email(),
  currentPassword: z.string().optional(),
})

const ConfirmBody = z.object({
  code: z.string().min(1),
})

async function siteName(): Promise<string> {
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { siteName: true },
  })
  return config?.siteName ?? 'Cactus'
}

// An admin using the member area is signed in on their staff credentials, and
// the address on the Member row is a copy of the one on their User row. Letting
// them edit the copy would leave the two disagreeing about who they are, with
// staff sign-in still going to the old address - so this door is closed here and
// opened on the admin account page instead.
const ADMIN_LINKED_MESSAGE =
  'Your address comes from your staff account, so change it there instead - your account page in the admin area.'

// Case-insensitive: Postgres will happily hold "Bob@example.com" alongside
// "bob@example.com" as two different members, and every sign-in that followed
// would be a coin toss over which row it found.
async function emailTakenByAnother(email: string, memberId: string): Promise<boolean> {
  const clash = await prisma.member.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, NOT: { id: memberId } },
    select: { id: true },
  })
  return !!clash
}

export async function GET() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const config = await getMembersConfig()
  if (!isAccountSectionEnabled(config, 'security')) {
    return NextResponse.json({ error: 'This page is switched off for this site.' }, { status: 403 })
  }

  const [password, pending] = await Promise.all([
    prisma.memberPassword.findUnique({ where: { memberId: member.id }, select: { id: true } }),
    member.userId ? Promise.resolve(null) : pendingMemberEmailChange(member.id),
  ])

  return NextResponse.json({
    email: member.email,
    emailVerified: member.emailVerified,
    // Both reasons a member may not change it: an address managed by their
    // staff account, and a site with no way to send the confirmation code.
    canChange: !member.userId && isEmailConfigured(),
    reason: member.userId
      ? ADMIN_LINKED_MESSAGE
      : isEmailConfigured()
        ? null
        : 'This site cannot send email at the moment, so an address change cannot be confirmed.',
    requiresPassword: !!password,
    pendingEmail: pending,
  })
}

export async function POST(request: NextRequest) {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const config = await getMembersConfig()
  if (!isAccountSectionEnabled(config, 'security')) {
    return NextResponse.json({ error: 'This page is switched off for this site.' }, { status: 403 })
  }
  if (member.userId) {
    return NextResponse.json({ error: ADMIN_LINKED_MESSAGE }, { status: 403 })
  }
  if (!isEmailConfigured()) {
    return NextResponse.json(
      { error: 'This site cannot send email at the moment, so an address change cannot be confirmed.' },
      { status: 503 }
    )
  }

  const parsed = RequestBody.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
  const { newEmail, currentPassword } = parsed.data

  const ip = await getClientIp(request)
  const limit = await checkAndRecord('email_change', [`ip:${ip}`, `member:${member.id}`])
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
  }

  // Their password is the one thing an attacker sitting on a borrowed session
  // does not have. Members without one prove it the other way instead: the code
  // only ever lands in the new mailbox, and the old address is told either way.
  const password = await prisma.memberPassword.findUnique({ where: { memberId: member.id } })
  if (password) {
    if (!currentPassword) {
      return NextResponse.json({ error: 'Current password is required to change your email' }, { status: 400 })
    }
    if (!(await verifyPassword(currentPassword, password.hash))) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }
  }

  if (newEmail.toLowerCase() === member.email.toLowerCase()) {
    return NextResponse.json({ error: 'That is already your email address' }, { status: 400 })
  }
  if (!isEmailDomainAllowed(newEmail, config)) {
    return NextResponse.json({ error: 'This email domain is not permitted on this site' }, { status: 400 })
  }
  if (await emailTakenByAnother(newEmail, member.id)) {
    return NextResponse.json({ error: 'That email address is already in use' }, { status: 409 })
  }

  const name = await siteName()
  const code = await createMemberEmailChallenge(member.id, 'email_change', newEmail)

  try {
    await sendMemberEmail({ email: newEmail }, 'member.email-change-code', { siteName: name, code })
  } catch (error) {
    console.error('[members/email] confirmation code failed to send', error)
    return NextResponse.json({ error: 'We could not send the confirmation code. Please try again.' }, { status: 502 })
  }

  // Best effort: an old address that has stopped working is one of the reasons
  // somebody changes address in the first place, so it must not block the change.
  await sendMemberEmail({ email: member.email }, 'member.email-change-notice', {
    siteName: name,
    newEmail,
  }).catch(() => {})

  return NextResponse.json({ ok: true, pending: true, sentTo: newEmail })
}

export async function PUT(request: NextRequest) {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const config = await getMembersConfig()
  if (!isAccountSectionEnabled(config, 'security')) {
    return NextResponse.json({ error: 'This page is switched off for this site.' }, { status: 403 })
  }
  if (member.userId) {
    return NextResponse.json({ error: ADMIN_LINKED_MESSAGE }, { status: 403 })
  }

  const parsed = ConfirmBody.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const ip = await getClientIp(request)
  const limit = await checkAndRecord('email_code', [`ip:${ip}`, `member:${member.id}`])
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
  }

  const result = await verifyMemberEmailChallenge(member.id, 'email_change', parsed.data.code)
  if (!result.success) {
    if (result.reason === 'expired') {
      return NextResponse.json({ error: 'That code has expired. Please start again.' }, { status: 400 })
    }
    if (result.reason === 'max_attempts') {
      return NextResponse.json({ error: 'Too many incorrect codes. Please start again.' }, { status: 400 })
    }
    return NextResponse.json({ error: 'That code is not right' }, { status: 400 })
  }

  const newEmail = result.pendingEmail
  if (!newEmail) return NextResponse.json({ error: 'No email change was pending' }, { status: 400 })

  // Checked again here as well as at request time: another account could have
  // taken the address during the ten minutes the code was valid.
  if (await emailTakenByAnother(newEmail, member.id)) {
    return NextResponse.json({ error: 'That email address is already in use' }, { status: 409 })
  }

  const previousEmail = member.email

  // Verified by definition - the code only reaches somebody who can read that
  // mailbox - so marking it verified here is honest, and it keeps a member off
  // the "please verify your email" nudge for an address they just proved.
  await prisma.member.update({
    where: { id: member.id },
    data: { email: newEmail, emailVerified: true, emailVerifiedAt: new Date() },
  })

  await recordMemberActivity(member.id, 'email_changed', {
    metadata: { from: previousEmail, to: newEmail },
  })

  // To the address it moved away from, not the new one: whoever is reading the
  // new mailbox already knows, and the person who needs telling is the one who
  // has just lost the account if this was not them.
  await notifyMemberSecurityAlert(
    { email: previousEmail },
    `The email address on your account was changed to ${newEmail}.`
  )

  return NextResponse.json({ ok: true, email: newEmail })
}
