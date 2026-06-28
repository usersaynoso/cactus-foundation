'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminPath } from '@/components/admin/AdminPathContext'

type LayoutTypeOption = {
  key: string
  label: string
  description: string
  icon: string
}

type Starter = {
  key: string
  name: string
  description: string
  builderData: object
}

const LAYOUT_TYPES: LayoutTypeOption[] = [
  { key: 'header',     label: 'Header',                    description: 'Site-wide header bar with logo and navigation.', icon: '▬' },
  { key: 'footer',     label: 'Footer',                    description: 'Site-wide footer with links and copyright.', icon: '▁' },
  { key: 'infoPage',   label: 'Page Layout',               description: 'Body shell with a content slot for page content.', icon: '▣' },
  { key: 'notFound',   label: '404 Page',                  description: 'Shown when a page cannot be found.', icon: '?' },
  { key: 'statusPage', label: 'Coming Soon / Maintenance', description: 'Standalone status screen shown before launch or during maintenance.', icon: '⚐' },
]

// Inline slot content helper for Group blocks (items stored in props, not zones)
const g = (id: string, overrides: Record<string, unknown> = {}) => ({
  type: 'Group',
  props: { id, direction: 'row', justify: 'between', align: 'center', gap: 'md', padding: 'none', wrap: 'nowrap', ...overrides },
})
const logoBlock = (id: string, overrides: Record<string, unknown> = {}) => ({
  type: 'SiteLogo',
  props: { id, homeUrl: '/', logoHeight: 40, showTextWithLogo: 'false', showIcon: 'true', textColor: '', ...overrides },
})
const menuBlock = (id: string, overrides: Record<string, unknown> = {}) => ({
  type: 'MenuBlock',
  props: { id, menuId: '', menuName: '', orientation: 'horizontal', spacing: 'normal', itemFontSize: 'medium', itemFontWeight: 'medium', textTransform: 'none', itemColor: '', showDropdowns: 'hover', showMobileToggle: 'collapse', ...overrides },
})
const loginBlock = (id: string) => ({ type: 'LoginButton', props: { id, loginLabel: 'Sign in', registerLabel: 'Register' } })
const toggleBlock = (id: string) => ({ type: 'ThemeToggle', props: { id } })

