import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { verifyPassword } from '@/lib/auth/password'
import { createEmailChallenge, verifyEmailChallenge } from '@/lib/auth/email-challenge'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'
import { sendEmailChangeCode, sendEmailChangeNotice } from '@/lib/email'
import { errorResponse } from '@/lib/utils'

// Changing the sign-in address is a two-step affair, and deliberately so.
//
// POST parks the requested address on a challenge and posts a code to it. The
// account keeps its current address throughout. PUT applies the change, but only
// on the strength of a code that came back from the new address.
//
// Applying it immediately (which is what this route used to do) meant an address
// nobody had proved control of inherited the account - and inherited
// emailVerifiedAt with it. A typo silently moved sign-in codes and recovery links
// to a mailbox that did not exist, locking the real owner out of both.
const RequestBody = z.object({
  newEmail: z.string().email(),
  currentPassword: z.string().optional(),
})

const ConfirmBody = z.object({
  code: z.string().min(1),
})

async function siteName(): Promise<string> {
  const config = await prisma.siteConfig.findFirst({ select: { siteName: true } })
  return config?.siteName ?? 'Cactus'
}

export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const parsed = RequestBody.safeParse(await request.json())
  if (!parsed.success) return errorResponse('Invalid input', 400)
  const { newEmail, currentPassword } = parsed.data

  const ip = await getClientIp(request)
  const limit = await checkAndRecord('email_change', [`ip:${ip}`, `account:${user.id}`])
  if (!limit.allowed) return errorResponse('Too many attempts. Please try again later.', 429)

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true, email: true },
  })
  if (!dbUser) return errorResponse('Not authenticated', 401)

  if (dbUser.passwordHash) {
    if (!currentPassword) return errorResponse('Current password is required to change your email', 400)
    const valid = await verifyPassword(currentPassword, dbUser.passwordHash)
    if (!valid) return errorResponse('Current password is incorrect', 400)
  }

  if (newEmail.toLowerCase() === dbUser.email.toLowerCase()) {
    return errorResponse('That is already your email address', 400)
  }

  const conflict = await prisma.user.findFirst({
    where: { email: newEmail, NOT: { id: user.id } },
    select: { id: true },
  })
  if (conflict) return errorResponse('That email address is already in use', 409)

  const name = await siteName()
  const code = await createEmailChallenge(user.id, 'email_change', newEmail)

  await sendEmailChangeCode(newEmail, code, name)
  // Best effort: the old address being unreachable must not block an owner who
  // is changing address precisely because the old one has stopped working.
  try {
    await sendEmailChangeNotice(dbUser.email, newEmail, name)
  } catch {
    // Swallowed on purpose - the change is still gated on the new address.
  }

  return NextResponse.json({ ok: true, pending: true, sentTo: newEmail })
}

export async function PUT(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const parsed = ConfirmBody.safeParse(await request.json())
  if (!parsed.success) return errorResponse('Invalid input', 400)

  const ip = await getClientIp(request)
  const limit = await checkAndRecord('email_code', [`ip:${ip}`, `account:${user.id}`])
  if (!limit.allowed) return errorResponse('Too many attempts. Please try again later.', 429)

  const result = await verifyEmailChallenge(user.id, 'email_change', parsed.data.code)
  if (!result.success) {
    if (result.reason === 'expired') return errorResponse('That code has expired. Please start again.', 400)
    if (result.reason === 'max_attempts') return errorResponse('Too many incorrect codes. Please start again.', 400)
    return errorResponse('That code is not right', 400)
  }

  const newEmail = result.pendingEmail
  if (!newEmail) return errorResponse('No email change was pending', 400)

  // Re-check the clash here as well as at request time: another account could
  // have taken the address during the ten minutes the code was valid.
  const conflict = await prisma.user.findFirst({
    where: { email: newEmail, NOT: { id: user.id } },
    select: { id: true },
  })
  if (conflict) return errorResponse('That email address is already in use', 409)

  // The address is verified by definition - the code only reaches someone who can
  // read that mailbox - so it is honest to stamp emailVerifiedAt here rather than
  // leave the account showing as unverified.
  await prisma.user.update({
    where: { id: user.id },
    data: { email: newEmail, emailVerifiedAt: new Date() },
  })

  return NextResponse.json({ ok: true, email: newEmail })
}
