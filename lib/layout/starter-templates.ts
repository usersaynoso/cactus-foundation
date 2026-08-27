// Starter layout templates — the single source of truth.
//
// Starters are in-code templates, not database rows. They are offered when the
// site owner creates a new layout (see app/cactus-admin/layouts/new/page.tsx),
// which copies the chosen template's `data` into a brand new, fully editable
// Layout. Nothing here is ever seeded as a read-only row.
//
// The one exception is `publishByDefault`: a site needs a working header, footer,
// page shell and status screens out of the box, so those templates get a single
// editable `<id>-live` Layout seeded - the core ones at setup, a module's own when
// the module is installed. That is the ONLY thing lib/setup/starterLayouts.ts writes.
//
// This file must stay free of server-only imports (prisma, next/headers, …):
// the admin's new-layout picker imports it directly in the browser.

import { moduleStarterLayouts, moduleLayoutStarterContributions } from '@/lib/setup/module-starter-layouts'
import { moduleLayoutTypeToGroup } from '@/lib/layout/module-layout-types'

export type StarterBlock = { type: string; props: Record<string, unknown> }

export type StarterData = {
  content: StarterBlock[]
  root: { props: Record<string, unknown> }
  zones: Record<string, StarterBlock[]>
}

export type DisplayConditions = {
  include: Array<{ type: string; value?: string }>
  exclude: Array<{ type: string; value?: string }>
}

export type StarterTemplate = {
  id: string
  name: string
  description: string
  data: StarterData
  /** Seeds an editable `<id>-live` Layout, published, on a fresh install. */
  publishByDefault?: boolean
  /** Conditions for that seeded copy. Defaults to entire_site. */
  defaultConditions?: DisplayConditions
}

export const ENTIRE_SITE_CONDITIONS: DisplayConditions = { include: [{ type: 'entire_site' }], exclude: [] }
export const NOT_FOUND_CONDITIONS: DisplayConditions   = { include: [{ type: 'not_found' }],   exclude: [] }
export const COMING_SOON_CONDITIONS: DisplayConditions = { include: [{ type: 'coming_soon' }], exclude: [] }
export const MAINTENANCE_CONDITIONS: DisplayConditions = { include: [{ type: 'maintenance' }], exclude: [] }

// ---------------------------------------------------------------------------
// Block prop helpers
// ---------------------------------------------------------------------------

const logo = (id: string, overrides?: Record<string, unknown>): StarterBlock => ({
  type: 'SiteLogo',
  props: { id, homeUrl: '/', logoHeight: 40, showTextWithLogo: 'false', showIcon: 'true', textColor: '', ...overrides },
})

const menu = (id: string, overrides?: Record<string, unknown>): StarterBlock => ({
  type: 'MenuBlock',
  props: {
    id, menuId: '', menuName: '', orientation: 'horizontal', spacing: 'normal',
    itemFontSize: 'medium', itemFontWeight: 'medium', textTransform: 'none',
    itemColor: '', showDropdowns: 'hover', navToggle: { desktop: 'show', tablet: 'collapse', mobile: 'collapse' },
    ...overrides,
  },
})

const loginBtn = (id: string): StarterBlock => ({
  type: 'LoginButton',
  props: { id, loginLabel: 'Sign in', registerLabel: 'Register' },
})

const themeToggle = (id: string): StarterBlock => ({ type: 'ThemeToggle', props: { id } })

const split = (id: string, overrides?: Record<string, unknown>): StarterBlock => ({
  type: 'Split',
  props: { id, ratio: '50/50', align: 'stretch', gap: 'md', padding: 'none', ...overrides },
})

const group = (id: string, overrides?: Record<string, unknown>): StarterBlock => ({
  type: 'Group',
  props: { id, direction: 'row', justify: 'between', align: 'center', gap: 'md', padding: 'none', wrap: 'nowrap', ...overrides },
})

