import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { isBlocklisted } from '@/lib/config/site'
import { requiredEnvMissing } from '@/lib/config/env'
import { seedCorePermissions } from '@/lib/permissions/check'
import { readBootstrapUserId, setBootstrapCookie, SETUP_LOCKED_OUT_MESSAGE } from '@/lib/setup/bootstrap-cookie'

const Body = z.object({
  username: z.string().min(2).max(32).regex(/^[a-z0-9_-]+$/, 'Username must be lowercase letters, numbers, underscores, or hyphens'),
  email: z.string().email(),
})

export async function POST(request: NextRequest) {
  // Guard: setup must not already be complete — unless all users were deleted
  // (recovery path after /api/setup/reset was called).
  const [cfg, existingUserCount] = await Promise.all([
    prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { setupCompleted: true } }),
    prisma.user.count(),
  ])
  if (cfg?.setupCompleted && existingUserCount > 0) {
    return NextResponse.json({ error: 'Setup is already complete' }, { status: 403 })
  }

  // Guard: required env vars must be set
  const missing = requiredEnvMissing()
  if (missing.length > 0) {
    return NextResponse.json({ error: `Missing required env vars: ${missing.join(', ')}` }, { status: 400 })
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { username, email } = parsed.data

  if (isBlocklisted(username)) {
    return NextResponse.json({ error: `Username "${username}" is reserved` }, { status: 400 })
  }

  // The browser that created the admin holds a signed setup-bootstrap cookie naming
  // that user (see lib/setup/bootstrap-cookie.ts). Without it, nobody gets to re-issue
  // the admin, wipe its passkeys or mint a second admin: knowing the email and username
  // is not proof of being the owner.
  const cookieUserId = await readBootstrapUserId()

  // Exact-match retry during partial setup: user was created but passkey registration
  // failed (e.g. Safari iCloud Keychain conflict). Return the existing userId so the
  // stable WebAuthn user handle from v0.1.16 is preserved, then clear any stale passkeys
  // so excludeCredentials is empty on the next attempt.
  const exactMatch = await prisma.user.findFirst({ where: { email, username } })
  if (exactMatch && !cfg?.setupCompleted) {
    if (cookieUserId !== exactMatch.id) {
      return NextResponse.json({ error: SETUP_LOCKED_OUT_MESSAGE }, { status: 403 })
    }
    await prisma.passkey.deleteMany({ where: { userId: exactMatch.id } })
    await setBootstrapCookie(exactMatch.id)
    return NextResponse.json({ userId: exactMatch.id })
  }

  // A protected-role (Admin) user already exists. Only the browser that made it may
  // change its details; everyone else is refused rather than getting a second Admin.
  const existingAdmin = await prisma.user.findFirst({
    where: { role: { isProtected: true } },
    select: { id: true },
  })
  if (existingAdmin) {
    if (cookieUserId !== existingAdmin.id) {
      return NextResponse.json({ error: SETUP_LOCKED_OUT_MESSAGE }, { status: 403 })
    }
    // The owner went back and changed their email or username: update the same
    // unfinished admin in place instead of leaving a credential-less orphan behind.
    const clash = await prisma.user.findFirst({
      where: { id: { not: existingAdmin.id }, OR: [{ email }, { username }] },
      select: { id: true },
    })
    if (clash) {
      return NextResponse.json({ error: 'Email or username already in use' }, { status: 409 })
    }
    await prisma.passkey.deleteMany({ where: { userId: existingAdmin.id } })
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: { email, username, totpSecretEncrypted: null, totpVerifiedAt: null, totpLastStep: null },
    })
    await setBootstrapCookie(existingAdmin.id)
    return NextResponse.json({ userId: existingAdmin.id })
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  })
  if (existing) {
    return NextResponse.json({ error: 'Email or username already in use' }, { status: 409 })
  }

  // Ensure the Admin role exists
  await seedCorePermissions()

  let adminRole = await prisma.role.findFirst({ where: { isProtected: true } })
  if (!adminRole) {
    adminRole = await prisma.role.create({
      data: { name: 'Admin', isProtected: true },
    })
  }

  // Admin account is exempt from email verification (setup is the trust signal)
  const user = await prisma.user.create({
    data: {
      email,
      username,
      roleId: adminRole.id,
      emailVerifiedAt: new Date(), // exempt
    },
  })

  await setBootstrapCookie(user.id)
  return NextResponse.json({ userId: user.id })
}