const STARTERS_BY_TYPE: Record<string, Starter[]> = {
  header: [
    {
      key: 'blank',
      name: 'Blank',
      description: 'Start from scratch.',
      builderData: { content: [], root: { props: {} }, zones: {} },
    },
    {
      key: 'logo-nav-right',
      name: 'Logo Left + Nav Right',
      description: 'Standard header with logo on the left and navigation on the right.',
      builderData: {
        content: [g('cols-1', { gap: 'lg', items: [logoBlock('logo-1'), menuBlock('menu-1')] })],
        root: { props: { height: '64px', sticky: 'yes', borderBottom: 'show', maxWidth: '1200px' } },
        zones: {},
      },
    },
    {
      key: 'logo-nav-login',
      name: 'Logo Left + Nav + Login',
      description: 'Logo left, navigation, and login button.',
      builderData: {
        content: [g('cols-1', { gap: 'lg', items: [logoBlock('logo-1'), menuBlock('menu-1'), loginBlock('login-1')] })],
        root: { props: { height: '64px', sticky: 'yes', borderBottom: 'show', maxWidth: '1200px' } },
        zones: {},
      },
    },
    {
      key: 'logo-nav-centred',
      name: 'Logo Centred + Nav Right',
      description: 'Logo truly centred in the bar, navigation right-aligned.',
      builderData: {
        content: [{ type: 'Grid', props: {
          id: 'header-grid', columns: '3', columnSizes: 'equal', gap: 'md', padding: 'none',
          verticalAlign: 'center', spaceBelow: 'none',
          col1Align: 'start', col2Align: 'center', col3Align: 'end',
          col1: [], col2: [logoBlock('logo-1')], col3: [menuBlock('menu-1')],
        } }],
        root: { props: { height: '64px', sticky: 'yes', borderBottom: 'show', maxWidth: '1200px' } },
        zones: {},
      },
    },
    {
      key: 'full-width',
      name: 'Full Width',
      description: '1400px max-width, no border — good for wide sites.',
      builderData: {
        content: [g('cols-1', { gap: 'md', items: [logoBlock('logo-1'), menuBlock('menu-1')] })],
        root: { props: { height: '64px', sticky: 'yes', borderBottom: 'hide', maxWidth: '1400px' } },
        zones: {},
      },
    },
    {
      key: 'logo-name',
      name: 'Logo + Site Name',
      description: 'Logo with site name visible next to it, navigation on the right.',
      builderData: {
        content: [g('cols-1', { gap: 'md', items: [logoBlock('logo-1', { showTextWithLogo: 'true' }), menuBlock('menu-1')] })],
        root: { props: { height: '64px', sticky: 'yes', borderBottom: 'show', maxWidth: '1200px' } },
        zones: {},
      },
    },
    {
      key: 'tall',
      name: 'Tall',
      description: '80px height — logo left, nav, login and theme toggle right.',
      builderData: {
        content: [g('cols-1', { gap: 'lg', items: [
          logoBlock('logo-1', { logoHeight: 48 }),
          menuBlock('menu-1', { spacing: 'wide' }),
          g('actions-row', { justify: 'end', wrap: 'nowrap', gap: 'sm', items: [loginBlock('login-1'), toggleBlock('toggle-1')] }),
        ] })],
        root: { props: { height: '80px', sticky: 'yes', borderBottom: 'show', maxWidth: '1200px' } },
        zones: {},
      },
    },
    {
      key: 'minimal',
      name: 'Minimal',
      description: 'Logo centred, no navigation, no border.',
      builderData: {
        content: [g('cols-1', { justify: 'center', gap: 'md', items: [logoBlock('logo-1')] })],
        root: { props: { height: '64px', sticky: 'yes', borderBottom: 'hide', maxWidth: '1200px' } },
        zones: {},
      },
    },
    {
      key: 'transparent',
      name: 'Transparent on Scroll',
      description: 'Transparent background that becomes solid when the user scrolls.',
      builderData: {
        content: [g('cols-1', { gap: 'md', items: [logoBlock('logo-1'), menuBlock('menu-1')] })],
        root: { props: { height: '64px', sticky: 'yes', bgMode: 'transparent-scroll', borderBottom: 'hide', maxWidth: '1200px' } },
        zones: {},
      },
    },
    {
      key: 'compact',
      name: 'Compact',
      description: '48px height with smaller logo and nav text.',
      builderData: {
        content: [g('cols-1', { gap: 'md', items: [logoBlock('logo-1', { logoHeight: 28 }), menuBlock('menu-1', { itemFontSize: 'small' })] })],
        root: { props: { height: '48px', sticky: 'yes', borderBottom: 'show', maxWidth: '1200px' } },
        zones: {},
      },
    },
    {
      key: 'logo-right',
      name: 'Logo Right + Nav Left',
      description: 'Navigation on the left, logo on the right.',
      builderData: {
        content: [g('cols-1', { gap: 'lg', items: [menuBlock('menu-1'), logoBlock('logo-1')] })],
        root: { props: { height: '64px', sticky: 'yes', borderBottom: 'show', maxWidth: '1200px' } },
        zones: {},
      },
    },
    {
      key: 'stacked',
      name: 'Stacked (Two Row)',
      description: 'Logo centred on one row, navigation centred below.',
      builderData: {
        content: [g('outer', { direction: 'column', justify: 'center', align: 'center', gap: 'sm', items: [
          g('row-logo', { justify: 'center', items: [logoBlock('logo-1')] }),
          g('row-nav', { justify: 'center', items: [menuBlock('menu-1')] }),
        ] })],
        root: { props: { height: 'auto', sticky: 'yes', borderBottom: 'show', maxWidth: '1200px' } },
        zones: {},
      },
    },
    {
      key: 'login-toggle',
      name: 'With Login + Theme Toggle',
      description: 'Logo left, navigation, login and theme toggle grouped on the right.',
      builderData: {
        content: [g('cols-1', { gap: 'lg', items: [
          logoBlock('logo-1'),
          menuBlock('menu-1'),
          g('actions-row', { justify: 'end', wrap: 'nowrap', gap: 'sm', items: [loginBlock('login-1'), toggleBlock('toggle-1')] }),
        ] })],
        root: { props: { height: '64px', sticky: 'yes', borderBottom: 'show', maxWidth: '1200px' } },
        zones: {},
      },
    },
  ],
  footer: [
    {
      key: 'blank',
      name: 'Blank',
      description: 'Start from scratch.',
      builderData: { content: [], root: { props: {} }, zones: {} },
    },
    {
      key: 'standard',
      name: 'Standard Footer',
      description: 'Simple copyright line centred at the bottom.',
      builderData: {
        content: [{ type: 'Copyright', props: { id: 'copyright-1', prefix: '©', customPrefix: '', yearFormat: 'current', showSiteName: 'true', suffix: '', alignment: 'center', fontSize: 'small', privacyPolicyUrl: '', privacyPolicyLabel: 'Privacy Policy', termsUrl: '', termsLabel: 'Terms of Service', customLink1Url: '', customLink1Label: '', customLink2Url: '', customLink2Label: '' } }],
        root: { props: { paddingY: 'md', borderTop: 'show' } },
        zones: {},
      },
    },
    {
      key: 'logo-links',
      name: 'Logo + Links',
      description: 'Logo and site name left, menu and copyright right.',
      builderData: {
        content: [{ type: 'Grid', props: {
          id: 'footer-grid', columns: '2', columnSizes: '30-70', gap: 'lg', padding: 'none',
          verticalAlign: 'start', spaceBelow: 'none',
          col1Align: 'start', col2Align: 'start', col3Align: 'start', col4Align: 'start',
          col1: [logoBlock('footer-logo', { logoHeight: 36, showTextWithLogo: 'true' })],
          col2: [
            menuBlock('footer-menu', { orientation: 'horizontal', spacing: 'normal', itemFontSize: 'small', showMobileToggle: 'show' }),
            { type: 'Copyright', props: { id: 'footer-copy', prefix: '©', customPrefix: '', yearFormat: 'current', showSiteName: 'true', suffix: '', alignment: 'left', fontSize: 'small', privacyPolicyUrl: '', privacyPolicyLabel: 'Privacy Policy', termsUrl: '', termsLabel: 'Terms of Service', customLink1Url: '', customLink1Label: '', customLink2Url: '', customLink2Label: '' } },
          ],
        } }],
        root: { props: { paddingY: 'lg', borderTop: 'show' } },
        zones: {},
      },
    },
    {
      key: 'three-col',
      name: 'Three Column',
      description: 'Brand, navigation links, and social icons in three columns.',
      builderData: {
        content: [{ type: 'Grid', props: {
          id: 'footer-grid', columns: '3', columnSizes: 'equal', gap: 'lg', padding: 'none',
          verticalAlign: 'start', spaceBelow: 'none',
          col1Align: 'start', col2Align: 'start', col3Align: 'start', col4Align: 'start',
          col1: [
            logoBlock('footer-logo', { logoHeight: 36, showTextWithLogo: 'true' }),
            { type: 'TextBlock', props: { id: 'footer-tagline', content: 'Your tagline or description goes here.', align: 'left', padding: 'none' } },
          ],
          col2: [
            { type: 'Heading', props: { id: 'footer-nav-heading', text: 'Quick Links', level: 'h4', align: 'left', color: 'dark', padding: 'none', animationType: 'none', animationDuration: 'normal', animationDelay: 'none' } },
            menuBlock('footer-menu', { orientation: 'vertical', spacing: 'tight', itemFontSize: 'small', showMobileToggle: 'show' }),
          ],
          col3: [
            { type: 'Heading', props: { id: 'footer-social-heading', text: 'Follow Us', level: 'h4', align: 'left', color: 'dark', padding: 'none', animationType: 'none', animationDuration: 'normal', animationDelay: 'none' } },
            { type: 'SocialLinks', props: { id: 'footer-social', items: [{ platform: 'twitter-x', url: '' }, { platform: 'instagram', url: '' }, { platform: 'linkedin', url: '' }], iconSize: 'md', iconColor: '', layout: 'row', gap: 'normal' } },
            { type: 'Copyright', props: { id: 'footer-copy', prefix: '©', customPrefix: '', yearFormat: 'current', showSiteName: 'true', suffix: '', alignment: 'left', fontSize: 'small', privacyPolicyUrl: '', privacyPolicyLabel: 'Privacy Policy', termsUrl: '', termsLabel: 'Terms of Service', customLink1Url: '', customLink1Label: '', customLink2Url: '', customLink2Label: '' } },
          ],
        } }],
        root: { props: { paddingY: 'lg', borderTop: 'show' } },
        zones: {},
      },
    },
    {
      key: 'social',
      name: 'With Social Links',
      description: 'Logo left, social icons and copyright right.',
      builderData: {
        content: [{ type: 'Grid', props: {
          id: 'footer-grid', columns: '2', columnSizes: '30-70', gap: 'lg', padding: 'none',
          verticalAlign: 'start', spaceBelow: 'none',
          col1Align: 'start', col2Align: 'start', col3Align: 'start', col4Align: 'start',
          col1: [logoBlock('footer-logo', { logoHeight: 36, showTextWithLogo: 'true' })],
          col2: [
            { type: 'SocialLinks', props: { id: 'footer-social', items: [{ platform: 'twitter-x', url: '' }, { platform: 'instagram', url: '' }, { platform: 'linkedin', url: '' }], iconSize: 'md', iconColor: '', layout: 'row', gap: 'normal' } },
            { type: 'Copyright', props: { id: 'footer-copy', prefix: '©', customPrefix: '', yearFormat: 'current', showSiteName: 'true', suffix: '', alignment: 'right', fontSize: 'small', privacyPolicyUrl: '', privacyPolicyLabel: 'Privacy Policy', termsUrl: '', termsLabel: 'Terms of Service', customLink1Url: '', customLink1Label: '', customLink2Url: '', customLink2Label: '' } },
          ],
        } }],
        root: { props: { paddingY: 'md', borderTop: 'show' } },
        zones: {},
      },
    },
  ],
  infoPage: [
    {
      key: 'full-width',
      name: 'Full Width',
      description: 'Content fills the full width.',
      builderData: { content: [{ type: 'ContentSlot', props: { id: 'content-slot-1' } }], root: { props: {} }, zones: {} },
    },
    {
      key: 'boxed',
      name: 'Boxed (centred)',
      description: 'Content centred with a max-width — good for articles.',
      builderData: {
        content: [{ type: 'Section', props: { id: 'section-1', paddingY: 'md', maxWidth: 'standard', bgType: 'none', content: [{ type: 'ContentSlot', props: { id: 'content-slot-1' } }] } }],
        root: { props: {} },
        zones: {},
      },
    },
    {
      key: 'right-sidebar',
      name: 'Right Sidebar (70/30)',
      description: 'Main content (70%) with a sidebar on the right (30%).',
      builderData: {
        content: [{ type: 'Split', props: { id: 'columns-1', ratio: '70/30', padding: 'none' } }],
        root: { props: {} },
        zones: { 'columns-1:left': [{ type: 'ContentSlot', props: { id: 'content-slot-1' } }], 'columns-1:right': [] },
      },
    },
    {
      key: 'left-sidebar',
      name: 'Left Sidebar (30/70)',
      description: 'Sidebar on the left (30%), main content on the right (70%).',
      builderData: {
        content: [{ type: 'Split', props: { id: 'columns-1', ratio: '30/70', padding: 'none' } }],
        root: { props: {} },
        zones: { 'columns-1:left': [], 'columns-1:right': [{ type: 'ContentSlot', props: { id: 'content-slot-1' } }] },
      },
    },
  ],
  notFound: [
    {
      key: 'blank',
      name: 'Blank',
      description: 'Start from scratch.',
      builderData: { content: [], root: { props: {} }, zones: {} },
    },
    {
      key: 'hero',
      name: 'Full Hero',
      description: 'Full-screen gradient hero with heading and home button.',
      builderData: {
        content: [{ type: 'Hero', props: { id: 'hero-1', heading: '404 — Page Not Found', subheading: 'Sorry, the page you were looking for does not exist.', ctaLabel: 'Go Home', ctaHref: '/', cta2Label: '', cta2Href: '', cta2Variant: 'outline', bgType: 'gradient', bgColor: '', bgImage: '', overlayColor: '', overlayOpacity: 0, layout: 'centered', imageUrl: '', textScheme: 'dark', minHeight: 'full', padding: 'none', animationType: 'none', animationDuration: 'normal', animationDelay: 'none' } }],
        root: { props: {} },
        zones: {},
      },
    },
    {
      key: 'minimal',
      name: 'Minimal',
      description: 'Simple centred heading, message, and back link.',
      builderData: {
        content: [{ type: 'Section', props: { id: 'section-1', bgType: 'none', bgColor: '', bgImage: '', bgSize: 'cover', overlayColor: '', overlayOpacity: 0, paddingY: 'xl', maxWidth: 'narrow', textColor: '', sticky: 'off', stickyOffset: '0px', boxShadow: 'none', borderStyle: 'none', borderColor: 'var(--color-border)', borderWidth: '1px', borderRadius: 'none', opacity: '100', animationType: 'none', animationDuration: 'normal', animationDelay: 'none', content: [
          { type: 'Heading', props: { id: 'h-404', text: '404', level: 'h2', align: 'center', color: 'dark', padding: 'none', animationType: 'none', animationDuration: 'normal', animationDelay: 'none' } },
          { type: 'TextBlock', props: { id: 't-404', content: "The page you're looking for could not be found.", align: 'center', padding: 'none' } },
          { type: 'ButtonLink', props: { id: 'btn-home', label: '← Back to Home', href: '/', variant: 'outline', padding: 'md' } },
        ] } }],
        root: { props: {} },
        zones: {},
      },
    },
    {
      key: 'branded',
      name: 'Branded',
      description: 'Hero with gradient and dual call-to-action buttons.',
      builderData: {
        content: [{ type: 'Hero', props: { id: 'hero-1', heading: 'Page Not Found', subheading: "We've looked everywhere and can't find that page. Let's get you back on track.", ctaLabel: 'Go Home', ctaHref: '/', cta2Label: 'Contact Us', cta2Href: '/contact', cta2Variant: 'outline', bgType: 'gradient', bgColor: '', bgImage: '', overlayColor: '', overlayOpacity: 0, layout: 'centered', imageUrl: '', textScheme: 'dark', minHeight: 'half', padding: 'none', animationType: 'none', animationDuration: 'normal', animationDelay: 'none' } }],
        root: { props: {} },
        zones: {},
      },
    },
  ],
  statusPage: [
    {
      key: 'blank',
      name: 'Blank',
      description: 'Start from scratch.',
      builderData: { content: [], root: { props: {} }, zones: {} },
    },
    {
      key: 'coming-soon',
      name: 'Coming Soon',
      description: 'Full-screen gradient hero for a coming-soon page.',
      builderData: {
        content: [{ type: 'Hero', props: { id: 'hero-1', heading: 'Coming Soon', subheading: "We're working on something exciting. Check back shortly.", ctaLabel: '', ctaHref: '', cta2Label: '', cta2Href: '', cta2Variant: 'outline', bgType: 'gradient', bgColor: '', bgImage: '', overlayColor: '', overlayOpacity: 0, layout: 'centered', imageUrl: '', textScheme: 'dark', minHeight: 'full', padding: 'none', animationType: 'none', animationDuration: 'normal', animationDelay: 'none' } }],
        root: { props: {} },
        zones: {},
      },
    },
    {
      key: 'maintenance',
      name: 'Maintenance',
      description: 'Maintenance notice with logo, heading, and callout block.',
      builderData: {
        content: [{ type: 'Section', props: { id: 'section-1', bgType: 'none', bgColor: '', bgImage: '', bgSize: 'cover', overlayColor: '', overlayOpacity: 0, paddingY: 'xl', maxWidth: 'narrow', textColor: '', sticky: 'off', stickyOffset: '0px', boxShadow: 'none', borderStyle: 'none', borderColor: 'var(--color-border)', borderWidth: '1px', borderRadius: 'none', opacity: '100', animationType: 'none', animationDuration: 'normal', animationDelay: 'none', content: [
          { type: 'SiteLogo', props: { id: 'site-logo', homeUrl: '/', logoHeight: 48, showTextWithLogo: 'false', showIcon: 'true', textColor: '' } },
          { type: 'Heading', props: { id: 'h-main', text: 'Down for Maintenance', level: 'h2', align: 'center', color: 'dark', padding: 'md', animationType: 'none', animationDuration: 'normal', animationDelay: 'none' } },
          { type: 'Callout', props: { id: 'callout-1', type: 'warning', title: 'Scheduled Maintenance', body: "We're making some improvements. We'll be back shortly - thank you for your patience.", padding: 'none' } },
          { type: 'TextBlock', props: { id: 't-contact', content: 'Need urgent help? Get in touch via email.', align: 'center', padding: 'md' } },
        ] } }],
        root: { props: {} },
        zones: {},
      },
    },
    {
      key: 'minimal',
      name: 'Minimal',
      description: 'Logo, heading, and brief message. Nothing more.',
      builderData: {
        content: [{ type: 'Section', props: { id: 'section-1', bgType: 'none', bgColor: '', bgImage: '', bgSize: 'cover', overlayColor: '', overlayOpacity: 0, paddingY: 'xl', maxWidth: 'narrow', textColor: '', sticky: 'off', stickyOffset: '0px', boxShadow: 'none', borderStyle: 'none', borderColor: 'var(--color-border)', borderWidth: '1px', borderRadius: 'none', opacity: '100', animationType: 'none', animationDuration: 'normal', animationDelay: 'none', content: [
          { type: 'SiteLogo', props: { id: 'site-logo', homeUrl: '/', logoHeight: 48, showTextWithLogo: 'false', showIcon: 'true', textColor: '' } },
          { type: 'Heading', props: { id: 'h-main', text: "We'll be right back.", level: 'h2', align: 'center', color: 'dark', padding: 'md', animationType: 'none', animationDuration: 'normal', animationDelay: 'none' } },
          { type: 'TextBlock', props: { id: 't-sub', content: 'This site is temporarily unavailable. Please check back soon.', align: 'center', padding: 'none' } },
        ] } }],
        root: { props: {} },
        zones: {},
      },
    },
  ],
}

