import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { syncToEdgeConfig } from '@/lib/config/edge-config'
import { getSessionFromCookie } from '@/lib/auth/session'

const ENTIRE_SITE_CONDITIONS = {
  include: [{ type: 'entire_site' }],
  exclude: [],
}

// ---------------------------------------------------------------------------
// Shared block prop helpers
// ---------------------------------------------------------------------------

const logo = (id: string, overrides?: Record<string, unknown>) => ({
  type: 'SiteLogo',
  props: { id, homeUrl: '/', logoHeight: 40, showTextWithLogo: 'false', showIcon: 'true', textColor: '', ...overrides },
})

const menu = (id: string, overrides?: Record<string, unknown>) => ({
  type: 'MenuBlock',
  props: {
    id, menuId: '', menuName: '', orientation: 'horizontal', spacing: 'normal',
    itemFontSize: 'medium', itemFontWeight: 'medium', textTransform: 'none',
    itemColor: '', showDropdowns: 'hover', showMobileToggle: 'collapse',
    ...overrides,
  },
})

const loginBtn = (id: string) => ({
  type: 'LoginButton',
  props: { id, loginLabel: 'Sign in', registerLabel: 'Register' },
})

const themeToggle = (id: string) => ({
  type: 'ThemeToggle',
  props: { id },
})

const headerRow = (id: string, gap = 'md') => ({
  type: 'HeaderRow',
  props: { id, gap },
})

const columns = (id: string, ratio = '50/50') => ({
  type: 'Columns',
  props: { id, ratio, padding: 'none' },
})

const copyright = (id: string, alignment = 'center') => ({
  type: 'Copyright',
  props: {
    id, prefix: '©', customPrefix: '', yearFormat: 'current',
    startYear: new Date().getFullYear(), showSiteName: 'true', suffix: '',
    alignment, fontSize: 'small', textColor: '',
    privacyPolicyUrl: '', privacyPolicyLabel: 'Privacy Policy',
    termsUrl: '', termsLabel: 'Terms of Service',
    customLink1Url: '', customLink1Label: '',
    customLink2Url: '', customLink2Label: '',
  },
})

const socialLinks = (id: string, overrides?: Record<string, unknown>) => ({
  type: 'SocialLinks',
  props: {
    id,
    items: [
      { platform: 'twitter-x', url: '' },
      { platform: 'instagram', url: '' },
      { platform: 'linkedin', url: '' },
    ],
    iconSize: 'md', iconColor: '', layout: 'row', gap: 'normal',
    ...overrides,
  },
})

const heading = (id: string, text: string, overrides?: Record<string, unknown>) => ({
  type: 'Heading',
  props: {
    id, text, level: 'h2', align: 'left', color: 'dark', padding: 'none',
    animationType: 'none', animationDuration: 'normal', animationDelay: 'none',
    ...overrides,
  },
})

const textBlock = (id: string, content: string, overrides?: Record<string, unknown>) => ({
  type: 'TextBlock',
  props: { id, content, align: 'left', padding: 'none', ...overrides },
})

const buttonLink = (id: string, label: string, href: string, variant = 'primary') => ({
  type: 'ButtonLink',
  props: { id, label, href, variant, padding: 'md' },
})

const hero = (id: string, overrides?: Record<string, unknown>) => ({
  type: 'Hero',
  props: {
    id, heading: 'Welcome', subheading: '', ctaLabel: '', ctaHref: '',
    cta2Label: '', cta2Href: '', cta2Variant: 'outline',
    bgType: 'gradient', bgColor: '', bgImage: '', overlayColor: '', overlayOpacity: 0,
    layout: 'centered', imageUrl: '', textScheme: 'dark', minHeight: 'auto', padding: 'none',
    animationType: 'none', animationDuration: 'normal', animationDelay: 'none',
    ...overrides,
  },
})

const section = (id: string, overrides?: Record<string, unknown>) => ({
  type: 'Section',
  props: {
    id, bgType: 'none', bgColor: '', bgImage: '', bgSize: 'cover',
    overlayColor: '', overlayOpacity: 0, paddingY: 'lg', maxWidth: 'standard',
    textColor: '', sticky: 'off', stickyOffset: '0px', boxShadow: 'none',
    borderStyle: 'none', borderColor: 'var(--color-border)', borderWidth: '1px',
    borderRadius: 'none', opacity: '100',
    animationType: 'none', animationDuration: 'normal', animationDelay: 'none',
    ...overrides,
  },
})

