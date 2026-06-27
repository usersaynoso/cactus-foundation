import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'

export async function POST() {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { adminPath: true },
  })
  if (!config?.adminPath) {
    return NextResponse.json({ error: 'Site config not found' }, { status: 500 })
  }
  const { adminPath } = config

  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "WebAuthnChallenge", "RateLimit",
      "MediaMigrationJob", "Media",
      "RecoveryRequest", "EmailChallenge", "TrustedDevice", "Session", "Passkey",
      "ModuleMigration", "DeployLock", "Module",
      "MenuItem", "Menu",
      "Layout", "InfoPage",
      "RolePermission", "Permission",
      "SiteConfig", "User", "Role"
    RESTART IDENTITY CASCADE
  `)

  // Re-insert the SiteConfig singleton so the setup wizard knows the admin path.
  // setupCompleted defaults to false, returning the site to fresh-install state.
  await prisma.siteConfig.create({
    data: { adminPath },
  })

  return NextResponse.json({ ok: true })
}