export default function NewLayoutPage() {
  const router = useRouter()
  const adminPath = useAdminPath()
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [selectedStarter, setSelectedStarter] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  function handleTypeSelect(key: string) {
    setSelectedType(key)
    setSelectedStarter(null)
    setStep(2)
  }

  async function handleCreate() {
    if (!name.trim()) { setError('Please enter a name'); return }
    if (!selectedStarter) { setError('Please choose a starting structure'); return }
    const starters = STARTERS_BY_TYPE[selectedType ?? 'infoPage'] ?? []
    const starter = starters.find(s => s.key === selectedStarter)
    if (!starter) return
    setCreating(true); setError('')
    try {
      const res = await fetch('/api/admin/layouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), type: selectedType, builderData: starter.builderData }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed to create'); setCreating(false); return }
      const layout = await res.json()
      router.push(`/${adminPath}/layouts/${layout.id}`)
    } catch { setError('Failed to create layout'); setCreating(false) }
  }

  if (step === 1) {
    return (
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem' }}>New Layout</h1>
        <p style={{ color: '#6b7280', margin: '0 0 2rem' }}>What kind of layout do you want to create?</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
          {LAYOUT_TYPES.map(t => (
            <button
              key={t.key}
              onClick={() => handleTypeSelect(t.key)}
              style={{
                textAlign: 'left', padding: '1.25rem', border: '1px solid #e5e7eb',
                borderRadius: 8, background: '#ffffff', cursor: 'pointer', fontFamily: 'inherit',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#16a34a'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 0 3px rgba(22,163,74,0.1)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none' }}
            >
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{t.icon}</div>
              <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#111827', marginBottom: '0.25rem' }}>{t.label}</div>
              <div style={{ fontSize: '0.8125rem', color: '#6b7280' }}>{t.description}</div>
            </button>
          ))}
        </div>

        <div style={{ marginTop: '1.5rem' }}>
          <button className="btn btn-secondary" onClick={() => router.back()}>Cancel</button>
        </div>
      </div>
    )
  }

  const typeOption = LAYOUT_TYPES.find(t => t.key === selectedType)
  const starters = STARTERS_BY_TYPE[selectedType ?? 'infoPage'] ?? []

  return (
    <div style={{ maxWidth: 640 }}>
      <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '0.875rem', padding: 0, marginBottom: '1.5rem', fontFamily: 'inherit' }}>
        ← Back to type selection
      </button>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.25rem' }}>New {typeOption?.label}</h1>
      <p style={{ color: '#6b7280', margin: '0 0 2rem' }}>Give it a name and choose a starting structure.</p>

      <div className="field">
        <label>Layout name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. ${typeOption?.label ?? 'My Layout'}`} autoFocus />
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ fontSize: '0.875rem', fontWeight: 500, display: 'block', marginBottom: '0.75rem' }}>Starting structure</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
          {starters.map(s => (
            <button key={s.key} onClick={() => setSelectedStarter(s.key)} style={{
              textAlign: 'left', padding: '1rem', border: selectedStarter === s.key ? '2px solid #16a34a' : '1px solid #e5e7eb',
              borderRadius: 8, background: selectedStarter === s.key ? '#f0fdf4' : '#ffffff', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>{s.name}</div>
              <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: '0.25rem' }}>{s.description}</div>
            </button>
          ))}
        </div>
      </div>

      {error && <p style={{ color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '1rem' }}>
        <button className="btn btn-primary" onClick={handleCreate} disabled={creating || !selectedStarter || !name.trim()}>
          {creating ? 'Creating…' : 'Create Layout'}
        </button>
        <button className="btn btn-secondary" onClick={() => router.back()} disabled={creating}>Cancel</button>
      </div>
    </div>
  )
}