// ---------------------------------------------------------------------------
// Header root props helpers
// ---------------------------------------------------------------------------

const headerRoot = (overrides?: Record<string, unknown>) => ({
  props: {
    bgMode: 'color', bgColor: '', height: '64px', sticky: 'yes',
    borderBottom: 'show', borderColor: '', maxWidth: '1200px',
    ...overrides,
  },
})

const footerRoot = (overrides?: Record<string, unknown>) => ({
  props: {
    bgColor: '', paddingY: 'md', borderTop: 'show', borderColor: '', maxWidth: '1200px',
    ...overrides,
  },
})

// ---------------------------------------------------------------------------
// Header template data (9 variants)
// ---------------------------------------------------------------------------

// 1. Default: logo left, nav right
const starterHeaderData = {
  root: headerRoot(),
  content: [headerRow('hr1', 'md')],
  zones: {
    'hr1:left':   [logo('logo-1')],
    'hr1:center': [],
    'hr1:right':  [menu('menu-1')],
  },
}

// 2. Centred navigation: logo left, nav centre, login right
const starterHeaderNavCentreData = {
  root: headerRoot(),
  content: [headerRow('hr1', 'lg')],
  zones: {
    'hr1:left':   [logo('logo-1')],
    'hr1:center': [menu('menu-1')],
    'hr1:right':  [loginBtn('login-1')],
  },
}

// 3. Centred logo: logo in centre, nav right
const starterHeaderLogoCentreData = {
  root: headerRoot(),
  content: [headerRow('hr1', 'lg')],
  zones: {
    'hr1:left':   [],
    'hr1:center': [logo('logo-1')],
    'hr1:right':  [menu('menu-1')],
  },
}

// 4. Full width: 1400px max, no border
const starterHeaderFullWidthData = {
  root: headerRoot({ maxWidth: '1400px', borderBottom: 'hide' }),
  content: [headerRow('hr1', 'md')],
  zones: {
    'hr1:left':   [logo('logo-1')],
    'hr1:center': [],
    'hr1:right':  [menu('menu-1')],
  },
}

// 5. Logo + site name visible
const starterHeaderLogoNameData = {
  root: headerRoot(),
  content: [headerRow('hr1', 'md')],
  zones: {
    'hr1:left':   [logo('logo-1', { showTextWithLogo: 'true' })],
    'hr1:center': [],
    'hr1:right':  [menu('menu-1')],
  },
}

// 6. Tall (80px): logo left, nav centre, login + toggle right
const starterHeaderTallData = {
  root: headerRoot({ height: '80px' }),
  content: [headerRow('hr1', 'lg')],
  zones: {
    'hr1:left':   [logo('logo-1', { logoHeight: 48 })],
    'hr1:center': [menu('menu-1', { spacing: 'wide' })],
    'hr1:right':  [columns('actions-cols', '50/50')],
    'actions-cols:left':  [loginBtn('login-1')],
    'actions-cols:right': [themeToggle('toggle-1')],
  },
}

// 7. Logo only (minimal, no nav)
const starterHeaderMinimalData = {
  root: headerRoot({ borderBottom: 'hide' }),
  content: [headerRow('hr1', 'md')],
  zones: {
    'hr1:left':   [],
    'hr1:center': [logo('logo-1')],
    'hr1:right':  [],
  },
}

// 8. Transparent (fades to solid on scroll)
const starterHeaderTransparentData = {
  root: headerRoot({ bgMode: 'transparent-scroll', borderBottom: 'hide' }),
  content: [headerRow('hr1', 'md')],
  zones: {
    'hr1:left':   [logo('logo-1')],
    'hr1:center': [],
    'hr1:right':  [menu('menu-1')],
  },
}

// 9. Compact (48px, small nav text)
const starterHeaderCompactData = {
  root: headerRoot({ height: '48px' }),
  content: [headerRow('hr1', 'md')],
  zones: {
    'hr1:left':   [logo('logo-1', { logoHeight: 28 })],
    'hr1:center': [],
    'hr1:right':  [menu('menu-1', { itemFontSize: 'small' })],
  },
}

// ---------------------------------------------------------------------------
// Footer template data (4 variants)
// ---------------------------------------------------------------------------

// 1. Default: centred copyright line
const starterFooterData = {
  root: footerRoot(),
  content: [copyright('copyright-1', 'center')],
  zones: {},
}

