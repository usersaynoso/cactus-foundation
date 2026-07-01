import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { refreshStarterLayouts } from '@/lib/setup/starterLayouts'
import { upsertStylesInfoPage } from '@/lib/setup/stylesInfoPage'

async function seedStarterContent() {
  const homePage = await prisma.infoPage.upsert({
    where: { slug: 'home' },
    create: { slug: 'home', title: 'Home', body: '', status: 'published' },
    update: {},
  })

  const mainMenu = await prisma.menu.create({
    data: {
      name: 'Main Menu',
      items: { create: { type: 'PAGE', pageId: homePage.id, order: 0, parentId: null } },
    },
  })

  await refreshStarterLayouts(prisma)

  await upsertStylesInfoPage(prisma)

  await prisma.siteConfig.update({
    where: { id: 'singleton' },
    data: { homepageId: homePage.id, mainMenuId: mainMenu.id },
  })
}

export async function POST(req: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { deleteSetupData?: boolean } = {}
  try { body = await req.json() } catch { /* no body */ }
  const deleteSetupData = body.deleteSetupData ?? false

  if (deleteSetupData) {
    // Hard reset: wipe everything, preserve only adminPath for the setup wizard.
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

    await prisma.siteConfig.create({ data: { adminPath } })

    return NextResponse.json({ ok: true, redirectToSetup: true })
  }

  // Soft reset: wipe all content but keep the current admin user, their
  // role/permissions/passkeys/sessions, and the full SiteConfig.

  // Null out SiteConfig FK references before deleting the records they point to.
  await prisma.siteConfig.update({
    where: { id: 'singleton' },
    data: {
      homepageId: null,
      mainMenuId: null,
      privacyPolicyPageId: null,
      termsPageId: null,
      logoMediaId: null,
      faviconMediaId: null,
    },
  })

  // Clear all content and transient auth records. CASCADE handles any FK ordering.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "WebAuthnChallenge", "RateLimit",
      "MediaMigrationJob", "Media",
      "RecoveryRequest", "EmailChallenge", "TrustedDevice",
      "ModuleMigration", "DeployLock", "Module",
      "MenuItem", "Menu",
      "Layout", "InfoPage"
    RESTART IDENTITY CASCADE
  `)

  // Remove all users except the current admin, along with their sessions and passkeys.
  await prisma.session.deleteMany({ where: { userId: { not: user.id } } })
  await prisma.passkey.deleteMany({ where: { userId: { not: user.id } } })
  await prisma.user.deleteMany({ where: { id: { not: user.id } } })

  // Re-seed the full set of starter content (identical to a fresh install).
  await seedStarterContent()

  return NextResponse.json({ ok: true, redirectToSetup: false })
}
