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

  // Seed the default theme (Prickly)
  const existingTheme = await prisma.theme.findFirst()
  if (!existingTheme) {
    await prisma.theme.create({
      data: {
        name: 'Prickly',
        version: '1.0.0',
        isActive: true,
      },
    })
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

  // Seed default Header template — Flex row with SiteLogo left, MenuBlock right
  const headerBuilderData = {
    content: [
      {
        type: 'Flex',
        props: {
          id: 'Flex-header-row',
          direction: 'row',
          justify: 'between',
          align: 'center',
          gap: 'none',
          padding: 'none',
          wrap: 'nowrap',
        },
      },
    ],
    zones: {
      'Flex-header-row:items': [
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
            id: 'main-menu-1',
            menuId: mainMenu.id,
            menuName: 'Main Menu',
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
    root: { props: {} },
  }

  const headerTemplate = await prisma.pageTemplate.upsert({
    where: { id: 'seed-header' },
    create: {
      id: 'seed-header',
      name: 'Default Header',
      type: 'HEADER',
      status: 'published',
      builderData: headerBuilderData,
    },
    update: { builderData: headerBuilderData },
  })

  // Seed default Footer template (Copyright with common options pre-filled)
  const footerTemplate = await prisma.pageTemplate.upsert({
    where: { id: 'seed-footer' },
    create: {
      id: 'seed-footer',
      name: 'Default Footer',
      type: 'FOOTER',
      status: 'published',
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
              textColor: '#9ca3af',
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
        root: { props: {} },
        zones: {},
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
      headerTemplateId: headerTemplate.id,
      footerTemplateId: footerTemplate.id,
    },
  })

  // Mirror to Edge Config (non-fatal if credentials absent)
  await syncToEdgeConfig({
    adminPath: cfg.adminPath,
    siteStatus: 'comingSoon',
  }).catch(() => {})

  return NextResponse.json({ adminPath: cfg.adminPath })
}