// 2. Logo left, menu + copyright right
const starterFooterLogoLinksData = {
  root: footerRoot({ paddingY: 'lg' }),
  content: [columns('footer-cols', '30/70')],
  zones: {
    'footer-cols:left': [
      logo('footer-logo', { logoHeight: 36, showTextWithLogo: 'true' }),
    ],
    'footer-cols:right': [
      menu('footer-menu', { orientation: 'horizontal', spacing: 'normal', itemFontSize: 'small', showMobileToggle: 'show' }),
      copyright('footer-copy', 'left'),
    ],
  },
}

// 3. Three-column grid: brand | nav | social
const starterFooterThreeColData = {
  root: footerRoot({ paddingY: 'lg' }),
  content: [
    { type: 'Grid', props: { id: 'footer-grid', columns: '3', gap: 'lg', padding: 'none', columnSizes: 'equal', verticalAlign: 'start', spaceBelow: 'none', col1Align: 'start', col2Align: 'start', col3Align: 'start', col4Align: 'start' } },
  ],
  zones: {
    'footer-grid:col1': [
      logo('footer-logo', { logoHeight: 36, showTextWithLogo: 'true' }),
      textBlock('footer-tagline', 'Your tagline or description goes here.'),
    ],
    'footer-grid:col2': [
      heading('footer-nav-heading', 'Quick Links', { level: 'h4' }),
      menu('footer-menu', { orientation: 'vertical', spacing: 'tight', itemFontSize: 'small', showMobileToggle: 'show' }),
    ],
    'footer-grid:col3': [
      heading('footer-social-heading', 'Follow Us', { level: 'h4' }),
      socialLinks('footer-social'),
      copyright('footer-copy', 'left'),
    ],
  },
}

// 4. Logo left, social + copyright right
const starterFooterSocialData = {
  root: footerRoot(),
  content: [columns('footer-cols', '30/70')],
  zones: {
    'footer-cols:left': [
      logo('footer-logo', { logoHeight: 36, showTextWithLogo: 'true' }),
    ],
    'footer-cols:right': [
      socialLinks('footer-social', { layout: 'row' }),
      copyright('footer-copy', 'right'),
    ],
  },
}

// ---------------------------------------------------------------------------
// Page layout template data (4 variants — 3 existing + 1 new)
// ---------------------------------------------------------------------------

const starterFullWidthData = {
  content: [{ type: 'ContentSlot', props: { id: 'content-slot-1' } }],
  root: { props: {} },
  zones: {},
}

const starterBoxedData = {
  content: [section('section-1', { paddingY: 'md', maxWidth: 'standard', bgType: 'none' })],
  root: { props: {} },
  zones: { 'section-1:content': [{ type: 'ContentSlot', props: { id: 'content-slot-1' } }] },
}

const starterSidebarRightData = {
  content: [columns('columns-1', '70/30')],
  root: { props: {} },
  zones: {
    'columns-1:left':  [{ type: 'ContentSlot', props: { id: 'content-slot-1' } }],
    'columns-1:right': [],
  },
}

const starterSidebarLeftData = {
  content: [columns('columns-1', '30/70')],
  root: { props: {} },
  zones: {
    'columns-1:left':  [],
    'columns-1:right': [{ type: 'ContentSlot', props: { id: 'content-slot-1' } }],
  },
}

// ---------------------------------------------------------------------------
// 404 template data (3 variants)
// ---------------------------------------------------------------------------

// 1. Full-hero 404
const starter404HeroData = {
  root: { props: {} },
  content: [
    hero('hero-1', {
      heading: '404 — Page Not Found',
      subheading: 'Sorry, the page you were looking for does not exist.',
      ctaLabel: 'Go Home',
      ctaHref: '/',
      bgType: 'gradient',
      textScheme: 'dark',
      minHeight: 'full',
    }),
  ],
  zones: {},
}

// 2. Minimal: section with heading + text + button
const starter404MinimalData = {
  root: { props: {} },
  content: [section('section-1', { paddingY: 'xl', maxWidth: 'narrow' })],
  zones: {
    'section-1:content': [
      heading('h-404', '404', { level: 'h2', align: 'center' }),
      textBlock('t-404', 'The page you\'re looking for could not be found.', { align: 'center' }),
      buttonLink('btn-home', '← Back to Home', '/', 'outline'),
    ],
  },
}

