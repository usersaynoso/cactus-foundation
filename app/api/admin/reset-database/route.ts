import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'

const ENTIRE_SITE_CONDITIONS = {
  include: [{ type: 'entire_site' }],
  exclude: [],
}

const starterHeaderData = {
  root: {
    props: {
      bgMode: 'color',
      bgColor: '',
      height: '64px',
      sticky: 'yes',
      borderBottom: 'show',
      borderColor: '',
      maxWidth: '1200px',
    },
  },
  content: [
    {
      type: 'Flex',
      props: {
        id: 'flex-header-1',
        direction: 'row',
        justify: 'between',
        align: 'center',
        wrap: 'nowrap',
        gap: 'lg',
        padding: 'none',
      },
    },
  ],
  zones: {
    'flex-header-1:items': [
      {
        type: 'SiteLogo',
        props: {
          id: 'site-logo-1',
          homeUrl: '/',
          logoHeight: 40,
          showTextWithLogo: 'false',
          showIcon: 'true',
          textColor: '',
        },
      },
      {
        type: 'MenuBlock',
        props: {
          id: 'menu-block-1',
          menuId: '',
          menuName: '',
          orientation: 'horizontal',
          spacing: 'normal',
          itemFontSize: 'medium',
          itemFontWeight: 'medium',
          textTransform: 'none',
          itemColor: '',
          showDropdowns: 'hover',
          showMobileToggle: 'collapse',
        },
      },
    ],
  },
}

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

  await prisma.layout.upsert({
    where: { id: 'starter-full-width' },
    create: {
      id: 'starter-full-width',
      name: 'Full Width',
      type: 'infoPage',
      description: 'Content fills the full width. No constraints.',
      isStarter: true,
      status: 'published',
      displayConditions: ENTIRE_SITE_CONDITIONS,
      builderData: { content: [{ type: 'ContentSlot', props: { id: 'content-slot-1' } }], root: { props: {} }, zones: {} },
    },
    update: {},
  })

  await prisma.layout.upsert({
    where: { id: 'starter-boxed' },
    create: {
      id: 'starter-boxed',
      name: 'Boxed',
      type: 'infoPage',
      description: 'Centred content with standard max-width.',
      isStarter: true,
      status: 'published',
      builderData: {
        content: [{ type: 'Section', props: { id: 'section-1', paddingY: 'md', maxWidth: 'standard', bgType: 'none' } }],
        root: { props: {} },
        zones: { 'section-1:content': [{ type: 'ContentSlot', props: { id: 'content-slot-1' } }] },
      },
    },
    update: {},
  })

  await prisma.layout.upsert({
    where: { id: 'starter-sidebar-right' },
    create: {
      id: 'starter-sidebar-right',
      name: 'With Right Sidebar',
      type: 'infoPage',
      description: 'Main content (70%) with a sidebar on the right (30%).',
      isStarter: true,
      status: 'published',
      builderData: {
        content: [{ type: 'Columns', props: { id: 'columns-1', ratio: '70/30', padding: 'none' } }],
        root: { props: {} },
        zones: {
          'columns-1:left': [{ type: 'ContentSlot', props: { id: 'content-slot-1' } }],
          'columns-1:right': [],
        },
      },
    },
    update: {},
  })

  await prisma.layout.upsert({
    where: { id: 'starter-header' },
    create: {
      id: 'starter-header',
      name: 'Default Header',
      type: 'header',
      description: 'Logo left, navigation right.',
      isStarter: true,
      status: 'published',
      displayConditions: ENTIRE_SITE_CONDITIONS,
      builderData: starterHeaderData,
    },
    update: { builderData: starterHeaderData },
  })

  await prisma.layout.upsert({
    where: { id: 'starter-footer' },
    create: {
      id: 'starter-footer',
      name: 'Default Footer',
      type: 'footer',
      description: 'Simple copyright footer.',
      isStarter: true,
      status: 'published',
      displayConditions: ENTIRE_SITE_CONDITIONS,
      builderData: {
        content: [
          {
            type: 'Copyright',
            props: {
              id: 'copyright-1',
              prefix: '©',
              customPrefix: '',
              yearFormat: 'current',
              startYear: new Date().getFullYear(),
              showSiteName: 'true',
              suffix: '',
              alignment: 'center',
              fontSize: 'small',
              textColor: '',
              privacyPolicyUrl: '',
              privacyPolicyLabel: 'Privacy Policy',
              termsUrl: '',
              termsLabel: 'Terms of Service',
              customLink1Url: '',
              customLink1Label: '',
              customLink2Url: '',
              customLink2Label: '',
            },
          },
        ],
        root: { props: { bgColor: '', paddingY: 'md', borderTop: 'show', borderColor: '', maxWidth: '1200px' } },
        zones: {},
      },
    },
    update: {},
  })

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

  // Re-seed the default starter content (home page, main menu, layouts).
  await seedStarterContent()

  return NextResponse.json({ ok: true, redirectToSetup: false })
}