const copyright = (id: string, alignment = 'center'): StarterBlock => ({
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

const socialLinks = (id: string, overrides?: Record<string, unknown>): StarterBlock => ({
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

const heading = (id: string, text: string, overrides?: Record<string, unknown>): StarterBlock => ({
  type: 'Heading',
  props: {
    id, text, level: 'h2', align: 'left', color: 'dark', padding: 'none',
    animationType: 'none', animationDuration: 'normal', animationDelay: 'none',
    ...overrides,
  },
})

const textBlock = (id: string, content: string, overrides?: Record<string, unknown>): StarterBlock => ({
  type: 'TextBlock',
  props: { id, content, align: 'left', padding: 'none', ...overrides },
})

const buttonLink = (id: string, label: string, href: string, variant = 'primary'): StarterBlock => ({
  type: 'ButtonLink',
  props: { id, label, href, variant, padding: 'md' },
})

const hero = (id: string, overrides?: Record<string, unknown>): StarterBlock => ({
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

const section = (id: string, overrides?: Record<string, unknown>): StarterBlock => ({
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

const contentSlot = (id = 'content-slot-1'): StarterBlock => ({ type: 'ContentSlot', props: { id } })

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

const blank = (id: string, name = 'Blank', description = 'An empty canvas. Build it from scratch.'): StarterTemplate => ({
  id, name, description,
  data: { content: [], root: { props: {} }, zones: {} },
})

// ---------------------------------------------------------------------------
// Header templates
//
// `starter-header` is the design a fresh install goes live with. The ids of the
// templates that predate this catalogue are load-bearing: an install's live
// header lives at `starter-header-live`, so renaming the template id here would
// seed that site a second header on its next deploy.
// ---------------------------------------------------------------------------

const headerTemplates: StarterTemplate[] = [
  {
    id: 'starter-header',
    name: 'Default Header',
    description: 'Logo on the left, navigation on the right.',
    publishByDefault: true,
    defaultConditions: ENTIRE_SITE_CONDITIONS,
    data: {
      root: headerRoot(),
      content: [group('hr1', { gap: 'md', items: [logo('logo-1'), menu('menu-1')] })],
      zones: {},
    },
  },
  {
    id: 'starter-header-logo-name',
    name: 'Logo + Site Name',
    description: 'Logo with the site name beside it, navigation right.',
    data: {
      root: headerRoot(),
      content: [group('hr1', { gap: 'md', items: [logo('logo-1', { showTextWithLogo: 'true' }), menu('menu-1')] })],
      zones: {},
    },
  },
  {
    id: 'starter-header-logo-nav-login',
    name: 'Logo, Nav + Login',
    description: 'Logo left, navigation, then a sign-in button on the right.',
    data: {
      root: headerRoot(),
      content: [group('hr1', { gap: 'lg', items: [logo('logo-1'), menu('menu-1'), loginBtn('login-1')] })],
      zones: {},
    },
  },
  {
    id: 'starter-header-nav-centre',
    name: 'Centred Navigation',
    description: 'Logo left, navigation centred, sign-in button right.',
    data: {
      root: headerRoot(),
      content: [{ type: 'Grid', props: {
        id: 'header-grid', columns: '3', columnSizes: 'equal', gap: 'md', padding: 'none',
        verticalAlign: 'center', spaceBelow: 'none',
        col1Align: 'start', col2Align: 'center', col3Align: 'end',
        col1: [logo('logo-1')], col2: [menu('menu-1')], col3: [loginBtn('login-1')],
      } }],
      zones: {},
    },
  },
  {
    id: 'starter-header-logo-centre',
    name: 'Centred Logo',
    description: 'Logo dead centre, navigation on the right.',
    data: {
      root: headerRoot(),
      content: [{ type: 'Grid', props: {
        id: 'header-grid', columns: '3', columnSizes: 'equal', gap: 'md', padding: 'none',
        verticalAlign: 'center', spaceBelow: 'none',
        col1Align: 'start', col2Align: 'center', col3Align: 'end',
        col1: [], col2: [logo('logo-1')], col3: [menu('menu-1')],
      } }],
      zones: {},
    },
  },
  {
    id: 'starter-header-logo-right',
    name: 'Logo Right',
    description: 'Navigation on the left, logo on the right. The other way round.',
    data: {
      root: headerRoot(),
      content: [group('hr1', { gap: 'lg', items: [menu('menu-1'), logo('logo-1')] })],
      zones: {},
    },
  },
  {
    id: 'starter-header-stacked',
    name: 'Stacked',
    description: 'Logo centred on top, navigation centred on a second row.',
    data: {
      root: headerRoot({ height: 'auto' }),
      content: [group('outer', { direction: 'column', justify: 'center', align: 'center', gap: 'sm', items: [
        group('row-logo', { justify: 'center', items: [logo('logo-1')] }),
        group('row-nav', { justify: 'center', items: [menu('menu-1')] }),
      ] })],
      zones: {},
    },
  },
  {
    id: 'starter-header-login-toggle',
    name: 'Login + Theme Toggle',
    description: 'Logo left, navigation, with sign-in and a light/dark switch grouped right.',
    data: {
      root: headerRoot(),
      content: [group('hr1', { gap: 'lg', items: [
        logo('logo-1'),
        menu('menu-1'),
        group('actions-row', { justify: 'end', wrap: 'nowrap', gap: 'sm', items: [loginBtn('login-1'), themeToggle('toggle-1')] }),
      ] })],
      zones: {},
    },
  },
  {
    id: 'starter-header-tall',
    name: 'Tall',
    description: '80px tall. Logo left, navigation centred, sign-in and theme toggle right.',
    data: {
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
    },
  },
  {
    id: 'starter-header-compact',
    name: 'Compact',
    description: '48px tall, smaller logo and navigation text. Gets out of the way.',
    data: {
      root: headerRoot({ height: '48px' }),
      content: [group('hr1', { gap: 'md', items: [logo('logo-1', { logoHeight: 28 }), menu('menu-1', { itemFontSize: 'small' })] })],
      zones: {},
    },
  },
  {
    id: 'starter-header-full-width',
    name: 'Full Width',
    description: 'Stretches to 1400px with no bottom border. Good for wide sites.',
    data: {
      root: headerRoot({ maxWidth: '1400px', border: { show: 'hide', color: '' } }),
      content: [group('hr1', { gap: 'md', items: [logo('logo-1'), menu('menu-1')] })],
      zones: {},
    },
  },
  {
    id: 'starter-header-minimal',
    name: 'Logo Only',
    description: 'Logo centred, no navigation, no border.',
    data: {
      root: headerRoot({ border: { show: 'hide', color: '' } }),
      content: [group('hr1', { justify: 'center', gap: 'md', items: [logo('logo-1')] })],
      zones: {},
    },
  },
  {
    id: 'starter-header-transparent',
    name: 'Transparent',
    description: 'See-through until the visitor scrolls, then it fills in.',
    data: {
      root: headerRoot({ bg: { mode: 'transparent-scroll', color: '' }, border: { show: 'hide', color: '' } }),
      content: [group('hr1', { gap: 'md', items: [logo('logo-1'), menu('menu-1')] })],
      zones: {},
    },
  },
  blank('starter-header-blank'),
]

// ---------------------------------------------------------------------------
// Footer templates
// ---------------------------------------------------------------------------

const footerTemplates: StarterTemplate[] = [
  {
    id: 'starter-footer',
    name: 'Default Footer',
    description: 'A single centred copyright line. Nothing else.',
    publishByDefault: true,
    defaultConditions: ENTIRE_SITE_CONDITIONS,
    data: {
      root: footerRoot(),
      content: [copyright('copyright-1', 'center')],
      zones: {},
    },
  },
  {
    id: 'starter-footer-logo-links',
    name: 'Logo + Links',
    description: 'Logo and site name left, menu and copyright right.',
    data: {
      root: footerRoot({ paddingY: 'lg' }),
      content: [{ type: 'Grid', props: {
        id: 'footer-grid-2', columns: '2', columnSizes: '30-70', gap: 'lg', padding: 'none',
        verticalAlign: 'start', spaceBelow: 'none', col1Align: 'start', col2Align: 'start', col3Align: 'start', col4Align: 'start',
        col1: [logo('footer-logo', { logoHeight: 36, showTextWithLogo: 'true' })],
        col2: [
          menu('footer-menu', { orientation: 'horizontal', spacing: 'normal', itemFontSize: 'small', navToggle: { desktop: 'show', tablet: 'show', mobile: 'show' } }),
          copyright('footer-copy', 'left'),
        ],
      } }],
      zones: {},
    },
  },
  {
    id: 'starter-footer-three-col',
    name: 'Three Column',
    description: 'Brand, quick links and social icons across three columns.',
    data: {
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
          menu('footer-menu', { orientation: 'vertical', spacing: 'tight', itemFontSize: 'small', navToggle: { desktop: 'show', tablet: 'collapse', mobile: 'show' } }),
        ],
        col3: [
          heading('footer-social-heading', 'Follow Us', { level: 'h4' }),
          socialLinks('footer-social'),
          copyright('footer-copy', 'left'),
        ],
      } }],
      zones: {},
    },
  },
  {
    id: 'starter-footer-social',
    name: 'With Social Links',
    description: 'Logo left, social icons and copyright right.',
    data: {
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
    },
  },
  blank('starter-footer-blank'),
]

// ---------------------------------------------------------------------------
// Page layout templates
//
// No blank template here on purpose: a page layout with no content slot has
// nowhere to put the page's own content, so it would render an empty page.
// ---------------------------------------------------------------------------

const pageTemplates: StarterTemplate[] = [
  {
    id: 'starter-full-width',
    name: 'Full Width',
    description: 'Page content fills the full width. No constraints.',
    publishByDefault: true,
    defaultConditions: ENTIRE_SITE_CONDITIONS,
    data: {
      content: [contentSlot()],
      root: { props: {} },
      zones: {},
    },
  },
  {
    id: 'starter-boxed',
    name: 'Boxed',
    description: 'Page content centred at a comfortable reading width.',
    data: {
      content: [section('section-1', {
        paddingY: 'md', maxWidth: 'standard', bg: { mode: 'none', color: '' },
        content: [contentSlot()],
      })],
      root: { props: {} },
      zones: {},
    },
  },
  {
    id: 'starter-sidebar-right',
    name: 'With Right Sidebar',
    description: 'Page content on the left (70%), a sidebar on the right (30%).',
    data: {
      content: [split('columns-1', { ratio: '70/30' })],
      root: { props: {} },
      zones: {
        'columns-1:left':  [contentSlot()],
        'columns-1:right': [],
      },
    },
  },
  {
    id: 'starter-sidebar-left',
    name: 'With Left Sidebar',
    description: 'A sidebar on the left (30%), page content on the right (70%).',
    data: {
      content: [split('columns-1', { ratio: '30/70' })],
      root: { props: {} },
      zones: {
        'columns-1:left':  [],
        'columns-1:right': [contentSlot()],
      },
    },
  },
]

// ---------------------------------------------------------------------------
// 404 templates
// ---------------------------------------------------------------------------

const notFoundTemplates: StarterTemplate[] = [
  {
    id: 'starter-404-hero',
    name: 'Full Hero',
    description: 'Full-screen hero with a heading and a button home.',
    publishByDefault: true,
    defaultConditions: NOT_FOUND_CONDITIONS,
    data: {
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
    },
  },
  {
    id: 'starter-404-minimal',
    name: 'Minimal',
    description: 'A centred heading, a line of apology, and a way back.',
    data: {
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
    },
  },
  {
    id: 'starter-404-branded',
    name: 'Branded',
    description: 'Gradient hero with two buttons: go home, or get in touch.',
    data: {
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
    },
  },
  blank('starter-404-blank'),
]

// ---------------------------------------------------------------------------
// Status page templates (coming soon / maintenance)
// ---------------------------------------------------------------------------

const statusTemplates: StarterTemplate[] = [
  {
    id: 'starter-status-coming-soon',
    name: 'Coming Soon',
    description: 'Full-screen hero for a site that has not opened its doors yet.',
    publishByDefault: true,
    defaultConditions: COMING_SOON_CONDITIONS,
    data: {
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
    },
  },
  {
    id: 'starter-status-maintenance',
    name: 'Maintenance',
    description: 'Logo, heading and a callout explaining that you will be back.',
    publishByDefault: true,
    defaultConditions: MAINTENANCE_CONDITIONS,
    data: {
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
    },
  },
  {
    id: 'starter-status-minimal',
    name: 'Minimal',
    description: 'Logo, heading, one short line. Nothing more.',
    data: {
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
    },
  },
  blank('starter-status-blank'),
]

// ---------------------------------------------------------------------------
// Account login templates
//
// Every one of these carries a Content Slot, and none of them is offered as a
// blank: the slot is where the real sign-in form lands, so a layout without one
// is a sign-in page with nothing to sign in on. Nothing here is published by
// default either - with no layout the login page renders exactly as it always
// has, and a site only changes when its owner builds one and publishes it.
// ---------------------------------------------------------------------------

const memberLoginTemplates: StarterTemplate[] = [
  {
    id: 'starter-account-login-centred',
    name: 'Centred',
    description: 'The sign-in form on its own, centred with room around it. What the page looks like today.',
    data: {
      root: { props: {} },
      content: [section('section-1', { paddingY: 'xl', maxWidth: 'narrow', content: [contentSlot()] })],
      zones: {},
    },
  },
  {
    id: 'starter-account-login-welcome',
    name: 'Welcome Back',
    description: 'A heading and a line of greeting above the sign-in form.',
    data: {
      root: { props: {} },
      content: [section('section-1', {
        paddingY: 'xl', maxWidth: 'narrow',
        content: [
          heading('h-login', 'Welcome back', { level: 'h1', align: 'center' }),
          textBlock('t-login', 'Sign in to see your orders, addresses and account details.', { align: 'center' }),
          contentSlot(),
        ],
      })],
      zones: {},
    },
  },
  {
    id: 'starter-account-login-with-help',
    name: 'With a Way Out',
    description: 'The sign-in form, and underneath it a line for anyone who cannot get in.',
    data: {
      root: { props: {} },
      content: [section('section-1', {
        paddingY: 'xl', maxWidth: 'narrow',
        content: [
          contentSlot(),
          textBlock('t-help', 'Trouble signing in? Get in touch and we will sort it out.', { align: 'center' }),
          buttonLink('btn-help', 'Contact us', '/contact', 'outline'),
        ],
      })],
      zones: {},
    },
  },
]

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Email wrapper templates
//
// The design wrapped around every email the site sends. `starter-email-wrapper`
// is seeded published on a fresh install, so an install has a tidy branded email
// on day one rather than a bare paragraph on a white page.
//
// Colours are token ids, not hex: the email renderer resolves them to the site's
// own light-mode values at send time, because no mail client can read a CSS
// variable. See lib/email/blocks.ts.
// ---------------------------------------------------------------------------

const emailRoot = (overrides?: Record<string, unknown>) => ({
  props: {
    preheader: '', pageBackground: '', cardBackground: '#ffffff', cardBorderColour: '',
    contentWidth: 600, cardRadius: 8, outerPadding: 24, fontFamily: '',
    ...overrides,
  },
})

const emailWrapperTemplates: StarterTemplate[] = [
  {
    id: 'starter-email-wrapper',
    name: 'Default Email',
    description: 'Your logo at the top, the message in the middle, a quiet footer underneath.',
    publishByDefault: true,
    defaultConditions: ENTIRE_SITE_CONDITIONS,
    data: {
      root: emailRoot(),
      content: [
        { type: 'EmailLogo', props: { id: 'email-logo-1', src: '', href: '{{siteUrl}}', alt: '', width: 160, align: 'center', textColour: '', paddingY: 28, paddingX: 24 } },
        { type: 'EmailBodySlot', props: { id: 'email-body-1', textColour: '', fontSize: 16, paddingY: 8, paddingX: 32 } },
        { type: 'EmailDivider', props: { id: 'email-divider-1', colour: '', thickness: 1, paddingY: 8, paddingX: 32 } },
        { type: 'EmailFooterText', props: { id: 'email-footer-1', html: '&copy; {{year}} {{siteName}}', fontSize: 12, textColour: '', align: 'center', paddingY: 20, paddingX: 24 } },
      ],
      zones: {},
    },
  },
  {
    id: 'starter-email-wrapper-plain',
    name: 'Plain Email',
    description: 'Just the message, on a plain white page. Nothing to distract from what it says.',
    data: {
      root: emailRoot({ pageBackground: '#ffffff', cardRadius: 0, outerPadding: 8 }),
      content: [
        { type: 'EmailBodySlot', props: { id: 'email-body-1', textColour: '', fontSize: 16, paddingY: 16, paddingX: 24 } },
        { type: 'EmailFooterText', props: { id: 'email-footer-1', html: '{{siteName}}', fontSize: 12, textColour: '', align: 'left', paddingY: 16, paddingX: 24 } },
      ],
      zones: {},
    },
  },
  {
    id: 'starter-email-wrapper-branded',
    name: 'Branded Email',
    description: 'Logo, a heading you set, the message, a button and social links.',
    data: {
      root: emailRoot({ pageBackground: 'primary', cardRadius: 12 }),
      content: [
        { type: 'EmailLogo', props: { id: 'email-logo-1', src: '', href: '{{siteUrl}}', alt: '', width: 180, align: 'left', textColour: '', paddingY: 28, paddingX: 32 } },
        { type: 'EmailHeading', props: { id: 'email-heading-1', text: '', level: 'h2', fontSize: 24, textColour: '', align: 'left', paddingY: 4, paddingX: 32 } },
        { type: 'EmailBodySlot', props: { id: 'email-body-1', textColour: '', fontSize: 16, paddingY: 8, paddingX: 32 } },
        { type: 'EmailDivider', props: { id: 'email-divider-1', colour: '', thickness: 1, paddingY: 16, paddingX: 32 } },
        { type: 'EmailSocialRow', props: { id: 'email-social-1', links: [], fontSize: 14, textColour: '', align: 'center', paddingY: 4, paddingX: 24 } },
        { type: 'EmailFooterText', props: { id: 'email-footer-1', html: '&copy; {{year}} {{siteName}}', fontSize: 12, textColour: '', align: 'center', paddingY: 20, paddingX: 24 } },
      ],
      zones: {},
    },
  },
  blank('starter-email-wrapper-blank', 'Blank', 'An empty canvas. Do not forget the Message block.'),
]

// ---------------------------------------------------------------------------
// Document footer templates - documentFooter
// ---------------------------------------------------------------------------
//
// What repeats at the FOOT OF EVERY PAGE of a printed document's PDF, drawn into
// the bottom margin by the browser rather than onto the document itself. A
// footer block on the document is printed once, after the last line - right on a
// one-page invoice, wrong on a four-page one where page two ends mid-table with
// nothing to say whose invoice it is.
//
// Nothing publishes by default, and that is load-bearing rather than tidiness: a
// site whose paperwork module already has its own footer design keeps using it
// for exactly as long as nobody has published one of these. Seeding one would
// silently redesign the footer on every document a live site prints.
//
// Two things to know when laying one out:
//
//  - it is drawn into the page's BOTTOM MARGIN, so the margin has to be deep
//    enough to hold it. That is a page setting on whichever document is printed.
//  - the blocks that can say anything about the document itself - the page
//    number, the registration small print - come from the module that prints it.
//    A site with no such module gets the core blocks below and nothing more,
//    which is a perfectly good line of text at the foot of every page.
const documentFooterTemplates: StarterTemplate[] = [
  {
    id: 'starter-document-footer-line',
    name: 'One line',
    description: 'A single line of small print at the foot of every page. Type your own; the blocks your paperwork module adds can go beside it.',
    data: {
      content: [
        textBlock('doc-footer-line', 'Your business name · company number · VAT number', { align: 'center' }),
      ],
      root: { props: { align: 'stretch', inset: '0' } },
      zones: {},
    },
  },
  blank('starter-document-footer-blank', 'Blank', 'An empty strip. Build it from the blocks your paperwork module offers.'),
]

export const CORE_STARTER_TEMPLATES: Record<string, StarterTemplate[]> = {
  header:     headerTemplates,
  footer:     footerTemplates,
  infoPage:   pageTemplates,
  notFound:   notFoundTemplates,
  statusPage: statusTemplates,
  memberLogin: memberLoginTemplates,
  emailWrapper: emailWrapperTemplates,
  documentFooter: documentFooterTemplates,
}

// Module starter templates come from each module's own lib/starterLayouts.ts,
// collected into the generated module-starter-layouts map. They are plain data
// (no imports of their own), so this stays browser-safe.
const moduleTemplates = moduleStarterLayouts as Record<string, () => StarterTemplate[]>

// Starters a module offers for a layout type it does not own. There is exactly
// one such type today and it is `documentFooter`: the strip at the foot of a
// printed page is core's, but a page number and a registration line are blocks
// belonging to whichever module prints the paperwork, and so are the starters
// made of them. Appended rather than substituted - a site with two paperwork
// modules gets both modules' footers on the menu, not the last one loaded.
const contributedTemplates = moduleLayoutStarterContributions as Record<string, (() => StarterTemplate[])[]>

function contributedFor(type: string): StarterTemplate[] {
  return (contributedTemplates[type] ?? []).flatMap((build) => build())
}

/** Every starter template offered for a layout type, core or module-declared. */
export function getStarterTemplates(type: string): StarterTemplate[] {
  const contributed = contributedFor(type)
  const core = CORE_STARTER_TEMPLATES[type]
  if (core) return contributed.length > 0 ? [...core, ...contributed] : core
  const build = moduleTemplates[type]
  const own = build ? build() : []
  return contributed.length > 0 ? [...own, ...contributed] : own
}

/** Every starter template across every type, core and module, for the cleanup
 * planner to walk. Not for seeding: see coreStarterTemplates(). */
export function allStarterTemplates(): Array<{ type: string; template: StarterTemplate }> {
  return [...coreStarterTemplates(), ...allModuleStarterTemplates()]
}

/** The core starter templates only. What a fresh site is seeded with: at setup no
 * module is installed yet, so seeding a module's templates there stamps (say) Shop
 * pages into a site that has never heard of the Shop. A module's own starters are
 * seeded when the module is - see seedModuleDefaultLayouts(). */
export function coreStarterTemplates(): Array<{ type: string; template: StarterTemplate }> {
  const out: Array<{ type: string; template: StarterTemplate }> = []
  for (const [type, templates] of Object.entries(CORE_STARTER_TEMPLATES)) {
    for (const template of templates) out.push({ type, template })
  }
  return out
}

function allModuleStarterTemplates(): Array<{ type: string; template: StarterTemplate }> {
  const out: Array<{ type: string; template: StarterTemplate }> = []
  for (const [type, build] of Object.entries(moduleTemplates)) {
    for (const template of build()) out.push({ type, template })
  }
  // Contributions belong in the full walk (the cleanup planner has to recognise a
  // layout somebody started from one) but NOT in moduleStarterTemplates() below,
  // which is what seeds a module's own layouts on install. Nothing publishes a
  // document footer by default: seeding one would silently redesign the footer on
  // every document a live site prints the moment a paperwork module is added.
  for (const [type, builds] of Object.entries(contributedTemplates)) {
    for (const build of builds) {
      for (const template of build()) out.push({ type, template })
    }
  }
  return out
}

/** The starter templates one module declares, across all of its layout types. */
export function moduleStarterTemplates(moduleName: string): Array<{ type: string; template: StarterTemplate }> {
  return allModuleStarterTemplates().filter(
    ({ type }) => moduleLayoutTypeToGroup[type]?.moduleName === moduleName,
  )
}