// 3. Branded hero with dual CTA
const starter404BrandedData = {
  root: { props: {} },
  content: [
    hero('hero-1', {
      heading: 'Page Not Found',
      subheading: 'We\'ve looked everywhere and can\'t find that page. Let\'s get you back on track.',
      ctaLabel: 'Go Home',
      ctaHref: '/',
      cta2Label: 'Contact Us',
      cta2Href: '/contact',
      cta2Variant: 'outline',
      bgType: 'gradient',
      textScheme: 'dark',
      minHeight: 'half',
    }),
  ],
  zones: {},
}

// ---------------------------------------------------------------------------
// Status page template data (3 variants)
// ---------------------------------------------------------------------------

// 1. Coming soon hero
const starterStatusComingSoonData = {
  root: { props: {} },
  content: [
    hero('hero-1', {
      heading: 'Coming Soon',
      subheading: 'We\'re working on something exciting. Check back shortly.',
      bgType: 'gradient',
      textScheme: 'dark',
      minHeight: 'full',
    }),
  ],
  zones: {},
}

// 2. Maintenance mode with callout
const starterStatusMaintenanceData = {
  root: { props: {} },
  content: [section('section-1', { paddingY: 'xl', maxWidth: 'narrow' })],
  zones: {
    'section-1:content': [
      logo('site-logo', { logoHeight: 48 }),
      heading('h-main', 'Down for Maintenance', { level: 'h2', align: 'center', padding: 'md' }),
      { type: 'Callout', props: { id: 'callout-1', type: 'warning', title: 'Scheduled Maintenance', body: 'We\'re making some improvements. We\'ll be back shortly — thank you for your patience.', padding: 'none' } },
      textBlock('t-contact', 'Need urgent help? Get in touch via email.', { align: 'center', padding: 'md' }),
    ],
  },
}

// 3. Minimal status page
const starterStatusMinimalData = {
  root: { props: {} },
  content: [section('section-1', { paddingY: 'xl', maxWidth: 'narrow' })],
  zones: {
    'section-1:content': [
      logo('site-logo', { logoHeight: 48 }),
      heading('h-main', 'We\'ll be right back.', { level: 'h2', align: 'center', padding: 'md' }),
      textBlock('t-sub', 'This site is temporarily unavailable. Please check back soon.', { align: 'center' }),
    ],
  },
}

// ---------------------------------------------------------------------------
// refreshStarterLayouts — called on initial setup AND by admin refresh button
// ---------------------------------------------------------------------------

