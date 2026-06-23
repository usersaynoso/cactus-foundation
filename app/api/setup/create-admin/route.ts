import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { isBlocklisted } from '@/lib/config/site'
import { requiredEnvMissing } from '@/lib/config/env'
import { seedCorePermissions } from '@/lib/permissions/check'

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

  return NextResponse.json({ userId: user.id })
}
