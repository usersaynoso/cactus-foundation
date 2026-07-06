import { prisma } from '@/lib/db/prisma'
import { moduleStarterLayouts } from '@/lib/setup/module-starter-layouts'

const ENTIRE_SITE_CONDITIONS  = { include: [{ type: 'entire_site' }],   exclude: [] }
const NOT_FOUND_CONDITIONS    = { include: [{ type: 'not_found' }],     exclude: [] }
const COMING_SOON_CONDITIONS  = { include: [{ type: 'coming_soon' }],   exclude: [] }
const MAINTENANCE_CONDITIONS  = { include: [{ type: 'maintenance' }],   exclude: [] }
const DRAFT_CONDITIONS        = { include: [],                           exclude: [] }

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

const split = (id: string, overrides?: Record<string, unknown>) => ({
  type: 'Split',
  props: { id, ratio: '50/50', align: 'stretch', gap: 'md', padding: 'none', ...overrides },
})

const group = (id: string, overrides?: Record<string, unknown>) => ({
  type: 'Group',
  props: { id, direction: 'row', justify: 'between', align: 'center', gap: 'md', padding: 'none', wrap: 'nowrap', ...overrides },
})

const copyright = (id: string, alignment = 'center') => ({
  type: 'Copyright',
  props: {
    id, prefix: '©', customPrefix: '', yearFormat: 'current',
    startYear: new Date().getFullYear(), showSiteName: 'true', suffix: '',
    alignment, fontSize: 'small',
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
    bg: { mode: 'gradient', color: '' }, bgImage: '', overlayColor: '', overlayOpacity: 0,
    layout: 'centered', imageUrl: '', textScheme: 'dark', minHeight: 'auto', padding: 'none',
    animationType: 'none', animationDuration: 'normal', animationDelay: 'none',
    ...overrides,
  },
})

const section = (id: string, overrides?: Record<string, unknown>) => ({
  type: 'Section',
  props: {
    id, bg: { mode: 'none', color: '' }, bgImage: '', bgSize: 'cover',
    overlayColor: '', overlayOpacity: 0, paddingY: 'lg', maxWidth: 'standard',
    textColor: '', sticky: 'off', stickyOffset: '0px', boxShadow: 'none',
    borderStyle: 'none', borderColor: 'var(--color-border)', borderWidth: '1px',
    borderRadius: 'none', opacity: '100',
    animationType: 'none', animationDuration: 'normal', animationDelay: 'none',
    ...overrides,
  },
})

const headerRoot = (overrides?: Record<string, unknown>) => ({
  props: {
    bg: { mode: 'color', color: 'var(--color-bg)' }, height: '64px', sticky: 'yes',
    border: { show: 'show', color: '' }, maxWidth: '1200px',
    ...overrides,
  },
})

const footerRoot = (overrides?: Record<string, unknown>) => ({
  props: {
    bgColor: '', paddingY: 'md', border: { show: 'show', color: '' }, maxWidth: '1200px',
    ...overrides,
  },
})

// ---------------------------------------------------------------------------
// Header template data (9 variants) — slot content stored inline in props
// ---------------------------------------------------------------------------

const starterHeaderData = {
  root: headerRoot(),
  content: [group('hr1', { gap: 'md', items: [logo('logo-1'), menu('menu-1')] })],
  zones: {},
}

const starterHeaderNavCentreData = {
  root: headerRoot(),
  content: [{ type: 'Grid', props: {
    id: 'header-grid', columns: '3', columnSizes: 'equal', gap: 'md', padding: 'none',
    verticalAlign: 'center', spaceBelow: 'none',
    col1Align: 'start', col2Align: 'center', col3Align: 'end',
    col1: [logo('logo-1')], col2: [menu('menu-1')], col3: [loginBtn('login-1')],
  } }],
  zones: {},
}

const starterHeaderLogoCentreData = {
  root: headerRoot(),
  content: [{ type: 'Grid', props: {
    id: 'header-grid', columns: '3', columnSizes: 'equal', gap: 'md', padding: 'none',
    verticalAlign: 'center', spaceBelow: 'none',
    col1Align: 'start', col2Align: 'center', col3Align: 'end',
    col1: [], col2: [logo('logo-1')], col3: [menu('menu-1')],
  } }],
  zones: {},
}

const starterHeaderFullWidthData = {
  root: headerRoot({ maxWidth: '1400px', border: { show: 'hide', color: '' } }),
  content: [group('hr1', { gap: 'md', items: [logo('logo-1'), menu('menu-1')] })],
  zones: {},
}