async function refreshStarterLayouts(db: typeof prisma) {
  // ── Header templates (9) ─────────────────────────────────────────────────
  const headerTemplates = [
    { id: 'starter-header',             name: 'Default Header',       description: 'Logo left, navigation right.',                     data: starterHeaderData },
    { id: 'starter-header-nav-centre',  name: 'Centred Navigation',   description: 'Logo left, nav centred, login button right.',       data: starterHeaderNavCentreData },
    { id: 'starter-header-logo-centre', name: 'Centred Logo',         description: 'Logo centred, navigation on the right.',            data: starterHeaderLogoCentreData },
    { id: 'starter-header-full-width',  name: 'Full Width',           description: '1400px max-width, no border, logo left, nav right.', data: starterHeaderFullWidthData },
    { id: 'starter-header-logo-name',   name: 'Logo + Site Name',     description: 'Logo with site name visible, navigation right.',    data: starterHeaderLogoNameData },
    { id: 'starter-header-tall',        name: 'Tall',                 description: '80px height, logo left, nav centred, login and theme toggle right.', data: starterHeaderTallData },
    { id: 'starter-header-minimal',     name: 'Logo Only',            description: 'Logo centred, no navigation.',                     data: starterHeaderMinimalData },
    { id: 'starter-header-transparent', name: 'Transparent',          description: 'Transparent until scroll, logo left, nav right.',  data: starterHeaderTransparentData },
    { id: 'starter-header-compact',     name: 'Compact',              description: '48px height, logo left, small nav text right.',    data: starterHeaderCompactData },
  ]

  for (const t of headerTemplates) {
    await db.layout.upsert({
      where: { id: t.id },
      create: {
        id: t.id, name: t.name, type: 'header', description: t.description,
        isStarter: true, status: 'published',
        displayConditions: ENTIRE_SITE_CONDITIONS,
        builderData: t.data,
      },
      update: { builderData: t.data },
    })
  }

  // ── Footer templates (4) ─────────────────────────────────────────────────
  const footerTemplates = [
    { id: 'starter-footer',             name: 'Default Footer',       description: 'Simple centred copyright line.',                   data: starterFooterData },
    { id: 'starter-footer-logo-links',  name: 'Logo + Links',         description: 'Logo and tagline left, menu and copyright right.', data: starterFooterLogoLinksData },
    { id: 'starter-footer-three-col',   name: 'Three Column',         description: 'Brand, navigation, and social links in three columns.', data: starterFooterThreeColData },
    { id: 'starter-footer-social',      name: 'With Social Links',    description: 'Logo left, social icons and copyright right.',     data: starterFooterSocialData },
  ]

  for (const t of footerTemplates) {
    await db.layout.upsert({
      where: { id: t.id },
      create: {
        id: t.id, name: t.name, type: 'footer', description: t.description,
        isStarter: true, status: 'published',
        displayConditions: ENTIRE_SITE_CONDITIONS,
        builderData: t.data,
      },
      update: { builderData: t.data },
    })
  }

  // ── Page layout templates (4) ────────────────────────────────────────────
  const pageTemplates = [
    { id: 'starter-full-width',    name: 'Full Width',          description: 'Content fills the full width. No constraints.',             data: starterFullWidthData },
    { id: 'starter-boxed',         name: 'Boxed',               description: 'Centred content with standard max-width.',                  data: starterBoxedData },
    { id: 'starter-sidebar-right', name: 'With Right Sidebar',  description: 'Main content (70%) with a sidebar on the right (30%).',    data: starterSidebarRightData },
    { id: 'starter-sidebar-left',  name: 'With Left Sidebar',   description: 'Sidebar on the left (30%) with main content right (70%).', data: starterSidebarLeftData },
  ]

  for (const t of pageTemplates) {
    await db.layout.upsert({
      where: { id: t.id },
      create: {
        id: t.id, name: t.name, type: 'infoPage', description: t.description,
        isStarter: true, status: 'published',
        displayConditions: ENTIRE_SITE_CONDITIONS,
        builderData: t.data,
      },
      update: { builderData: t.data },
    })
  }

  // ── 404 templates (3) ────────────────────────────────────────────────────
  const notFoundTemplates = [
    { id: 'starter-404-hero',    name: 'Full Hero',  description: 'Full-screen hero with heading and home button.',          data: starter404HeroData },
    { id: 'starter-404-minimal', name: 'Minimal',    description: 'Simple centred heading, message, and back link.',         data: starter404MinimalData },
    { id: 'starter-404-branded', name: 'Branded',    description: 'Hero with gradient, dual call-to-action buttons.',        data: starter404BrandedData },
  ]

  for (const t of notFoundTemplates) {
    await db.layout.upsert({
      where: { id: t.id },
      create: {
        id: t.id, name: t.name, type: 'notFound', description: t.description,
        isStarter: true, status: 'published',
        displayConditions: ENTIRE_SITE_CONDITIONS,
        builderData: t.data,
      },
      update: { builderData: t.data },
    })
  }

  // ── Status page templates (3) ────────────────────────────────────────────
  const statusTemplates = [
    { id: 'starter-status-coming-soon',  name: 'Coming Soon',   description: 'Full-screen hero for a coming-soon page.',         data: starterStatusComingSoonData },
    { id: 'starter-status-maintenance',  name: 'Maintenance',   description: 'Maintenance notice with logo and callout block.',  data: starterStatusMaintenanceData },
    { id: 'starter-status-minimal',      name: 'Minimal',       description: 'Logo, heading, and brief message. Nothing more.', data: starterStatusMinimalData },
  ]

  for (const t of statusTemplates) {
    await db.layout.upsert({
      where: { id: t.id },
      create: {
        id: t.id, name: t.name, type: 'statusPage', description: t.description,
        isStarter: true, status: 'published',
        displayConditions: ENTIRE_SITE_CONDITIONS,
        builderData: t.data,
      },
      update: { builderData: t.data },
    })
  }
}

export async function POST() {
  const cfg = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { adminPath: true, setupCompleted: true },
  })

  if (cfg?.setupCompleted) {
    const userCount = await prisma.user.count()
    if (userCount > 0) {
      // Allow authenticated admins to refresh starter layout templates
      const session = await getSessionFromCookie().catch(() => null)
      if (!session) {
        return NextResponse.json({ error: 'Setup is already complete' }, { status: 403 })
      }
      await refreshStarterLayouts(prisma)
      return NextResponse.json({ templatesRefreshed: true })
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

  // Seed all starter layout templates
  await refreshStarterLayouts(prisma)

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
