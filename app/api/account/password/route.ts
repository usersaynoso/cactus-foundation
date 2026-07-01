import { cookies } from 'next/headers'
import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie, deleteAllUserSessions } from '@/lib/auth/session'
import {
  hashPassword,
  verifyPassword,
  validateNewPassword,
} from '@/lib/auth/password'
import { sendPasswordChangedNotification } from '@/lib/email/index'
import { isEmailConfigured, getSessionSecret } from '@/lib/config/env'
import { errorResponse } from '@/lib/utils'

// GET: report whether a password is set and whether email is configured.
// The client uses this to render "Add" vs "Change", or a warning when email
// is off (the password fallback is useless without email to send the OTP).
export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  return NextResponse.json({
    hasPassword: !!user.passwordHash,
    emailConfigured: isEmailConfigured(),
  })
}

const Body = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string(),
  signOutOtherSessions: z.boolean().optional(),
})

// POST: add or change the signed-in user's password.
export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  // Defence in depth: a password without email is unusable, so refuse to set
  // one. Mirrors the login route's behaviour.
  if (!isEmailConfigured()) {
    return errorResponse('Password login is not available (email not configured)', 503)
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return errorResponse('Invalid input', 400)
  }
  const { currentPassword, newPassword, signOutOtherSessions } = parsed.data

  // Re-read the current hash from the DB; the session object may be stale.
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true, email: true },
  })
  if (!dbUser) return errorResponse('Not authenticated', 401)

  // Changing an existing password requires the current one.
  if (dbUser.passwordHash) {
    if (!currentPassword) {
      return errorResponse('Current password is required', 400)
    }
    const valid = await verifyPassword(currentPassword, dbUser.passwordHash)
    if (!valid) {
      return errorResponse('Current password is incorrect', 400)
    }
  }

  const pwResult = await validateNewPassword(newPassword)
  if (!pwResult.valid) {
    return errorResponse(pwResult.reason ?? 'Password is not strong enough', 400)
  }

  const passwordHash = await hashPassword(newPassword)
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })

  if (signOutOtherSessions) {
    const cookieStore = await cookies()
    const token = cookieStore.get('cactus_session')?.value ?? ''
    const currentHash = createHash('sha256').update(token + getSessionSecret()).digest('hex')
    await deleteAllUserSessions(user.id, currentHash)
  }

  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { siteName: true },
  })
  await sendPasswordChangedNotification(dbUser.email, config?.siteName ?? 'Cactus').catch(() => {})

  return NextResponse.json({ ok: true })
}
