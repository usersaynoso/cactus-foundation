import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { syncToEdgeConfig } from '@/lib/config/edge-config'

const ENTIRE_SITE_CONDITIONS = {
  include: [{ type: 'entire_site' }],
  exclude: [],
}

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

  // Seed infoPage starter layouts
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
        type: 'Columns',
        props: {
          id: 'columns-header-1',
          ratio: '30/70',
          padding: 'none',
        },
      },
    ],
    zones: {
      'columns-header-1:left': [
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
      ],
      'columns-header-1:right': [
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

  // Seed header starter layout
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
    update: {
      builderData: starterHeaderData,
    },
  })

  // Seed footer starter layout
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
        root: {
          props: {
            bgColor: '',
            paddingY: 'md',
            borderTop: 'show',
            borderColor: '',
            maxWidth: '1200px',
          },
        },
        zones: {},
      },
    },
    update: {},
  })

  // Default design tokens - new palette format
  const defaultDesignTokens = {
    colours: [
      { name: 'Primary', hex: '#16a34a', darkHex: '#4ade80' },
      { name: 'Surface', hex: '#ffffff', darkHex: '#0f172a' },
    ],
    typography: {
      fontHeading: 'system-ui, sans-serif',
      fontBody: 'system-ui, sans-serif',
      h1Size: '2.5rem',
      h2Size: '1.875rem',
      h3Size: '1.5rem',
      bodySize: '1rem',
      bodyLineHeight: '1.75',
    },
    spacing: { base: 4 },
    radius: {
      small: '2px',
      medium: '6px',
      large: '9999px',
    },
    shadows: {
      subtle: '0 2px 8px rgba(0,0,0,0.08)',
      elevated: '0 4px 24px rgba(0,0,0,0.15)',
    },
  }

  await prisma.siteConfig.update({
    where: { id: 'singleton' },
    data: {
      setupCompleted: true,
      status: 'comingSoon',
      hideFromCrawlers: true,
      homepageId: homePage.id,
      mainMenuId: mainMenu.id,
      designTokens: defaultDesignTokens,
    },
  })

  // Mirror to Edge Config (non-fatal if credentials absent)
  await syncToEdgeConfig({
    adminPath: cfg.adminPath,
    siteStatus: 'comingSoon',
  }).catch(() => {})

  return NextResponse.json({ adminPath: cfg.adminPath })
}