const starterHeaderLogoNameData = {
  root: headerRoot(),
  content: [group('hr1', { gap: 'md', items: [logo('logo-1', { showTextWithLogo: 'true' }), menu('menu-1')] })],
  zones: {},
}

const starterHeaderTallData = {
  root: headerRoot({ height: '80px' }),
  content: [{ type: 'Grid', props: {
    id: 'header-grid', columns: '3', columnSizes: 'equal', gap: 'md', padding: 'none',
    verticalAlign: 'center', spaceBelow: 'none',
    col1Align: 'start', col2Align: 'center', col3Align: 'end',
    col1: [logo('logo-1', { logoHeight: 48 })],
    col2: [menu('menu-1', { spacing: 'wide' })],
    col3: [group('actions-row', { justify: 'end', wrap: 'nowrap', gap: 'sm', items: [loginBtn('login-1'), themeToggle('toggle-1')] })],
  } }],
  zones: {},
}

const starterHeaderMinimalData = {
  root: headerRoot({ border: { show: 'hide', color: '' } }),
  content: [group('hr1', { justify: 'center', gap: 'md', items: [logo('logo-1')] })],
  zones: {},
}

const starterHeaderTransparentData = {
  root: headerRoot({ bg: { mode: 'transparent-scroll', color: '' }, border: { show: 'hide', color: '' } }),
  content: [group('hr1', { gap: 'md', items: [logo('logo-1'), menu('menu-1')] })],
  zones: {},
}

const starterHeaderCompactData = {
  root: headerRoot({ height: '48px' }),
  content: [group('hr1', { gap: 'md', items: [logo('logo-1', { logoHeight: 28 }), menu('menu-1', { itemFontSize: 'small' })] })],
  zones: {},
}

// ---------------------------------------------------------------------------
// Footer template data (4 variants) — slot content stored inline in props
// ---------------------------------------------------------------------------

const starterFooterData = {
  root: footerRoot(),
  content: [copyright('copyright-1', 'center')],
  zones: {},
}

const starterFooterLogoLinksData = {
  root: footerRoot({ paddingY: 'lg' }),
  content: [{ type: 'Grid', props: {
    id: 'footer-grid-2', columns: '2', columnSizes: '30-70', gap: 'lg', padding: 'none',
    verticalAlign: 'start', spaceBelow: 'none', col1Align: 'start', col2Align: 'start', col3Align: 'start', col4Align: 'start',
    col1: [logo('footer-logo', { logoHeight: 36, showTextWithLogo: 'true' })],
    col2: [
      menu('footer-menu', { orientation: 'horizontal', spacing: 'normal', itemFontSize: 'small', showMobileToggle: 'show' }),
      copyright('footer-copy', 'left'),
    ],
  } }],
  zones: {},
}

const starterFooterThreeColData = {
  root: footerRoot({ paddingY: 'lg' }),
  content: [{ type: 'Grid', props: {
    id: 'footer-grid', columns: '3', gap: 'lg', padding: 'none', columnSizes: 'equal',
    verticalAlign: 'start', spaceBelow: 'none', col1Align: 'start', col2Align: 'start', col3Align: 'start', col4Align: 'start',
    col1: [
      logo('footer-logo', { logoHeight: 36, showTextWithLogo: 'true' }),
      textBlock('footer-tagline', 'Your tagline or description goes here.'),
    ],
    col2: [
      heading('footer-nav-heading', 'Quick Links', { level: 'h4' }),
      menu('footer-menu', { orientation: 'vertical', spacing: 'tight', itemFontSize: 'small', showMobileToggle: 'show' }),
    ],
    col3: [
      heading('footer-social-heading', 'Follow Us', { level: 'h4' }),
      socialLinks('footer-social'),
      copyright('footer-copy', 'left'),
    ],
  } }],
  zones: {},
}

const starterFooterSocialData = {
  root: footerRoot(),
  content: [{ type: 'Grid', props: {
    id: 'footer-grid-4', columns: '2', columnSizes: '30-70', gap: 'lg', padding: 'none',
    verticalAlign: 'start', spaceBelow: 'none', col1Align: 'start', col2Align: 'start', col3Align: 'start', col4Align: 'start',
    col1: [logo('footer-logo', { logoHeight: 36, showTextWithLogo: 'true' })],
    col2: [
      socialLinks('footer-social', { layout: 'row' }),
      copyright('footer-copy', 'right'),
    ],
  } }],
  zones: {},
}

