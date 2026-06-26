import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { syncToEdgeConfig } from '@/lib/config/edge-config'

export async function POST() {
  const cfg = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { adminPath: true, setupCompleted: true },
  })

  if (cfg?.setupCompleted) {
    const userCount = await prisma.user.count()
    if (userCount > 0) {
      return NextResponse.json({ error: 'Setup is already complete' }, { status: 403 })
    }
  }

  if (!cfg?.adminPath) {
    return NextResponse.json({ error: 'Admin path not set' }, { status: 400 })
  }

  // Seed a default Home page and Main Menu
  const homePage = await prisma.infoPage.upsert({
    where: { slug: 'home' },
    create: { slug: 'home', title: 'Home', body: '', status: 'published' },
    update: {},
  })

  const mainMenu = await prisma.menu.create({
    data: {
      name: 'Main Menu',
      items: {
        create: { type: 'PAGE', pageId: homePage.id, order: 0, parentId: null },
      },
    },
  })

  // Default header config — logo left, main menu right, fixed layout
  const headerConfig = {
    bgMode: 'color',
    bgColor: 'var(--color-bg)',
    height: '64px',
    sticky: 'yes',
    borderBottom: 'show',
    borderColor: 'var(--color-border)',
    maxWidth: '1200px',
    logoHeight: 40,
    showTextWithLogo: 'false',
    logoHomeUrl: '/',
    itemFontSize: 'medium',
    itemFontWeight: 'medium',
    itemColor: '',
    showMobileToggle: 'collapse',
  }

  // Seed default footer builder data — Copyright block
  const footerBuilderData = {
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
          textColor: 'var(--color-muted)',
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
    root: {
      props: {
        bgColor: 'var(--color-bg-subtle)',
        paddingY: 'md',
        borderTop: 'show',
        borderColor: 'var(--color-border)',
        maxWidth: '1200px',
      },
    },
    zones: {},
  }

  // Seed starter layouts
  const fullWidthLayout = await prisma.layout.upsert({
    where: { id: 'starter-full-width' },
    create: {
      id: 'starter-full-width',
      name: 'Full Width',
      description: 'Content fills the full width. No constraints.',
      isStarter: true,
      status: 'published',
      builderData: { content: [{ type: 'ContentSlot', props: { id: 'content-slot-1' } }], root: { props: {} }, zones: {} },
    },
    update: {},
  })

  await prisma.layout.upsert({
    where: { id: 'starter-boxed' },
    create: {
      id: 'starter-boxed',
      name: 'Boxed',
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

  await prisma.siteConfig.update({
    where: { id: 'singleton' },
    data: {
      setupCompleted: true,
      status: 'comingSoon',
      hideFromCrawlers: true,
      homepageId: homePage.id,
      mainMenuId: mainMenu.id,
      headerConfig: headerConfig,
      footerBuilderData: footerBuilderData,
      defaultLayoutId: fullWidthLayout.id,
    },
  })

  // Mirror to Edge Config (non-fatal if credentials absent)
  await syncToEdgeConfig({
    adminPath: cfg.adminPath,
    siteStatus: 'comingSoon',
  }).catch(() => {})

  return NextResponse.json({ adminPath: cfg.adminPath })
}