// ---------------------------------------------------------------------------
// Page layout template data (4 variants)
// ---------------------------------------------------------------------------

const starterFullWidthData = {
  content: [{ type: 'ContentSlot', props: { id: 'content-slot-1' } }],
  root: { props: {} },
  zones: {},
}

const starterBoxedData = {
  content: [section('section-1', {
    paddingY: 'md', maxWidth: 'standard', bg: { mode: 'none', color: '' },
    content: [{ type: 'ContentSlot', props: { id: 'content-slot-1' } }],
  })],
  root: { props: {} },
  zones: {},
}

// Split blocks correctly use zones (renderDropZone reads from zones)
const starterSidebarRightData = {
  content: [split('columns-1', { ratio: '70/30' })],
  root: { props: {} },
  zones: {
    'columns-1:left':  [{ type: 'ContentSlot', props: { id: 'content-slot-1' } }],
    'columns-1:right': [],
  },
}

const starterSidebarLeftData = {
  content: [split('columns-1', { ratio: '30/70' })],
  root: { props: {} },
  zones: {
    'columns-1:left':  [],
    'columns-1:right': [{ type: 'ContentSlot', props: { id: 'content-slot-1' } }],
  },
}

// ---------------------------------------------------------------------------
// 404 template data (3 variants)
// ---------------------------------------------------------------------------

const starter404HeroData = {
  root: { props: {} },
  content: [
    hero('hero-1', {
      heading: '404 — Page Not Found',
      subheading: 'Sorry, the page you were looking for does not exist.',
      ctaLabel: 'Go Home',
      ctaHref: '/',
      bg: { mode: 'gradient', color: '' },
      textScheme: 'dark',
      minHeight: 'full',
    }),
  ],
  zones: {},
}

const starter404MinimalData = {
  root: { props: {} },
  content: [section('section-1', {
    paddingY: 'xl', maxWidth: 'narrow',
    content: [
      heading('h-404', '404', { level: 'h2', align: 'center' }),
      textBlock('t-404', "The page you're looking for could not be found.", { align: 'center' }),
      buttonLink('btn-home', '← Back to Home', '/', 'outline'),
    ],
  })],
  zones: {},
}

const starter404BrandedData = {
  root: { props: {} },
  content: [
    hero('hero-1', {
      heading: 'Page Not Found',
      subheading: "We've looked everywhere and can't find that page. Let's get you back on track.",
      ctaLabel: 'Go Home',
      ctaHref: '/',
      cta2Label: 'Contact Us',
      cta2Href: '/contact',
      cta2Variant: 'outline',
      bg: { mode: 'gradient', color: '' },
      textScheme: 'dark',
      minHeight: 'half',
    }),
  ],
  zones: {},
}

// ---------------------------------------------------------------------------
// Status page template data (3 variants)
// ---------------------------------------------------------------------------

const starterStatusComingSoonData = {
  root: { props: {} },
  content: [
    hero('hero-1', {
      heading: 'Coming Soon',
      subheading: "We're working on something exciting. Check back shortly.",
      bg: { mode: 'gradient', color: '' },
      textScheme: 'dark',
      minHeight: 'full',
    }),
  ],
  zones: {},
}

const starterStatusMaintenanceData = {
  root: { props: {} },
  content: [section('section-1', {
    paddingY: 'xl', maxWidth: 'narrow',
    content: [
      logo('site-logo', { logoHeight: 48 }),
      heading('h-main', 'Down for Maintenance', { level: 'h2', align: 'center', padding: 'md' }),
      { type: 'Callout', props: { id: 'callout-1', type: 'warning', title: 'Scheduled Maintenance', body: "We're making some improvements. We'll be back shortly - thank you for your patience.", padding: 'none' } },
      textBlock('t-contact', 'Need urgent help? Get in touch via email.', { align: 'center', padding: 'md' }),
    ],
  })],
  zones: {},
}

const starterStatusMinimalData = {
  root: { props: {} },
  content: [section('section-1', {
    paddingY: 'xl', maxWidth: 'narrow',
    content: [
      logo('site-logo', { logoHeight: 48 }),
      heading('h-main', "We'll be right back.", { level: 'h2', align: 'center', padding: 'md' }),
      textBlock('t-sub', 'This site is temporarily unavailable. Please check back soon.', { align: 'center' }),
    ],
  })],
  zones: {},
}

// ---------------------------------------------------------------------------
// refreshStarterLayouts — upserts all starter layout templates
// ---------------------------------------------------------------------------

export async function refreshStarterLayouts(db: typeof prisma) {

  type Template = { id: string; name: string; description: string; data: any; conditions: typeof ENTIRE_SITE_CONDITIONS; status: 'published' | 'draft' }

  const headerTemplates: Template[] = [
    { id: 'starter-header',             name: 'Default Header',     description: 'Logo left, navigation right.',                                       data: starterHeaderData,            conditions: ENTIRE_SITE_CONDITIONS, status: 'published' },
    { id: 'starter-header-nav-centre',  name: 'Centred Navigation', description: 'Logo left, nav centred, login button right.',                        data: starterHeaderNavCentreData,   conditions: DRAFT_CONDITIONS,       status: 'draft' },
    { id: 'starter-header-logo-centre', name: 'Centred Logo',       description: 'Logo centred, navigation on the right.',                             data: starterHeaderLogoCentreData,  conditions: DRAFT_CONDITIONS,       status: 'draft' },
    { id: 'starter-header-full-width',  name: 'Full Width',         description: '1400px max-width, no border, logo left, nav right.',                 data: starterHeaderFullWidthData,   conditions: DRAFT_CONDITIONS,       status: 'draft' },
    { id: 'starter-header-logo-name',   name: 'Logo + Site Name',   description: 'Logo with site name visible, navigation right.',                     data: starterHeaderLogoNameData,    conditions: DRAFT_CONDITIONS,       status: 'draft' },
    { id: 'starter-header-tall',        name: 'Tall',               description: '80px height, logo left, nav centred, login and theme toggle right.',  data: starterHeaderTallData,        conditions: DRAFT_CONDITIONS,       status: 'draft' },
    { id: 'starter-header-minimal',     name: 'Logo Only',          description: 'Logo centred, no navigation.',                                       data: starterHeaderMinimalData,     conditions: DRAFT_CONDITIONS,       status: 'draft' },
    { id: 'starter-header-transparent', name: 'Transparent',        description: 'Transparent until scroll, logo left, nav right.',                    data: starterHeaderTransparentData, conditions: DRAFT_CONDITIONS,       status: 'draft' },
    { id: 'starter-header-compact',     name: 'Compact',            description: '48px height, logo left, small nav text right.',                      data: starterHeaderCompactData,     conditions: DRAFT_CONDITIONS,       status: 'draft' },
  ]

  for (const t of headerTemplates) {
    await db.layout.upsert({
      where: { id: t.id },
      create: { id: t.id, name: t.name, type: 'header', description: t.description, isStarter: true, status: t.status, displayConditions: t.conditions, builderData: t.data },
      update: { name: t.name, description: t.description, builderData: t.data, isStarter: true },
    })
  }

  const footerTemplates: Template[] = [
    { id: 'starter-footer',            name: 'Default Footer',    description: 'Simple centred copyright line.',                        data: starterFooterData,          conditions: ENTIRE_SITE_CONDITIONS, status: 'published' },
    { id: 'starter-footer-logo-links', name: 'Logo + Links',      description: 'Logo and tagline left, menu and copyright right.',      data: starterFooterLogoLinksData,  conditions: DRAFT_CONDITIONS,       status: 'draft' },
    { id: 'starter-footer-three-col',  name: 'Three Column',      description: 'Brand, navigation, and social links in three columns.', data: starterFooterThreeColData,  conditions: DRAFT_CONDITIONS,       status: 'draft' },
    { id: 'starter-footer-social',     name: 'With Social Links', description: 'Logo left, social icons and copyright right.',          data: starterFooterSocialData,    conditions: DRAFT_CONDITIONS,       status: 'draft' },
  ]

  for (const t of footerTemplates) {
    await db.layout.upsert({
      where: { id: t.id },
      create: { id: t.id, name: t.name, type: 'footer', description: t.description, isStarter: true, status: t.status, displayConditions: t.conditions, builderData: t.data },
      update: { name: t.name, description: t.description, builderData: t.data, isStarter: true },
    })
  }

  const pageTemplates: Template[] = [
    { id: 'starter-full-width',    name: 'Full Width',         description: 'Content fills the full width. No constraints.',             data: starterFullWidthData,    conditions: ENTIRE_SITE_CONDITIONS, status: 'published' },
    { id: 'starter-boxed',         name: 'Boxed',              description: 'Centred content with standard max-width.',                  data: starterBoxedData,        conditions: DRAFT_CONDITIONS,       status: 'draft' },
    { id: 'starter-sidebar-right', name: 'With Right Sidebar', description: 'Main content (70%) with a sidebar on the right (30%).',    data: starterSidebarRightData, conditions: DRAFT_CONDITIONS,       status: 'draft' },
    { id: 'starter-sidebar-left',  name: 'With Left Sidebar',  description: 'Sidebar on the left (30%) with main content right (70%).', data: starterSidebarLeftData,  conditions: DRAFT_CONDITIONS,       status: 'draft' },
  ]

  for (const t of pageTemplates) {
    await db.layout.upsert({
      where: { id: t.id },
      create: { id: t.id, name: t.name, type: 'infoPage', description: t.description, isStarter: true, status: t.status, displayConditions: t.conditions, builderData: t.data },
      update: { name: t.name, description: t.description, builderData: t.data, isStarter: true },
    })
  }

  const notFoundTemplates: Template[] = [
    { id: 'starter-404-hero',    name: 'Full Hero', description: 'Full-screen hero with heading and home button.',    data: starter404HeroData,    conditions: NOT_FOUND_CONDITIONS, status: 'published' },
    { id: 'starter-404-minimal', name: 'Minimal',   description: 'Simple centred heading, message, and back link.',  data: starter404MinimalData, conditions: DRAFT_CONDITIONS,     status: 'draft' },
    { id: 'starter-404-branded', name: 'Branded',   description: 'Hero with gradient, dual call-to-action buttons.', data: starter404BrandedData, conditions: DRAFT_CONDITIONS,     status: 'draft' },
  ]

  for (const t of notFoundTemplates) {
    await db.layout.upsert({
      where: { id: t.id },
      create: { id: t.id, name: t.name, type: 'notFound', description: t.description, isStarter: true, status: t.status, displayConditions: t.conditions, builderData: t.data },
      update: { name: t.name, description: t.description, builderData: t.data, isStarter: true },
    })
  }

  const statusTemplates: Template[] = [
    { id: 'starter-status-coming-soon', name: 'Coming Soon', description: 'Full-screen hero for a coming-soon page.',        data: starterStatusComingSoonData,  conditions: COMING_SOON_CONDITIONS, status: 'published' },
    { id: 'starter-status-maintenance', name: 'Maintenance',  description: 'Maintenance notice with logo and callout block.', data: starterStatusMaintenanceData, conditions: MAINTENANCE_CONDITIONS, status: 'published' },
    { id: 'starter-status-minimal',     name: 'Minimal',      description: 'Logo, heading, and brief message. Nothing more.', data: starterStatusMinimalData,     conditions: DRAFT_CONDITIONS,       status: 'draft' },
  ]

  for (const t of statusTemplates) {
    await db.layout.upsert({
      where: { id: t.id },
      create: { id: t.id, name: t.name, type: 'statusPage', description: t.description, isStarter: true, status: t.status, displayConditions: t.conditions, builderData: t.data },
      update: { name: t.name, description: t.description, builderData: t.data, isStarter: true },
    })
  }

  // Module-declared layout types (e.g. directoryCategory, gazetteEntry). These
  // seed as draft with no display conditions by default: most module pages
  // already have a fully-working hardcoded fallback, so installing this
  // feature must never silently change a live page's look without the site
  // owner opting in. A template may set publishByDefault when the module page
  // has no such fallback (e.g. Shop's index/checkout/confirmation, which are
  // Puck-only) - exactly one per type should do so, so the page keeps working
  // out of the box. Only affects first-time creation, never an existing row.
  for (const [layoutType, buildTemplates] of Object.entries(moduleStarterLayouts)) {
    const templates = buildTemplates()
    for (const t of templates as { id: string; name: string; description: string; data: any; publishByDefault?: boolean }[]) {
      const published = t.publishByDefault === true
      await db.layout.upsert({
        where: { id: t.id },
        create: { id: t.id, name: t.name, type: layoutType, description: t.description, isStarter: true, status: published ? 'published' : 'draft', displayConditions: published ? ENTIRE_SITE_CONDITIONS : DRAFT_CONDITIONS, builderData: t.data },
        update: { name: t.name, description: t.description, builderData: t.data, isStarter: true },
      })
    }
  }
}
