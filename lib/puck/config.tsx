// Puck component config — safe for both editor (client) and RSC render paths.
// No hooks, no browser APIs. Type imports only from @puckeditor/core.

import React from 'react'
import type { Config } from '@puckeditor/core'
import { generateHTML } from '@tiptap/html'
import type { JSONContent } from '@tiptap/core'
import { Document } from '@tiptap/extension-document'
import { Paragraph } from '@tiptap/extension-paragraph'
import { Text } from '@tiptap/extension-text'
import { Bold } from '@tiptap/extension-bold'
import { Italic } from '@tiptap/extension-italic'
import { Strike } from '@tiptap/extension-strike'
import { Underline } from '@tiptap/extension-underline'
import { Heading as TiptapHeading } from '@tiptap/extension-heading'
import { Blockquote } from '@tiptap/extension-blockquote'
import { Code } from '@tiptap/extension-code'
import { CodeBlock } from '@tiptap/extension-code-block'
import { HardBreak } from '@tiptap/extension-hard-break'
import { HorizontalRule } from '@tiptap/extension-horizontal-rule'
import { Link } from '@tiptap/extension-link'
import { BulletList, OrderedList, ListItem } from '@tiptap/extension-list'
import TextAlign from '@tiptap/extension-text-align'
import MenuBlockClient, { MenuVerticalLink } from '@/lib/puck/components/MenuBlockClient'
import SiteLogoClient from '@/lib/puck/components/SiteLogoClient'
import { emailSafeHref, linkifyEmails, maskEmailText, obfuscateEmailsInHtml } from '@/lib/email-obfuscate'
import { googleFontHrefForFamily } from '@/lib/design/tokens'
import { menuScaleStyles } from '@/lib/puck/menuScale'
import { BLOCK_HEIGHT_OPTIONS, BLOCK_HEIGHT_MAP, blockFillCssResponsive } from '@/lib/puck/blockHeight'
import { LOGO_ALIGN_OPTIONS, siteLogoAlign, siteLogoCellHeight } from '@/lib/puck/siteLogoAlign'
import { normalizeResponsiveValue, pickResponsive, responsiveMediaCssFor, tabletMediaQuery, mobileMediaQuery, fluidClamp, type ResponsiveValue, type Device } from '@/lib/puck/responsiveValue'
import type { MinMaxPair } from '@/lib/puck/MinMaxPairField'
// Sidebar field widgets come from the registry, never from their own modules. Each one
// is a 'use client' component and ResponsiveValueField imports the Puck editor itself,
// so a direct import here opens a client boundary on the RSC path and drags the whole
// editor - and the TipTap/ProseMirror it vendors - into every public page's bundle.
// registry.test.ts fails the build if anyone reinstates one. See fields/registry.tsx.
import {
  SiteColourField,
  SiteFontField,
  BorderField,
  SectionBgColorField,
  HeroBgColorField,
  HeaderBgColorField,
  PageBgColorField,
  LayoutPickerField,
  ResponsiveSelectField,
  ResponsiveNumberField,
  VisibilityField,
  MinMaxPairField,
  ClearableNumberField,
  UnitValueField,
  ResponsiveUnitValueField,
} from '@/lib/puck/fields/registry'
import { moduleEmbedOptions } from '@/lib/puck/module-embed-options'
import { ThemeToggle as ThemeToggleClient } from '@/components/ThemeToggle'
import { moduleComponents, moduleComponentsByLayoutType } from '@/lib/puck/module-components'
import LoginForm from '@/components/members/LoginForm'
import RegisterForm from '@/components/members/RegisterForm'
import HeaderShrinkScroll from '@/lib/puck/components/HeaderShrinkScroll'
import ScaleToFit from '@/lib/puck/components/ScaleToFit'
import HeadingFitText from '@/lib/puck/components/HeadingFitText'
import { isHeaderShrinkEnabled, HEADER_SHRUNK_SELECTOR } from '@/lib/puck/headerShrink'

 

// Extensions matching Puck's default richtext configuration — used to convert
// TipTap JSON stored in publishedData back to HTML for the RSC render path.
const richtextExtensions = [
  Document, Paragraph, Text, Bold, Italic, Strike, Underline,
  TiptapHeading, Blockquote, Code, CodeBlock, HardBreak, HorizontalRule,
  // Without an explicit protocol list, TipTap will happily accept a
  // `javascript:` href, which then rides the stored content all the way to the
  // published page. (The published render also sanitises - see config.rsc.tsx -
  // since this only governs what the editor lets in, not what's already stored.)
  Link.configure({ protocols: ['http', 'https', 'mailto', 'tel'] }),
  BulletList, OrderedList, ListItem,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
]

// The HTML a RichText block's stored content resolves to. Content is either a
// raw HTML string or TipTap JSON (what the builder stores); both end up as an
// HTML string here. Exported so the RSC config can produce byte-identical markup
// and then sanitise it - see sanitizeRichText in lib/sanitize.ts, which can't be
// imported here because config.tsx is reachable from the client Puck editors and
// would drag jsdom into the browser bundle.
export function richTextContentToHtml(content: unknown, obfuscate: boolean): string {
  if (typeof content === 'string') {
    return obfuscate ? obfuscateEmailsInHtml(content) : content
  }
  let html = ''
  try {
    html = generateHTML(content as JSONContent, richtextExtensions)
  } catch {
    html = ''
  }
  return obfuscate ? obfuscateEmailsInHtml(html) : html
}

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

// Padding size keys shared with the cactus-pad-* utility classes emitted by
// buildTokenStyles (lib/design/tokens.ts) - the values live there.
const PAD_KEYS = new Set(['default', 'none', 'sm', 'md', 'lg', 'xl'])
// Block padding is horizontal-only: it acts as a left/right gutter so content
// doesn't run to the page edges, without stacking vertical gaps on top of each
// block's own margins. 'default' (and unset) pulls the site-wide gutter set in
// Styles → Spacing, falling back to 1.5rem to match the Section/footer gutters.
// Resolves the (possibly per-device) padding value to the cactus-pad-*
// utility classes emitted by buildTokenStyles. The desktop→tablet→mobile
// inheritance cascade is resolved here in JS - every element carries all
// three classes - so the stylesheet only needs one flat rule per size per
// breakpoint and tablet/mobile always inherit from the next-wider device.
// 'default' (and unset) pulls the site-wide gutter set in Styles → Spacing
// via var(--block-padding, 1.5rem), same as the old inline getPadding did.
export function getPaddingClasses(padding?: ResponsiveValue<string> | string): string {
  const rv = normalizeResponsiveValue<string>(padding as ResponsiveValue<string> | string | undefined)
  const norm = (v: string | undefined, fallback: string) => (v && PAD_KEYS.has(v) ? v : fallback)
  const d = norm(rv.desktop, 'default')
  const t = norm(rv.tablet, d)
  const m = norm(rv.mobile, t)
  return `cactus-pad-d-${d} cactus-pad-t-${t} cactus-pad-m-${m}`
}

const paddingField = {
  type: 'custom' as const,
  label: 'Padding (left/right)',
  render: ResponsiveSelectField,
  options: [
    { value: 'default', label: 'Default (site spacing)' },
    { value: 'none', label: 'None' },
    { value: 'sm', label: 'Small (0.5rem)' },
    { value: 'md', label: 'Medium (1rem)' },
    { value: 'lg', label: 'Large (2rem)' },
    { value: 'xl', label: 'Extra large (4rem)' },
  ],
}

// Reuse a page block inside a container that already provides its own gutter
// (e.g. the footer/header roots) without inheriting the site default padding.
function noGutterDefault<T extends { defaultProps?: Record<string, any> }>(component: T): T {
  return { ...component, defaultProps: { ...component.defaultProps, padding: 'none' } }
}

const GAP_MAP: Record<string, string> = { none: '0', sm: '0.5rem', md: '1rem', lg: '2rem' }
const SPACE_BELOW_MAP: Record<string, string> = { none: '0', sm: '0.75rem', md: '1.5rem', lg: '3rem' }
// Vertical padding scale, shared by every block that has a "Vertical padding"
// field (Section, CTA Banner), so Medium means the same height of breathing room
// wherever it's picked. The horizontal half of the pair lives in the
// cactus-pad-* utility classes (tokens.ts) - these are inline because they vary
// per block instance rather than per site.
const PADDING_Y_MAP: Record<string, string> = { none: '0', sm: '2rem', md: '4rem', lg: '6rem', xl: '10rem' }
const PADDING_Y_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'Extra large' },
]
// Section's own vertical-padding list: the shared options plus "Full view
// height", which isn't a padding value at all but a `min-height: 100vh` on the
// section - it lives in this setting because that's where an owner looks to make
// a section taller. Section-only (not on the shared list) so the other blocks
// that reuse PADDING_Y_OPTIONS, like CTABanner, don't offer an option their
// render can't honour. When 'screen' is picked the padding falls back to the
// 'lg' spacing so the content isn't jammed against the viewport edges.
const SECTION_PADDING_Y_OPTIONS = [
  ...PADDING_Y_OPTIONS,
  { value: 'screen', label: 'Full view height (100vh)' },
]

// AOS (Animate On Scroll) helpers — data attributes rendered server-side, AOS JS picks them up client-side
const AOS_TYPE_MAP: Record<string, string> = {
  'fade-in': 'fade', 'slide-up': 'fade-up', 'slide-down': 'fade-down',
  'slide-left': 'fade-left', 'slide-right': 'fade-right',
  'zoom-in': 'zoom-in', 'zoom-out': 'zoom-out',
}
const AOS_DURATION_MAP: Record<string, string> = { fast: '300', normal: '600', slow: '1000' }
const AOS_DELAY_MAP: Record<string, string> = { none: '0', '100ms': '100', '200ms': '200', '400ms': '400', '600ms': '600' }

export function getAosProps(animationType: string, animationDuration: string, animationDelay: string): Record<string, string> {
  if (!animationType || animationType === 'none') return {}
  return {
    'data-aos': AOS_TYPE_MAP[animationType] ?? animationType,
    'data-aos-duration': AOS_DURATION_MAP[animationDuration] ?? '600',
    'data-aos-delay': AOS_DELAY_MAP[animationDelay] ?? '0',
  }
}

const aosFields = {
  animationType: {
    type: 'select' as const, label: 'Scroll animation',
    options: [
      { value: 'none', label: 'None' }, { value: 'fade-in', label: 'Fade in' },
      { value: 'slide-up', label: 'Slide up' }, { value: 'slide-down', label: 'Slide down' },
      { value: 'slide-left', label: 'Slide left' }, { value: 'slide-right', label: 'Slide right' },
      { value: 'zoom-in', label: 'Zoom in' }, { value: 'zoom-out', label: 'Zoom out' },
    ],
  },
  animationDuration: {
    type: 'select' as const, label: 'Animation speed',
    options: [
      { value: 'fast', label: 'Fast (300ms)' }, { value: 'normal', label: 'Normal (600ms)' }, { value: 'slow', label: 'Slow (1s)' },
    ],
  },
  animationDelay: {
    type: 'select' as const, label: 'Animation delay',
    options: [
      { value: 'none', label: 'None' }, { value: '100ms', label: '100ms' },
      { value: '200ms', label: '200ms' }, { value: '400ms', label: '400ms' }, { value: '600ms', label: '600ms' },
    ],
  },
}
const aosDefaults = { animationType: 'none', animationDuration: 'normal', animationDelay: 'none' }

// Generic "stick while scrolling" pair, shared by the content blocks that can
// usefully pin themselves beside taller siblings (an image next to long text,
// a buy-box button column, a spec sheet). Same field keys the Section block
// already uses, so the central stickyOffset trim in withResponsiveVisibility
// covers every one of them. The offset needs `sticky: 'on'` to show at all.
const STICKY_FIELDS = {
  sticky: { type: 'select' as const, label: 'Stick while scrolling', options: [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On (sticks within its column/section)' }] },
  stickyOffset: { type: 'custom' as const, label: 'Sticky offset', units: ['px', 'rem', 'vh'], render: UnitValueField },
}
const STICKY_DEFAULTS = { sticky: 'off', stickyOffset: '' }

// position:sticky only travels while the block's parent is taller than the
// block, and is silently disabled by any overflow:hidden ancestor - both are
// layout facts the block can't check from here, so 'on' just sets the style.
export function getStickyStyle(sticky: string | undefined, stickyOffset: string | undefined): React.CSSProperties {
  if (sticky !== 'on') return {}
  return { position: 'sticky', top: stickyOffset || '0px', zIndex: 1 }
}

// Responsive visibility — injected into every component below (see the
// `withResponsiveVisibility` map at the bottom of `components:`) rather than
// hand-added per block, so all ~40+ block types (including module-contributed
// ones) get it uniformly. Reuses the .hide-mobile/-tablet/-desktop utility
// classes already emitted by buildTokenStyles (lib/design/tokens.ts).
// Single combined field (VisibilityField) replaces the old three separate
// "Hide on desktop / tablet / mobile: Yes/No" dropdowns with one row of
// Desktop/Tablet/Mobile icon toggles.
const VISIBILITY_FIELDS = {
  visibility: { type: 'custom' as const, label: 'Visibility', render: VisibilityField },
}
const VISIBILITY_DEFAULTS = { visibility: { desktop: 'false', tablet: 'false', mobile: 'false' } }

// `display:contents` keeps the wrapper out of layout entirely when nothing is
// hidden (so flex/grid parents see the block's own markup as before), while
// still giving the responsive @media rules an element to hide when it is.
// Exported separately from `withResponsiveVisibility` because config.rsc.tsx
// swaps in RSC-only render functions for a handful of components (SiteLogo,
// Members*, LayoutEmbed) without re-declaring their fields — reusing this
// wrapper there keeps those live-site renders honouring the same hide
// settings the editor exposes, instead of silently ignoring them.
export function wrapResponsiveRender(render: (props: any) => React.ReactNode) {
  return function ResponsiveVisibility(props: any) {
    const { visibility, ...rest } = props
    const v = normalizeResponsiveValue<string>(visibility)
    const classes = [
      v.desktop === 'true' && 'hide-desktop',
      v.tablet === 'true' && 'hide-tablet',
      v.mobile === 'true' && 'hide-mobile',
    ].filter(Boolean).join(' ')
    const content = render(rest)
    if (!classes) return content
    return <div className={classes} style={{ display: 'contents' }}>{content}</div>
  }
}

function withResponsiveVisibility(def: any): any {
  const ownResolve = def.resolveFields
  return {
    ...def,
    fields: { ...VISIBILITY_FIELDS, ...def.fields },
    defaultProps: { ...VISIBILITY_DEFAULTS, ...def.defaultProps },
    // Central applicable-only trims, applied AFTER any per-block resolveFields
    // so every component (module blocks included) gets them for free: animation
    // speed/delay only mean anything once a scroll animation is picked, and a
    // sticky offset only once the block actually sticks.
    resolveFields: (data: any, ctx: any) => {
      let fields = ownResolve ? ownResolve(data, ctx) : ctx.fields
      const p = data?.props ?? {}
      if ('animationDuration' in fields && (!p.animationType || p.animationType === 'none')) {
        const rest = { ...fields }
        delete rest.animationDuration
        delete rest.animationDelay
        fields = rest
      }
      if ('sticky' in fields && 'stickyOffset' in fields && p.sticky !== 'on') {
        const rest = { ...fields }
        delete rest.stickyOffset
        fields = rest
      }
      return fields
    },
    render: wrapResponsiveRender(def.render),
  }
}

// ---------------------------------------------------------------------------
// Layout blocks
// ---------------------------------------------------------------------------

// The 2-track presets (auto-fill, 30-70, etc) only mean anything when
// getGridTemplateColumns has exactly 2 columns to divide - grid's own field
// options are trimmed to hide them for 3/4-column grids (see Grid's
// resolveFields below).
const TWO_COL_ONLY_SIZE_VALUES = new Set(['auto-fill', 'fill-auto', '30-70', '40-60', '60-40', '70-30'])
const GRID_COLUMN_SIZE_OPTIONS = [
  { value: 'equal', label: 'Equal' },
  { value: 'auto-fill', label: 'Auto + fill' },
  { value: 'fill-auto', label: 'Fill + auto' },
  { value: '30-70', label: '30 / 70' },
  { value: '40-60', label: '40 / 60' },
  { value: '60-40', label: '60 / 40' },
  { value: '70-30', label: '70 / 30' },
  { value: 'manual', label: 'Manual (set each column below)' },
]

// A custom width wins over the columnSizes preset for its own column; columns
// left blank fall back to `1fr` so a single custom width doesn't collapse its
// neighbours to zero width.
function getGridTemplateColumns(columnSizes: string | undefined, colCount: number, colWidths?: Array<string | undefined>): string {
  if (colWidths?.slice(0, colCount).some(w => w && w.trim())) {
    // minmax(0, W) - a 0 minimum so the track actually honours the width the
    // user set instead of being propped open by its content. A bare `1fr` (and
    // a bare `2fr`, which the grid spec treats as `minmax(auto, 2fr)`) carries
    // an automatic min-content floor, so without the explicit 0 min a column
    // won't shrink below its widest child - e.g. a width:100% image keeps the
    // column at its natural size and ignores a smaller requested width. Content
    // shrinks with the track (images are width:100%) and long text wraps inside
    // it via the overflow-wrap:break-word set on each column wrapper below, so
    // nothing spills into a neighbouring column. Columns left blank fall back to
    // `1fr` so a single custom width doesn't collapse its neighbours to zero.
    return colWidths.slice(0, colCount).map(w => {
      const v = w && w.trim()
      return v ? `minmax(0, ${v})` : '1fr'
    }).join(' ')
  }
  if (colCount === 2) {
    const m: Record<string, string> = {
      'auto-fill': 'auto 1fr', 'fill-auto': '1fr auto',
      '30-70': '3fr 7fr', '40-60': '4fr 6fr', '60-40': '6fr 4fr', '70-30': '7fr 3fr',
    }
    if (columnSizes && m[columnSizes]) return m[columnSizes]
  }
  return `repeat(${colCount}, 1fr)`
}

function GridBlock(props: any) {
  const { id, columns, gap, gapShrunk, padding, col1, col2, col3, col4, verticalAlign, columnSizes, col1Align, col2Align, col3Align, col4Align, col1Width, col2Width, col3Width, col4Width, col1WidthShrunk, col2WidthShrunk, col3WidthShrunk, col4WidthShrunk, spaceBelow, stackAtTablet, col1Sticky, col2Sticky, col3Sticky, col4Sticky, col1StickyOffset, col2StickyOffset, col3StickyOffset, col4StickyOffset, animationType, animationDuration, animationDelay } = props
  const colCount = parseInt(columns ?? '2', 10)
  const slots = [col1, col2, col3, col4].slice(0, colCount)
  const colAligns = [col1Align, col2Align, col3Align, col4Align]
  const colStickies = [col1Sticky, col2Sticky, col3Sticky, col4Sticky].map((s) => s === 'on')
  const colStickyOffsets = [col1StickyOffset, col2StickyOffset, col3StickyOffset, col4StickyOffset]
  const anyColSticky = colStickies.slice(0, colCount).some(Boolean)
  const justifyMap: Record<string, string> = { center: 'center', end: 'flex-end' }

  // Header-only true-centering. A column set to "Centre" is pulled onto the
  // header's own centre line (absolute, left:50%) instead of being centred
  // within its own grid track, so it stays put when a flanking element's
  // rendered width changes (e.g. the logo shrinking on scroll). Scoped to
  // header[data-header-root]: inert for the same Grid dropped into page content
  // or the footer, and breakpoint-agnostic (anchored to the header box, not a
  // track width) so it needs no tablet/mobile media variants.
  const centerColIndexes = colAligns.slice(0, colCount).map((a, i) => (a === 'center' ? i : -1)).filter((i) => i >= 0)

  // columnSizes/col*Width are ResponsiveValue<string> objects ({desktop,
  // tablet, mobile}), but pre-existing data (and any default) stores them as
  // a plain string - normalise before reading a breakpoint out of them.
  const sizes = normalizeResponsiveValue<string>(columnSizes)
  const widths = [col1Width, col2Width, col3Width, col4Width].map((w) => normalizeResponsiveValue<string>(w))
  const pick = (rv: ResponsiveValue<string>, device: 'desktop' | 'tablet' | 'mobile'): string | undefined =>
    device === 'desktop' ? rv.desktop : device === 'tablet' ? (rv.tablet ?? rv.desktop) : (rv.mobile ?? rv.tablet ?? rv.desktop)
  const effectiveAt = (device: 'desktop' | 'tablet' | 'mobile') =>
    getGridTemplateColumns(pick(sizes, device), colCount, widths.map((w) => pick(w, device)))
  const desktopCols = effectiveAt('desktop')
  const tabletCols = effectiveAt('tablet')
  const mobileCols = effectiveAt('mobile')
  const hasResponsiveOverride = tabletCols !== desktopCols || mobileCols !== desktopCols
  // Explicit per-column widths (any breakpoint) mean the user has taken manual
  // control of this grid's columns. Mark it as self-managed so the generic
  // tablet/mobile collapse defaults in buildTokenStyles (tokens.ts) - which
  // otherwise force header 3-col grids to `auto 1fr auto` in the 640-1024 band
  // and everything to `1fr` on mobile - leave those widths alone. Without this
  // a header with desktop-only manual widths silently loses them at tablet
  // width (incl. the narrower Puck editor canvas). A grid wanting to stack on
  // small screens can still set per-breakpoint widths (which also marks it).
  const hasManualColumns = widths.slice(0, colCount).some((w) => !!(w.desktop?.trim() || w.tablet?.trim() || w.mobile?.trim()))
  const selfManagedColumns = hasResponsiveOverride || hasManualColumns

  // Shrunk-state overrides (header "shrink on scroll" only) - fall back to the
  // normal width/gap per column (at the same breakpoint) when no shrunk value
  // is set, so leaving a column's shrunk width blank just means "don't shrink
  // this one". Responsive like col*Width itself, so e.g. a column can shrink
  // to a smaller width on scroll only once the layout has reached tablet.
  const shrunkWidths = [col1WidthShrunk, col2WidthShrunk, col3WidthShrunk, col4WidthShrunk].map((w) => normalizeResponsiveValue<string>(w))
  const hasShrunkOverride = !!gapShrunk || shrunkWidths.some((w) => !!(w.desktop?.trim() || w.tablet?.trim() || w.mobile?.trim()))
  // "Scale to width" is no longer a separate toggle - a column scales (via
  // ScaleToFit) whenever it has a shrunk width set, since that's the only
  // case a column's rendered width changes at runtime (shrink-on-scroll).
  const colScaled = shrunkWidths.map((w) => !!(w.desktop?.trim() || w.tablet?.trim() || w.mobile?.trim()))
  const shrunkColsAt = (device: 'desktop' | 'tablet' | 'mobile') =>
    getGridTemplateColumns(pick(sizes, device), colCount, shrunkWidths.map((w, i) => {
      const v = pick(w, device)
      return v && v.trim() ? v : pick(widths[i]!, device)
    }))
  const shrunkDesktopCols = hasShrunkOverride ? shrunkColsAt('desktop') : desktopCols
  const shrunkTabletCols = hasShrunkOverride ? shrunkColsAt('tablet') : tabletCols
  const shrunkMobileCols = hasShrunkOverride ? shrunkColsAt('mobile') : mobileCols

  // gap, vertical alignment and space-below vary per breakpoint too (columns
  // already do, above). col*Align is deliberately NOT responsive: the header
  // true-centering fix reads it in JS (centerColIndexes) to decide which
  // columns to absolutely centre, so a per-breakpoint object would break that.
  const gapRv = normalizeResponsiveValue<string>(gap)
  const vAlignRv = normalizeResponsiveValue<string>(verticalAlign)
  const spaceBelowRv = normalizeResponsiveValue<string>(spaceBelow)
  const vAlignMap: Record<string, string> = { stretch: 'stretch', start: 'start', center: 'center', end: 'end' }
  const gapVAlignCss = responsiveMediaCssFor(`[data-grid-id="${id}"]`, (d) => `gap:${GAP_MAP[pickResponsive(gapRv, d) ?? 'md'] ?? '1rem'};align-items:${vAlignMap[pickResponsive(vAlignRv, d) ?? 'stretch'] ?? 'stretch'};margin-bottom:${SPACE_BELOW_MAP[pickResponsive(spaceBelowRv, d) ?? 'md'] ?? '1.5rem'};`)

  // data-responsive-set opts this instance out of the generic tablet/mobile
  // collapse rules in buildTokenStyles (lib/design/tokens.ts), which only
  // exist as a sane default for grids that haven't set their own breakpoint
  // columns here.
  return (
    <>
      {hasResponsiveOverride && (
        <style>{[
          tabletCols !== desktopCols && `${tabletMediaQuery()}{[data-grid-id="${id}"]{grid-template-columns:${tabletCols} !important;}}`,
          mobileCols !== desktopCols && `${mobileMediaQuery()}{[data-grid-id="${id}"]{grid-template-columns:${mobileCols} !important;}}`,
        ].filter(Boolean).join('\n')}</style>
      )}
      {hasShrunkOverride && (
        <style>{[
          `${HEADER_SHRUNK_SELECTOR} [data-grid-id="${id}"]{grid-template-columns:${shrunkDesktopCols} !important;${gapShrunk ? `gap:${GAP_MAP[gapShrunk] ?? '1rem'} !important;` : ''}}`,
          shrunkTabletCols !== shrunkDesktopCols && `${tabletMediaQuery()}{${HEADER_SHRUNK_SELECTOR} [data-grid-id="${id}"]{grid-template-columns:${shrunkTabletCols} !important;}}`,
          shrunkMobileCols !== shrunkDesktopCols && `${mobileMediaQuery()}{${HEADER_SHRUNK_SELECTOR} [data-grid-id="${id}"]{grid-template-columns:${shrunkMobileCols} !important;}}`,
        ].filter(Boolean).join('\n')}</style>
      )}
      {centerColIndexes.length > 0 && (
        <style>{centerColIndexes.map((i) =>
          `header[data-header-root] [data-grid-id="${id}"] > div:nth-child(${i + 1}){position:absolute;left:50%;transform:translateX(-50%);}`
        ).join('\n')}</style>
      )}
      {gapVAlignCss && <style>{gapVAlignCss}</style>}
      {anyColSticky && (
        <style>{[
          `${mobileMediaQuery()}{[data-grid-id="${id}"]>[data-col-sticky]{position:static !important;top:auto !important;}}`,
          stackAtTablet === 'on' && `${tabletMediaQuery()}{[data-grid-id="${id}"]>[data-col-sticky]{position:static !important;top:auto !important;}}`,
        ].filter(Boolean).join('')}</style>
      )}
      <div
        className={`puck-grid ${getPaddingClasses(padding)}`}
        data-cols={colCount}
        data-grid-id={id}
        {...getAosProps(animationType, animationDuration, animationDelay)}
        {...(stackAtTablet === 'on' ? { 'data-stack-tablet': '' } : {})}
        {...(selfManagedColumns ? { 'data-responsive-set': '' } : {})}
        style={{
      display: 'grid',
      gridTemplateColumns: desktopCols,
      gap: GAP_MAP[pickResponsive(gapRv, 'desktop') ?? 'md'] ?? '1rem',
      marginBottom: SPACE_BELOW_MAP[pickResponsive(spaceBelowRv, 'desktop') ?? 'md'] ?? '1.5rem',
      alignItems: (vAlignMap as any)[pickResponsive(vAlignRv, 'desktop') ?? 'stretch'] ?? 'stretch',
    }}>
      {slots.map((slot, i) => {
        const jc = colAligns[i] && justifyMap[colAligns[i]]
        const scaled = colScaled[i]
        // Puck's editor stylesheet sizes every slot wrapper `height: 100%`
        // (._DropZone), so a child set to "fill container" resolves its own
        // 100% against the stretched column track. The published page ships no
        // Puck stylesheet and SlotRender emits that same wrapper as a bare,
        // auto-height <div>, so the child's 100% resolved against `auto` and
        // collapsed to content height. Pass the height in explicitly to keep
        // the two paths in step. Invisible for ordinary content: the wrapper
        // paints nothing and its children still flow from the top.
        const content = typeof slot === 'function' ? slot({ style: { height: '100%' } }) : null
        // A scaled column manages its own flex/alignment inside ScaleToFit, so
        // the track div stays a plain block (no flex/fit-content wrapper).
        // Explicit gridColumn ONLY when a column is centred (header true-
        // centering) - see comment below. Pinning every column to its track
        // unconditionally breaks the generic mobile collapse: when the
        // grid-template drops to a single `1fr` track (tokens.ts mobile rule),
        // a child still carrying `grid-column:2` is shunted into an implicit
        // second track instead of stacking, so the columns never go vertical
        // on a phone. Left undefined, auto-placement stacks them as intended.
        const explicitCol = centerColIndexes.length > 0 ? i + 1 : undefined
        // A sticky column pins its own track box (whose containing block is the
        // full-height grid row) while the taller sibling scrolls past. `start`
        // align keeps the box its content height (not stretched to the row) so
        // there is room to travel; the media rules below drop it back to static
        // once the grid stacks. Marked with data-col-sticky for those rules.
        const colSticky = colStickies[i]
        const stickyStyle = colSticky
          ? { position: 'sticky' as const, top: colStickyOffsets[i] || '0px', alignSelf: 'start' as const, zIndex: 1 }
          : {}
        return (
          <div key={i} {...(colSticky ? { 'data-col-sticky': '' } : {})} style={{ minWidth: 0, overflowWrap: 'break-word', gridColumn: explicitCol, ...stickyStyle, ...(!scaled && jc ? { display: 'flex', justifyContent: jc } : {}) }}>
            {/* Explicit gridColumn matters once any column is centred: an
                absolutely-positioned grid item is skipped by CSS Grid's
                auto-placement, so without an explicit track, later columns
                collapse into the vacated slot instead of holding their
                position (e.g. a "right" column landing under a centred nav). */}
            {/* Puck's own editor-canvas wrapper around a slot's dropped block
                stretches to fill this column (unlike the RSC/live render, which
                renders the block's own markup directly). Without this inner
                width:fit-content wrapper, that stretched wrapper leaves nothing
                for `justifyContent` to centre/end against, so a centred or
                right-aligned column looked left-aligned only in the editor. */}
            {scaled
              ? <ScaleToFit align={(colAligns[i] as 'start' | 'center' | 'end') ?? 'start'}>{content}</ScaleToFit>
              : jc ? <div style={{ width: 'fit-content', maxWidth: '100%' }}>{content}</div> : content}
          </div>
        )
      })}
      </div>
    </>
  )
}

// Grid2/Grid3/Grid4 - separate Puck component types, one per fixed column
// count, sharing GridBlock's render. Puck's Outline panel derives its zone
// list by walking each component TYPE's own static `fields` declaration
// (mapFields/walkTree in @puckeditor/core), completely bypassing resolveFields
// - so a single dynamic "Grid" with a Columns select field can never make
// Outline hide an unused col4 zone, no matter how resolveFields trims the
// sidebar form. Fixing that requires each column count to be its own
// component type, declaring only the slots it actually has.
// The original dynamic `Grid` (below) stays registered - unchanged, still
// fully renderable/editable - purely so existing data (saved-block library
// entries or Layout/InfoPage history snapshots) that a migration missed keeps
// working; it's just no longer listed in any category's `components` picker.
function readColumnSizesMode(columnSizes: unknown): string | undefined {
  return typeof columnSizes === 'string' ? columnSizes : (columnSizes as any)?.desktop
}

function makeGridColumnComponent(colCount: 2 | 3 | 4) {
  const cols = Array.from({ length: colCount }, (_, i) => i + 1)
  const alignOptions = [{ value: 'start', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'end', label: 'Right' }]

  const fields: Record<string, unknown> = {
    columnSizes: {
      type: 'custom' as const,
      label: 'Column widths',
      options: colCount === 2 ? GRID_COLUMN_SIZE_OPTIONS : GRID_COLUMN_SIZE_OPTIONS.filter((o) => !TWO_COL_ONLY_SIZE_VALUES.has(o.value)),
      render: ResponsiveSelectField,
    },
    verticalAlign: { type: 'custom' as const, label: 'Vertical align', options: [{ value: 'stretch', label: 'Stretch' }, { value: 'start', label: 'Top' }, { value: 'center', label: 'Middle' }, { value: 'end', label: 'Bottom' }], render: ResponsiveSelectField },
    gap: { type: 'custom' as const, label: 'Gap', options: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }], render: ResponsiveSelectField },
    padding: paddingField,
    spaceBelow: { type: 'custom' as const, label: 'Space below', options: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }], render: ResponsiveSelectField },
    // Force a single stacked column from the tablet breakpoint down (not just
    // mobile). Default 'off' keeps the standard behaviour where a 2-column grid
    // stays side-by-side through the tablet band and only stacks on mobile.
    stackAtTablet: { type: 'select' as const, label: 'Stack on tablet', options: [{ value: 'off', label: 'Off (stack on mobile only)' }, { value: 'on', label: 'On (stack from tablet down)' }] },
  }
  for (const n of cols) fields[`col${n}Align`] = { type: 'select' as const, label: `Col ${n} align`, options: alignOptions }
  for (const n of cols) fields[`col${n}Width`] = { type: 'custom' as const, label: `Col ${n} width`, units: ['px', '%', 'fr', 'rem', 'vw'], render: ResponsiveUnitValueField }
  // Pin a column in place while the taller column scrolls past (e.g. an image
  // that stays beside a long text column). Auto-releases once the grid stacks
  // to one column (mobile, or the tablet band when "Stack on tablet" is on) so
  // the pinned block just sits in normal flow there instead of floating.
  for (const n of cols) fields[`col${n}Sticky`] = { type: 'select' as const, label: `Col ${n} sticky`, options: [{ value: 'off', label: 'Off' }, { value: 'on', label: 'Stick while scrolling' }] }
  for (const n of cols) fields[`col${n}StickyOffset`] = { type: 'custom' as const, label: `Col ${n} sticky offset`, units: ['px', 'rem'], render: UnitValueField }
  // Shrunk-state fields - only shown when this Grid sits in a header with
  // "Shrink on scroll" turned on (see resolveFields below). Blank = don't
  // shrink that column/gap. Setting a shrunk width also opts the column into
  // "scale to width" (any content - fixed-size icons, widgets, images - via a
  // transform scale) automatically, since that's the only case a column's
  // rendered width actually changes at runtime.
  fields.gapShrunk = { type: 'select' as const, label: 'Shrunk gap', options: [{ value: '', label: 'Same as gap' }, { value: 'none', label: 'None' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }] }
  for (const n of cols) fields[`col${n}WidthShrunk`] = { type: 'custom' as const, label: `Col ${n} shrunk width`, units: ['px', '%', 'fr', 'rem', 'vw'], render: ResponsiveUnitValueField }
  Object.assign(fields, aosFields)
  for (const n of cols) fields[`col${n}`] = { type: 'slot' as const }

  const defaultProps: Record<string, unknown> = { columns: String(colCount), gap: 'md', padding: 'none', columnSizes: 'equal', verticalAlign: 'stretch', spaceBelow: 'md', stackAtTablet: 'off', gapShrunk: '', ...aosDefaults }
  for (const n of cols) { defaultProps[`col${n}Align`] = 'start'; defaultProps[`col${n}Width`] = ''; defaultProps[`col${n}WidthShrunk`] = ''; defaultProps[`col${n}Sticky`] = 'off'; defaultProps[`col${n}StickyOffset`] = '' }

  return {
    label: `Grid (${colCount} columns)`,
    fields,
    defaultProps,
    resolveFields: (data: any, { fields: f, appState }: any) => {
      const result: Record<string, any> = { ...f }
      if (!isHeaderShrinkEnabled(appState)) {
        delete result.gapShrunk
        for (const n of cols) delete result[`col${n}WidthShrunk`]
      }
      // A sticky offset has nothing to offset until that column actually sticks.
      for (const n of cols) {
        if (data.props?.[`col${n}Sticky`] !== 'on') delete result[`col${n}StickyOffset`]
      }
      const isManual = readColumnSizesMode(data.props?.columnSizes) === 'manual'
      if (!isManual) for (const n of cols) delete result[`col${n}Width`]
      return result
    },
    // Leaving Manual mode hides col*Width but getGridTemplateColumns still lets
    // a non-blank width win over the preset regardless of columnSizes - without
    // this, switching back to "Equal" would silently keep rendering the old
    // manual widths while the field claiming "Equal" is out of view.
    resolveData: (data: any, { changed }: any) => {
      if (!changed.columnSizes) return data
      if (readColumnSizesMode(data.props?.columnSizes) === 'manual') return data
      const patch: Record<string, string> = {}
      for (const n of cols) {
        const w = data.props?.[`col${n}Width`]
        const v = typeof w === 'string' ? w : (w?.desktop ?? w?.tablet ?? w?.mobile)
        if (v && v.trim()) patch[`col${n}Width`] = ''
      }
      if (!Object.keys(patch).length) return data
      return { ...data, props: { ...data.props, ...patch } }
    },
    render: GridBlock,
  }
}

const grid2Component = makeGridColumnComponent(2)
const grid3Component = makeGridColumnComponent(3)
const grid4Component = makeGridColumnComponent(4)

function GroupBlock(props: any) {
  const { id, direction, justify, align, wrap, gap, gapShrunk, padding, items, columns } = props
  const justifyMap: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between', around: 'space-around', evenly: 'space-evenly' }
  const alignMap: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' }
  if (typeof items !== 'function') return null
  const shrinkClass = `group-shrink-${id}`
  const rspClass = `group-rsp-${id}`
  // Header-only true-centering for a 3-item group whose items are space-
  // distributed (between/around/evenly): the middle item is pulled onto the
  // header's own centre line (absolute, left:50%) so it stays put when a
  // flanking item's rendered width changes. The "exactly 3 items" gate lives in
  // pure CSS - :nth-child(2):nth-last-child(2) matches the 2nd child only when
  // it is also 2nd-from-last, i.e. only when there are exactly 3 - because the
  // item count isn't available in render (items is the slot render function,
  // not the array). Scoped to header[data-header-root]: inert outside a header.
  const wantsCenter = justify === 'between' || justify === 'around' || justify === 'evenly'
  const centerClass = `group-center-${id}`
  // direction, align and gap vary per breakpoint. justify stays flat on purpose:
  // the centering gate above reads it. The media override targets the flex
  // container's own class and carries !important (via responsiveMediaCssFor) to
  // beat the inline base style below.
  const dirRv = normalizeResponsiveValue<string>(direction)
  const alignRv = normalizeResponsiveValue<string>(align)
  const gapRv = normalizeResponsiveValue<string>(gap)
  const dirBase = pickResponsive(dirRv, 'desktop')
  const alignBase = pickResponsive(alignRv, 'desktop')
  const gapBase = pickResponsive(gapRv, 'desktop')

  // "Columns" turns the Group from its default flex-wrap flow into an equal-
  // width CSS grid: an arbitrary number of children sit N-per-row and reflow to
  // a different N per breakpoint (e.g. 3 desktop / 2 tablet / 1 mobile). This is
  // what the fixed-track Grid block can't do - Grid caps at 4 tracks with one
  // child DropZone each, so 6 boxes there become two 3-track grids that orphan
  // the odd item when a track drops out at tablet. 'auto' (or blank / any legacy
  // Group with no columns prop) keeps the flex behaviour untouched, so every
  // existing Group renders byte-identically.
  const colsRv = normalizeResponsiveValue<string>(columns)
  const parseCols = (v?: string) => {
    const n = v && v !== 'auto' ? parseInt(v, 10) : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const gridMode = parseCols(pickResponsive(colsRv, 'desktop')) !== null

  if (gridMode) {
    // Column count cascades desktop→tablet→mobile like every other responsive
    // field; a breakpoint left on 'auto' inherits the nearest set count rather
    // than dropping back to flow, so the grid stays a grid all the way down.
    const tracksAt = (d: Device) => {
      const n = parseCols(pickResponsive(colsRv, d)) ?? parseCols(pickResponsive(colsRv, 'desktop')) ?? 1
      return `repeat(${n}, minmax(0, 1fr))`
    }
    const gridCss = responsiveMediaCssFor(`.${rspClass}`, (d) => `grid-template-columns:${tracksAt(d)};gap:${GAP_MAP[pickResponsive(gapRv, d) ?? 'md'] ?? '1rem'};align-items:${alignMap[pickResponsive(alignRv, d) ?? 'stretch'] ?? 'stretch'};`)
    const gridSlotClassName = [gapShrunk ? shrinkClass : '', rspClass, getPaddingClasses(padding)].filter(Boolean).join(' ')
    return (
      <>
        {gapShrunk && <style>{`${HEADER_SHRUNK_SELECTOR} .${shrinkClass}{gap:${GAP_MAP[gapShrunk] ?? '1rem'} !important;}`}</style>}
        {gridCss && <style>{gridCss}</style>}
        {items({
          className: gridSlotClassName,
          style: {
            display: 'grid',
            gridTemplateColumns: tracksAt('desktop'),
            alignItems: alignMap[alignBase ?? 'stretch'] ?? 'stretch',
            gap: GAP_MAP[gapBase ?? 'md'] ?? '1rem',
          }
        })}
      </>
    )
  }

  const rspCss = responsiveMediaCssFor(`.${rspClass}`, (d) => `flex-direction:${pickResponsive(dirRv, d) === 'column' ? 'column' : 'row'};align-items:${alignMap[pickResponsive(alignRv, d) ?? 'stretch'] ?? 'stretch'};gap:${GAP_MAP[pickResponsive(gapRv, d) ?? 'md'] ?? '1rem'};`)
  const slotClassName = [gapShrunk ? shrinkClass : '', wantsCenter ? centerClass : '', rspClass, getPaddingClasses(padding)].filter(Boolean).join(' ')
  // Pass flex styles directly to the SlotRender wrapper so its children are
  // proper flex items rather than sitting inside an unstyled block container.
  return (
    <>
      {gapShrunk && <style>{`${HEADER_SHRUNK_SELECTOR} .${shrinkClass}{gap:${GAP_MAP[gapShrunk] ?? '1rem'} !important;}`}</style>}
      {wantsCenter && <style>{`header[data-header-root] .${centerClass} > *:nth-child(2):nth-last-child(2){position:absolute;left:50%;transform:translateX(-50%);}`}</style>}
      {rspCss && <style>{rspCss}</style>}
      {items({
        className: slotClassName,
        style: {
          display: 'flex',
          flexDirection: dirBase === 'column' ? 'column' : 'row',
          justifyContent: justifyMap[justify] ?? 'flex-start',
          alignItems: alignMap[alignBase ?? 'stretch'] ?? 'stretch',
          flexWrap: wrap === 'nowrap' ? 'nowrap' : 'wrap',
          gap: GAP_MAP[gapBase ?? 'md'] ?? '1rem',
        }
      })}
    </>
  )
}

function SiteHeaderBlock(props: any) {
  const {
    logoUrl, logoUrlDark, siteName, resolvedItems,
    bg = { mode: 'color', color: 'var(--color-bg)' }, height = '64px',
    sticky = 'yes', border = { show: 'show', color: 'var(--color-border)' },
    maxWidth = '1200px', logoHeight = 40, showTextWithLogo = 'false',
    logoHomeUrl = '/', itemFontSize = 'medium', itemFontWeight = 'medium',
    itemColor = '', itemFontFamily = '', hoverColor = '', hoverBackground = '', activeColor = '', activeFontWeight = '',
    activeUnderline = 'none', activeUnderlineColor = '', activeUnderlineThickness = '', activeUnderlineOffset = '',
    showDropdowns = 'hover', alignment = 'flex-start', showMobileToggle = 'collapse', showTabletToggle = 'collapse',
  } = props
  const bgMode = bg.mode ?? 'color'
  const bgColor = bg.color || 'var(--color-bg)'
  const showText = showTextWithLogo === 'true' || showTextWithLogo === true
  return (
    <header
      data-bg-mode={bgMode}
      style={{
        height: height === 'auto' ? undefined : height,
        minHeight: height === 'auto' ? 48 : undefined,
        background: bgMode === 'transparent' ? 'transparent' : bgColor,
        borderBottom: border?.show === 'show' ? `1px solid ${border?.color || 'var(--color-border)'}` : 'none',
        position: sticky === 'yes' ? 'sticky' : 'relative',
        top: sticky === 'yes' ? 0 : undefined,
        zIndex: sticky === 'yes' ? 100 : undefined,
        width: '100%',
      }}
    >
      <div style={{
        maxWidth: maxWidth === 'none' ? '100%' : maxWidth,
        margin: '0 auto',
        padding: '0 1.5rem',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '2rem',
      }}>
        <SiteLogoRsc logoUrl={logoUrl} logoUrlDark={logoUrlDark} siteName={siteName} logoHeight={logoHeight} showTextWithLogo={showText ? 'true' : 'false'} showIcon="true" homeUrl={logoHomeUrl} />
        {resolvedItems && (
          <MenuBlockClient resolvedItems={resolvedItems} spacing="normal" alignment={alignment} itemFontSize={itemFontSize} itemFontWeight={itemFontWeight} textTransform="none" itemColor={itemColor} itemFontFamily={itemFontFamily} hoverColor={hoverColor} hoverBackground={hoverBackground} activeColor={activeColor} activeFontWeight={activeFontWeight} activeUnderline={activeUnderline} activeUnderlineColor={activeUnderlineColor} activeUnderlineThickness={activeUnderlineThickness} activeUnderlineOffset={activeUnderlineOffset} showDropdowns={showDropdowns} showMobileToggle={showMobileToggle} showTabletToggle={showTabletToggle} />
        )}
      </div>
    </header>
  )
}

function SplitBlock(props: any) {
  const { puck, id, ratio, align = 'stretch', gap = 'md', padding, animationType, animationDuration, animationDelay } = props
  const alignMap: Record<string, string> = { stretch: 'stretch', start: 'flex-start', center: 'center', end: 'flex-end' }

  const gridCols: Record<string, string> = {
    '50/50': '1fr 1fr',
    '60/40': '3fr 2fr',
    '40/60': '2fr 3fr',
    '70/30': '7fr 3fr',
    '30/70': '3fr 7fr',
  }
  const cols = gridCols[ratio] ?? '1fr 1fr'

  // Vertical align and gap vary per breakpoint. Ratio (grid-template-columns) is
  // deliberately left flat: splits are force-collapsed to a single column below
  // the mobile breakpoint by a global !important rule in tokens.ts, so a
  // per-breakpoint ratio couldn't take effect at mobile anyway.
  const alignRv = normalizeResponsiveValue<string>(align)
  const gapRv = normalizeResponsiveValue<string>(gap)
  const alignBase = pickResponsive(alignRv, 'desktop') ?? 'stretch'
  const gapBase = pickResponsive(gapRv, 'desktop') ?? 'md'
  const padBase = pickResponsive(normalizeResponsiveValue<string>(padding), 'desktop') ?? 'default'
  const css = responsiveMediaCssFor(`[data-split-id="${id}"]`, (d) => `align-items:${alignMap[pickResponsive(alignRv, d) ?? 'stretch'] ?? 'stretch'};gap:${GAP_MAP[pickResponsive(gapRv, d) ?? 'md'] ?? '1rem'};`)

  return (
    <>
      {css && <style>{css}</style>}
      <div data-split-id={id} className={`puck-split ${getPaddingClasses(padding)}`} {...getAosProps(animationType, animationDuration, animationDelay)} style={{ display: 'grid', gridTemplateColumns: cols, alignItems: alignMap[alignBase] ?? 'stretch', gap: GAP_MAP[gapBase] ?? '1rem', marginBottom: padBase === 'none' ? 0 : '1.5rem' }}>
        <div>{puck?.renderDropZone?.({ zone: 'left', minEmptyHeight: 80 })}</div>
        <div>{puck?.renderDropZone?.({ zone: 'right', minEmptyHeight: 80 })}</div>
      </div>
    </>
  )
}

function Spacer(props: any) {
  const { id } = props
  const heights: Record<string, number> = { xs: 8, sm: 16, md: 32, lg: 64, xl: 96 }
  const rv = normalizeResponsiveValue<string>(props.height)
  // 'custom' takes its exact height from the paired unit field; blank custom
  // falls back to the medium preset rather than collapsing to nothing.
  const customRv = normalizeResponsiveValue<string>(props.heightCustom)
  const heightAt = (d: Device) => {
    const v = pickResponsive(rv, d) ?? 'md'
    if (v === 'custom') return (pickResponsive(customRv, d) ?? '').trim() || '32px'
    return `${heights[v] ?? 32}px`
  }
  const css = responsiveMediaCssFor(`[data-spacer-id="${id}"]`, (d) => `height:${heightAt(d)};`)
  return <>{css && <style>{css}</style>}<div data-spacer-id={id} style={{ height: heightAt('desktop') }} /></>
}

function Divider(props: any) {
  const { id, style, color, thickness, animationType, animationDuration, animationDelay } = props
  // gray/dark/brand are the legacy preset values; anything else is a raw CSS
  // colour straight from the swatch/manual picker. Blank keeps the old gray.
  const colors: Record<string, string> = { gray: 'var(--color-border)', dark: 'var(--color-fg)', brand: 'var(--color-primary)' }
  const lineColour = colors[color] ?? (color || colors.gray)
  const heights: Record<string, string> = { thin: '1px', medium: '2px', thick: '4px' }
  const rv = normalizeResponsiveValue<string>(thickness)
  const base = pickResponsive(rv, 'desktop') ?? 'thin'
  // Only the line thickness varies per breakpoint; style/colour stay from the
  // base rule, so the media override touches just border-top-width.
  const css = responsiveMediaCssFor(`[data-divider-id="${id}"]`, (d) => `border-top-width:${heights[pickResponsive(rv, d) ?? 'thin'] ?? '1px'};`)
  return (
    <>
      {css && <style>{css}</style>}
      <hr data-divider-id={id} {...getAosProps(animationType, animationDuration, animationDelay)} style={{
        border: 'none',
        borderTop: `${heights[base] ?? '1px'} ${style ?? 'solid'} ${lineColour}`,
        margin: '1.5rem 0',
      }} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Section block — full-width container with background, padding, AOS, sticky
// ---------------------------------------------------------------------------

function SectionBlock(props: any) {
  const {
    id, content, bg = { mode: 'none', color: '' }, bgImage = '', bgSize = 'cover',
    overlayColor = '', overlayOpacity = 0,
    paddingY = 'lg', maxWidth = 'standard', maxWidthCustom = '', textColor = '',
    contentAlign = 'top',
    sticky = 'off', stickyOffset = '0px',
    animationType = 'none', animationDuration = 'normal', animationDelay = 'none',
    boxShadow = 'none', borderStyle = 'none', borderColor = 'var(--color-border)',
    borderWidth = '1px', borderRadius = 'none', opacity = '100',
  } = props

  const paddingYMap = PADDING_Y_MAP
  const maxWidthMap: Record<string, string> = { none: '100%', narrow: '720px', standard: '960px', wide: '1200px', full: '100%' }
  const shadowMap: Record<string, string> = { none: 'none', sm: '0 1px 3px rgba(0,0,0,0.1)', md: '0 4px 12px rgba(0,0,0,0.12)', lg: '0 8px 30px rgba(0,0,0,0.15)' }
  const radiusMap: Record<string, string> = { none: '0', sm: '4px', md: '8px', lg: '16px' }

  const bgType = bg.mode ?? 'none'
  const bgColor = bg.color ?? ''
  const bgStyle: React.CSSProperties = {}
  if (bgType === 'color' && bgColor) bgStyle.backgroundColor = bgColor
  if (bgType === 'gradient' && bgColor) bgStyle.background = bgColor
  // A chosen background image always paints, whatever the Background type is.
  // The picker sits alongside (not inside) the type dropdown, so gating the
  // image on mode === 'image' meant an owner could pick a photo and see nothing.
  // Any colour/gradient above stays as the base layer beneath the image.
  if (bgImage) {
    bgStyle.backgroundImage = `url(${bgImage})`
    bgStyle.backgroundSize = bgSize === 'repeat' ? 'auto' : bgSize
    bgStyle.backgroundPosition = 'center'
    bgStyle.backgroundRepeat = bgSize === 'repeat' ? 'repeat' : 'no-repeat'
  }

  const outerStyle: React.CSSProperties = {
    position: sticky === 'on' ? 'sticky' : 'relative',
    top: sticky === 'on' ? stickyOffset : undefined,
    zIndex: sticky === 'on' ? 10 : undefined,
    ...bgStyle,
    color: textColor || undefined,
    opacity: opacity !== '100' ? parseInt(opacity) / 100 : undefined,
    boxShadow: shadowMap[boxShadow] ?? 'none',
    border: borderStyle !== 'none' ? `${borderWidth} ${borderStyle} ${borderColor}` : undefined,
    borderRadius: radiusMap[borderRadius] ?? '0',
    // Only clip when the section actually paints something to a rounded/edged
    // box (radius, background image, overlay scrim, shadow, scan beam). A plain
    // section leaves overflow visible so a `position: sticky` descendant - e.g.
    // a sticky image column inside a Grid - isn't trapped by an overflow context
    // it doesn't need. overflow:hidden on an ancestor silently kills sticky.
    overflow: (borderRadius !== 'none' || bgImage || (overlayColor && overlayOpacity > 0) || boxShadow !== 'none' || bgType === 'grid-scan') ? 'hidden' : 'visible',
  }

  const aosAttrs = getAosProps(animationType, animationDuration, animationDelay)

  // paddingY (vertical padding) and maxWidth both vary per breakpoint; fold them
  // into one media override on the inner content wrapper. Desktop is the base
  // inline style, so plain legacy string data renders unchanged. The special
  // 'screen' value makes the section fill the viewport (min-height:100vh) with
  // the 'lg' vertical padding; min-height is emitted on every breakpoint (auto
  // when not 'screen') so a wider breakpoint's 100vh never leaks into a narrower
  // one - the media rules only fire when a breakpoint differs from desktop.
  const pyRv = normalizeResponsiveValue<string>(paddingY)
  const mwRv = normalizeResponsiveValue<string>(maxWidth)
  // 'custom' reads its width from the paired unit field; blank custom falls
  // back to the standard width so a half-set field never collapses the section.
  const mwCustomRv = normalizeResponsiveValue<string>(maxWidthCustom)
  const mwAt = (d: Device) => {
    const v = pickResponsive(mwRv, d) ?? 'standard'
    if (v === 'custom') return (pickResponsive(mwCustomRv, d) ?? '').trim() || '960px'
    return maxWidthMap[v] ?? '960px'
  }
  const isScreen = (v: string | undefined) => v === 'screen'
  const pyPad = (v: string | undefined) => paddingYMap[isScreen(v) ? 'lg' : (v ?? 'lg')] ?? '6rem'
  const desktopPy = pickResponsive(pyRv, 'desktop')
  // Content vertical alignment. Only bites when the content box is taller than
  // its content - i.e. a "Full view height" section, or one whose height is set
  // by a taller sibling. "Top" stays display:block so a plain section's children
  // keep their normal block flow (and margin collapsing) exactly as before; the
  // other two switch the content box to a flex column and push the stack.
  const caRv = normalizeResponsiveValue<string>(contentAlign)
  const alignMap: Record<string, string> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }
  const alignDecl = (v: string | undefined) => {
    const a = v ?? 'top'
    return a === 'top' ? 'display:block;' : `display:flex;flex-direction:column;justify-content:${alignMap[a] ?? 'flex-start'};`
  }
  const desktopCa = pickResponsive(caRv, 'desktop') ?? 'top'
  const innerCss = responsiveMediaCssFor(`[data-section-id="${id}"]`, (d) => {
    const v = pickResponsive(pyRv, d)
    return `max-width:${mwAt(d)};padding:${pyPad(v)} 1.5rem;min-height:${isScreen(v) ? '100vh' : 'auto'};${alignDecl(pickResponsive(caRv, d))}`
  })

  return (
    <div style={outerStyle} className={bgType === 'grid-scan' ? 'cactus-section-grid-scan' : undefined} {...aosAttrs}>
      {bgType === 'grid-scan' && <div className="cactus-section-scan-beam" aria-hidden="true" />}
      {overlayColor && overlayOpacity > 0 && (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: overlayColor, opacity: overlayOpacity / 100, pointerEvents: 'none' }} />
      )}
      {innerCss && <style>{innerCss}</style>}
      <div data-section-id={id} style={{
        maxWidth: mwAt('desktop'),
        margin: '0 auto',
        padding: `${pyPad(desktopPy)} 1.5rem`,
        minHeight: isScreen(desktopPy) ? '100vh' : undefined,
        display: desktopCa === 'top' ? undefined : 'flex',
        flexDirection: desktopCa === 'top' ? undefined : 'column',
        justifyContent: desktopCa === 'top' ? undefined : (alignMap[desktopCa] ?? 'flex-start'),
        position: 'relative',
        zIndex: 1,
      }}>
        {typeof content === 'function' ? content() : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ContentSlot — marks where page content renders inside a Layout
// ---------------------------------------------------------------------------

function ContentSlot(_props: any) {
  return (
    <div style={{
      border: '2px dashed var(--color-primary)',
      borderRadius: 8,
      padding: '2rem',
      textAlign: 'center',
      color: 'var(--color-primary)',
      background: 'var(--color-primary-subtle, #f0fdf4)',
      fontWeight: 600,
      fontSize: '0.9375rem',
      minHeight: 120,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      Page content renders here
    </div>
  )
}

// ---------------------------------------------------------------------------
// Typography blocks
// ---------------------------------------------------------------------------

// Splits a line of heading text around every case-sensitive occurrence of
// `needle`, wrapping the matches in an emphasised span. Non-matching runs stay
// plain strings. Returns the original line untouched when there's no needle or
// no hit, so the common (no-highlight) path allocates nothing extra.
// Free text an owner typed straight into a block - a Card's body, a CTA's
// subtext, a stat's label. Same rule as the five dedicated text blocks: any
// email address in it is protected on the published site and left plain in the
// editor. linkifyEmails returns its input untouched when there is no address in
// it, so the common path costs nothing (see lib/email-obfuscate).
function protectText(text: unknown, obfuscate: boolean): React.ReactNode {
  return obfuscate ? linkifyEmails(text) : (text as React.ReactNode)
}

// `inLink` is set when the heading itself is a link: the address then can't be
// wrapped in an anchor of its own (nested links are invalid HTML), so it is
// entity-masked instead and the surrounding heading link carries the address.
function renderHighlight(line: string, needle: string, mark: string, keyPrefix: string, obfuscate = false, inLink = false): React.ReactNode {
  const protect = (s: string, key: string): React.ReactNode =>
    !obfuscate ? s : inLink ? maskEmailText(s, true, key) : linkifyEmails(s)
  if (!needle) return protect(line, `${keyPrefix}-t`)
  const parts = line.split(needle)
  if (parts.length === 1) return protect(line, `${keyPrefix}-t`)
  const emColor = 'var(--color-primary)'
  // The "mark" is a chunky bar that sits UNDER the word (a thick underline),
  // never behind the glyphs. Drawn with text-decoration so it always tracks the
  // baseline. Kept a solid accent (mustard) colour rather than a translucent
  // one, so a tinted hero background can't bleed through and muddy it.
  const markStyle: React.CSSProperties = mark === 'none' ? {} : {
    textDecorationLine: 'underline',
    textDecorationColor: 'var(--color-heading-mark, #E3A857)',
    textDecorationThickness: '0.16em',
    textUnderlineOffset: '0.04em',
    textDecorationSkipInk: 'none',
  }
  const out: React.ReactNode[] = []
  parts.forEach((seg, i) => {
    if (seg) out.push(protect(seg, `${keyPrefix}-t-${i}`))
    if (i < parts.length - 1) {
      out.push(
        <em key={`${keyPrefix}-em-${i}`} style={{ fontStyle: 'normal', color: emColor, ...markStyle }}>{needle}</em>,
      )
    }
  })
  return out
}

function Heading(props: any) {
  const { id, text, level, align, color, fontSize = '', padding, animationType = 'none', animationDuration = 'normal', animationDelay = 'none', revealAnimation = 'none', highlightText = '', highlightMark = 'underline', href = '', hoverUnderline = 'none', hoverUnderlineColor = '', minHeight = 'none', verticalAlign = 'top', fitOneLine = 'no', sticky = 'off', stickyOffset = '', puck } = props
  // Obfuscate email addresses on the published site only - the editor keeps the
  // plain address so it stays editable (see lib/email-obfuscate).
  const obfuscate = !puck?.isEditing
  // `align` is a ResponsiveValue<string> ({desktop,tablet,mobile}); desktop is
  // the base text-align, tablet/mobile emitted as media overrides below. Plain
  // legacy string data normalises to {desktop: value}, so it renders unchanged.
  const alignRv = normalizeResponsiveValue<string>(align)
  const alignBase = pickResponsive(alignRv, 'desktop') ?? 'left'
  // Colour: legacy preset strings (dark/muted/brand) still map to their old
  // values; anything else is a raw CSS colour from the swatch/manual picker.
  // Empty (or legacy "dark") defers to the per-level heading colour token.
  const legacyColour: Record<string, string> = { dark: '', muted: 'var(--color-muted)', brand: 'var(--color-primary)' }
  const resolvedColour = color ? (color in legacyColour ? legacyColour[color] : color) : ''
  const sizes: Record<string, string> = { display: '3rem', h2: '1.875rem', h3: '1.5rem', h4: '1.25rem', h5: '1.125rem' }
  const weights: Record<string, number> = { display: 800, h2: 800, h3: 700, h4: 700, h5: 600 }
  const lvl = (level ?? 'h2') as 'display' | 'h2' | 'h3' | 'h4' | 'h5'
  // Reflect the Styles → Headings tokens per level, falling back to the built-in
  // presets when unset. An explicit muted/brand colour choice still wins; the
  // default "dark" defers to the heading colour token (then --color-fg).
  // "Display" is the largest level (hero/campaign banners, above H1) - it has
  // no native tag of its own, so it renders as an actual H1 (builder-format
  // info pages don't auto-inject their own page-title H1) styled via the
  // separate --display-* tokens (Styles → Headings → Display), read by class
  // rather than tag since --${lvl}-* already resolves to --display-* here.
  // Vertical positioning: when a block height is set, the wrapper becomes a flex
  // column so the heading can sit top / middle / bottom within that height. Auto
  // height (the default) leaves the wrapper in normal flow, unchanged.
  const vAlignMap: Record<string, string> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }
  // "fill" stretches the block to its container's height (a stretch Grid/Split/
  // Group column, or any parent that has a resolved height) rather than a fixed
  // min-height, so the vertical position sits against the full section.
  // Height and vertical position are per-breakpoint: a full-screen hero heading
  // on desktop can drop back to auto height on a phone. Desktop is the inline
  // base; the other breakpoints ride media rules on the wrapper's own id hook.
  const mhRv = normalizeResponsiveValue<string>(minHeight)
  const vaRv = normalizeResponsiveValue<string>(verticalAlign)
  const mhAt = (d: Device) => pickResponsive(mhRv, d) ?? 'none'
  const isFill = (['desktop', 'tablet', 'mobile'] as const).some((d) => mhAt(d) === 'fill')
  const hasHeight = (['desktop', 'tablet', 'mobile'] as const).some((d) => mhAt(d) !== 'none')
  const desktopMh = mhAt('desktop')
  const wrapDecl = (d: Device) => {
    const v = mhAt(d)
    if (v === 'none') return 'display:block;min-height:auto;height:auto;align-self:auto;'
    const flex = `display:flex;flex-direction:column;justify-content:${vAlignMap[pickResponsive(vaRv, d) ?? 'top'] ?? 'flex-start'};`
    if (v === 'fill') return `${flex}height:100%;align-self:stretch;min-height:auto;`
    return `${flex}min-height:${BLOCK_HEIGHT_MAP[v]};height:auto;align-self:auto;`
  }
  const wrapCss = hasHeight ? responsiveMediaCssFor(`[data-heading-wrap="${id}"]`, wrapDecl) : ''
  const wrapStyle: React.CSSProperties | undefined = desktopMh !== 'none'
    ? {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: vAlignMap[pickResponsive(vaRv, 'desktop') ?? 'top'] ?? 'flex-start',
        ...(desktopMh === 'fill' ? { height: '100%', alignSelf: 'stretch' } : { minHeight: BLOCK_HEIGHT_MAP[desktopMh] }),
      }
    : undefined
  // Optional per-block font-size override (unit field, per-breakpoint); blank
  // keeps the per-level token exactly as before.
  const fsRv = normalizeResponsiveValue<string>(fontSize)
  const fsAt = (d: Device) => (pickResponsive(fsRv, d) ?? '').trim()
  const tokenSize = (l: string) => `var(--${l}-size, ${sizes[l] ?? sizes.h2})`
  const style: React.CSSProperties = {
    fontFamily: `var(--${lvl}-family)`,
    fontSize: fsAt('desktop') || tokenSize(lvl),
    fontWeight: `var(--${lvl}-weight, ${weights[lvl] ?? 700})` as React.CSSProperties['fontWeight'],
    lineHeight: `var(--${lvl}-line-height, 1.25)`,
    letterSpacing: `var(--${lvl}-letter-spacing, normal)`,
    textTransform: `var(--${lvl}-transform, none)` as React.CSSProperties['textTransform'],
    fontStyle: `var(--${lvl}-style, normal)`,
    color: resolvedColour || `var(--${lvl}-color, var(--color-fg))`,
    textAlign: alignBase as React.CSSProperties['textAlign'],
    // A centred/bottom-aligned block drops the bottom margin so the flex
    // centring is true; the wrapper's padding owns the outer spacing there.
    margin: desktopMh !== 'none' ? '0' : '0 0 1rem',
  }
  const Tag = lvl === 'display' ? 'h1' : lvl
  const headingClassName = lvl === 'display' ? 'cactus-display' : undefined
  // Stagger-lines: each newline in `text` becomes its own clipped line that
  // rises into place, staggered by 120ms per line — a one-shot reveal on
  // mount, independent of the scroll-triggered AOS effect above.
  const rawContent = revealAnimation === 'stagger-lines'
    ? text.split('\n').map((line: string, i: number) => (
        <span key={i} className="cactus-stagger-line">
          <span className="cactus-stagger-line-inner" style={{ animationDelay: `${i * 120}ms` }}>{renderHighlight(line, highlightText, highlightMark, `l${i}`, obfuscate, Boolean(href))}</span>
        </span>
      ))
    : renderHighlight(text, highlightText, highlightMark, 'h', obfuscate, Boolean(href))
  // "Keep on one line": HeadingFitText measures the text against the room the
  // heading has been given and scales it down when it would otherwise wrap. Off
  // by default, and it's the only thing here that needs client JS, so the plain
  // heading stays a pure server-rendered tag.
  const content = fitOneLine === 'yes' ? <HeadingFitText>{rawContent}</HeadingFitText> : rawContent
  // One per-breakpoint rule on the tag itself carries alignment, the margin
  // that toggles with block height, and the optional font-size override.
  const alignCss = responsiveMediaCssFor(`[data-heading-id="${id}"]`, (d) => `text-align:${pickResponsive(alignRv, d) ?? 'left'};margin:${mhAt(d) !== 'none' ? '0' : '0 0 1rem'};font-size:${fsAt(d) || tokenSize(lvl)};`)
  // Whole-heading link: the anchor wraps the tag and inherits its colour, so the
  // heading looks identical until hovered. The optional hover underline is
  // scoped to this block's id; its colour defaults to the heading's own colour.
  // Base rule kills the anchor's default underline. It used to be an inline
  // text-decoration:none on the <a>, but an inline style beats a stylesheet
  // :hover rule, so the hover underline never showed. As two scoped rules the
  // higher-specificity :hover wins cleanly and keeps its custom colour/thickness.
  const linkBaseCss = href ? `a[data-heading-link="${id}"]{text-decoration:none;}` : ''
  const showHoverUnderline = Boolean(href) && hoverUnderline === 'yes'
  const hoverCss = showHoverUnderline
    ? `a[data-heading-link="${id}"]:hover{text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:0.12em;text-decoration-color:${hoverUnderlineColor || 'currentColor'};}`
    : ''
  // Gives the wrapper's parent a height for the `height: 100%` above to resolve
  // against - see blockFillCss for why the published page needs this and the
  // editor doesn't. Responsive: only lifts the parent at breakpoints where
  // "Fill container" is actually picked.
  const fillCss = isFill ? blockFillCssResponsive('data-heading-fill', id, (d) => mhAt(d) === 'fill') : ''
  const headingEl = (
    <Tag data-heading-id={id} style={style} className={headingClassName}>
      {content}
    </Tag>
  )
  return (
    <div
      className={getPaddingClasses(padding)}
      style={{ ...wrapStyle, ...getStickyStyle(sticky, stickyOffset) }}
      {...(hasHeight ? { 'data-heading-wrap': id } : {})}
      {...(isFill ? { 'data-heading-fill': id } : {})}
      {...getAosProps(animationType, animationDuration, animationDelay)}
    >
      {(alignCss || wrapCss || linkBaseCss || hoverCss || fillCss) && <style>{`${alignCss}${wrapCss}${linkBaseCss}${hoverCss}${fillCss}`}</style>}
      {href
        ? <a {...emailSafeHref(href, obfuscate)} data-heading-link={id} style={{ display: 'block', color: 'inherit' }}>{headingEl}</a>
        : headingEl}
    </div>
  )
}

function TextBlock(props: any) {
  const { id, content, align, padding, size = 'base', maxWidth = 'none', color = 'default', sticky = 'off', stickyOffset = '', animationType = 'none', animationDuration = 'normal', animationDelay = 'none', puck } = props
  const body = puck?.isEditing ? content : linkifyEmails(content)
  const sizeMap: Record<string, string> = { base: '1rem', md: '1.125rem', lg: '1.25rem' }
  const maxWidthMap: Record<string, string | undefined> = { none: undefined, prose: '46ch', wide: '60ch' }
  // default/muted/dark are the legacy preset values; anything else is a raw
  // CSS colour from the swatch/manual picker. Blank keeps the old secondary.
  const colorMap: Record<string, string> = { default: 'var(--color-fg-secondary)', muted: 'var(--color-muted)', dark: 'var(--color-fg)' }
  const resolvedColour = colorMap[color] ?? (color || 'var(--color-fg-secondary)')
  // align/size/maxWidth are each ResponsiveValue<string>, and they interact - a
  // capped width anchors the block to its text alignment via auto side margins -
  // so all three fold into a single per-breakpoint declaration set rather than
  // three independent rules. Desktop is the base inline style; tablet/mobile are
  // emitted as media overrides. Plain legacy string data renders unchanged.
  const alignRv = normalizeResponsiveValue<string>(align)
  const sizeRv = normalizeResponsiveValue<string>(size)
  const mwRv = normalizeResponsiveValue<string>(maxWidth)
  const at = (d: 'desktop' | 'tablet' | 'mobile') => ({
    a: pickResponsive(alignRv, d) ?? 'left',
    s: pickResponsive(sizeRv, d) ?? 'base',
    m: pickResponsive(mwRv, d) ?? 'none',
  })
  const decls = (d: 'desktop' | 'tablet' | 'mobile') => {
    const { a, s, m } = at(d)
    const mw = maxWidthMap[m]
    const ml = mw && (a === 'center' || a === 'right') ? 'auto' : '0'
    const mr = mw && a === 'center' ? 'auto' : '0'
    return `text-align:${a};font-size:${sizeMap[s] ?? '1rem'};max-width:${mw ?? 'none'};margin-left:${ml};margin-right:${mr};`
  }
  const base = at('desktop')
  const baseMw = maxWidthMap[base.m]
  const mediaCss = responsiveMediaCssFor(`[data-text-id="${id}"]`, decls)
  return (
    <>
      {mediaCss && <style>{mediaCss}</style>}
      <div data-text-id={id} className={getPaddingClasses(padding)} {...getAosProps(animationType, animationDuration, animationDelay)} style={{ marginBottom: '1.5rem', marginLeft: baseMw && (base.a === 'center' || base.a === 'right') ? 'auto' : undefined, marginRight: baseMw && base.a === 'center' ? 'auto' : undefined, fontSize: sizeMap[base.s] ?? '1rem', lineHeight: 1.65, color: resolvedColour, textAlign: base.a as React.CSSProperties['textAlign'], maxWidth: baseMw, whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...getStickyStyle(sticky, stickyOffset) }}>
        {body}
      </div>
    </>
  )
}

// A RichText block's "Text colour" recolours the text-carrying elements the
// globals.css `.puck-richtext …` rules paint with `--color-fg`/`-fg-secondary`
// (p, lists, headings, blockquote). Those rules set an explicit colour on the
// descendants, so a plain inline `color` on the wrapper can't cascade past them
// - it takes a scoped stylesheet rule, keyed on the block's id, at the same
// element depth. Links are deliberately left on `--color-primary`: a
// recoloured link that no longer looks like a link is a usability regression,
// not a feature. Exported so config.rsc.tsx's published render emits the exact
// same CSS. `cssColourValue` strips the characters that could break out of the
// declaration (the colour field accepts free text via allowManual).
export function richTextColourCss(id: string | undefined, colour: string): string {
  if (!id || !colour) return ''
  const c = cssColourValue(colour)
  const sel = `.puck-richtext[data-richtext-id="${id}"]`
  const targets = ['p', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote']
  return `${targets.map((t) => `${sel} ${t}`).join(',')}{color:${c};}`
}

function RichTextBlock(props: any) {
  const { id, content, padding, textColor, sticky = 'off', stickyOffset = '', animationType = 'none', animationDuration = 'normal', animationDelay = 'none', puck } = props
  const obfuscate = !puck?.isEditing
  if (!content) {
    return <div className={getPaddingClasses(padding)} style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>Rich text — edit in the panel</div>
  }
  const colourCss = richTextColourCss(id, textColor)
  const aosAttrs = getAosProps(animationType, animationDuration, animationDelay)
  const stickyStyle = getStickyStyle(sticky, stickyOffset)
  // In the Puck editor canvas, the richtext field type (via useRichtextProps) transforms
  // the stored value into a React element (<Suspense><RichTextRender /></Suspense>).
  // Render it directly rather than passing to dangerouslySetInnerHTML.
  if (React.isValidElement(content)) {
    return (
      <div className={`puck-richtext ${getPaddingClasses(padding)}`} data-richtext-id={id} {...aosAttrs} style={stickyStyle}>
        {colourCss && <style>{colourCss}</style>}
        {content}
      </div>
    )
  }
  // Editor-canvas fallback for a raw string / TipTap JSON value. The published
  // page never renders through here: config.rsc.tsx swaps in a version that runs
  // this same HTML through DOMPurify first.
  return (
    <div className={`puck-richtext ${getPaddingClasses(padding)}`} data-richtext-id={id} {...aosAttrs} style={stickyStyle}>
      {colourCss && <style>{colourCss}</style>}
      <div dangerouslySetInnerHTML={{ __html: richTextContentToHtml(content, obfuscate) }} />
    </div>
  )
}

function Quote(props: any) {
  const { quote, attribution, padding, mediaUrl, alt, imageSize = 'md', imageShape = 'circle', imageHeight = 0, sticky = 'off', stickyOffset = '', animationType = 'none', animationDuration = 'normal', animationDelay = 'none', puck } = props
  const editing = puck?.isEditing
  const photoSizeMap: Record<string, number> = { sm: 72, md: 112, lg: 160 }
  const photoRadiusMap: Record<string, string> = { circle: '50%', rounded: '8px', square: '0' }
  const photo = photoSizeMap[imageSize] ?? photoSizeMap.md
  // Blank (or 0) height keeps the photo square, as it has always been. A number
  // overrides it, so a portrait shot can stand as tall as the panel needs.
  const heightOverride = Number(imageHeight)
  const photoHeight = Number.isFinite(heightOverride) && heightOverride > 0 ? heightOverride : photo
  const body = (
    <>
      <p style={{ margin: 0, fontSize: '1.125rem', fontStyle: 'italic', color: 'var(--color-fg-secondary)', lineHeight: 1.7 }}>{editing ? quote : linkifyEmails(quote)}</p>
      {attribution && <footer style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: 'var(--color-muted)', fontStyle: 'normal' }}>— {editing ? attribution : linkifyEmails(attribution)}</footer>}
    </>
  )
  return (
    <div className={getPaddingClasses(padding)} {...getAosProps(animationType, animationDuration, animationDelay)} style={getStickyStyle(sticky, stickyOffset)}>
      <blockquote style={{ margin: '0 0 1.5rem', padding: '1.25rem 1.5rem', borderLeft: '4px solid var(--color-primary)', background: 'var(--color-bg-subtle)', borderRadius: '0 6px 6px 0' }}>
        {mediaUrl ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- media URLs are external CDN addresses; next/image requires a configured domain for each provider which users add at setup time */}
            <img
              src={mediaUrl}
              alt={alt ?? ''}
              loading="lazy"
              decoding="async"
              style={{ flex: '0 0 auto', width: photo, height: photoHeight, objectFit: 'cover', borderRadius: photoRadiusMap[imageShape] ?? '50%', display: 'block' }}
            />
            <div style={{ flex: '1 1 0%', minWidth: 0 }}>{body}</div>
          </div>
        ) : body}
      </blockquote>
    </div>
  )
}

function Caption(props: any) {
  const { id, text, align, padding, animationType = 'none', animationDuration = 'normal', animationDelay = 'none', puck } = props
  const body = puck?.isEditing ? text : linkifyEmails(text)
  const alignRv = normalizeResponsiveValue<string>(align)
  const alignBase = pickResponsive(alignRv, 'desktop') ?? 'left'
  const alignCss = responsiveMediaCssFor(`[data-caption-id="${id}"]`, (d) => `text-align:${pickResponsive(alignRv, d) ?? 'left'};`)
  return (
    <>
      {alignCss && <style>{alignCss}</style>}
      <p
        data-caption-id={id}
        {...getAosProps(animationType, animationDuration, animationDelay)}
        className={`cactus-caption ${getPaddingClasses(padding)}`}
        style={{
          margin: 0, textAlign: alignBase as React.CSSProperties['textAlign'],
        fontFamily: 'var(--caption-family)',
        fontWeight: 'var(--caption-weight, 500)' as React.CSSProperties['fontWeight'],
        fontSize: 'var(--caption-size, 0.75rem)',
        lineHeight: 'var(--caption-line-height, 1.4)',
        letterSpacing: 'var(--caption-letter-spacing, normal)',
        textTransform: 'var(--caption-transform, none)' as React.CSSProperties['textTransform'],
        fontStyle: 'var(--caption-style, normal)',
        color: 'var(--caption-color, var(--color-muted))',
      }}
      >
        {body}
      </p>
    </>
  )
}

// ---------------------------------------------------------------------------
// Action blocks
// ---------------------------------------------------------------------------

// Border widths offered by the Custom button style. "None" is the absence of a
// border, not a zero-width one, so picking it also retires the border colour
// field (see ButtonLink's resolveFields).
const BUTTON_BORDER_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: '1px', label: '1px' },
  { value: '2px', label: '2px' },
  { value: '3px', label: '3px' },
  { value: '4px', label: '4px' },
]

// A colour heading into a *stylesheet* rule rather than an inline style needs
// the characters that would end the declaration or the <style> element taken
// off it - the colour fields accept free text (allowManual), so the value is
// whatever the admin typed. No legitimate CSS colour contains any of these
// (`rgb(0 0 0 / 50%)`, `var(--color-1)` and `#abc` all survive untouched), so
// this costs nothing and closes the break-out. Inline styles don't need it:
// React serialises those through the style object, which can't break out.
function cssColourValue(value: string): string {
  return String(value ?? '').replace(/[<>{};]/g, '')
}

function ButtonLink(props: any) {
  const {
    id, label, href, variant, align, padding, puck,
    bgColor, textColor, hoverBgColor, hoverTextColor, borderWidth, borderColor,
    sticky = 'off', stickyOffset = '', animationType = 'none', animationDuration = 'normal', animationDelay = 'none',
  } = props
  // A "mailto:" button is the most exposed address on any site - it sits in the
  // href AND usually in the label. Both are protected on the published site;
  // the editor keeps them plain so they stay editable (see lib/email-obfuscate).
  const obfuscate = !puck?.isEditing
  // Shape + typography reflect the Styles → Buttons tokens (var), falling back to
  // the built-in defaults when unset so untouched sites look identical.
  const shape: React.CSSProperties = {
    display: 'inline-block', textDecoration: 'none',
    fontFamily: 'var(--btn-family)',
    fontWeight: 'var(--btn-weight, 600)',
    fontSize: 'var(--btn-size, 0.9375rem)',
    lineHeight: 'var(--btn-line-height, normal)',
    letterSpacing: 'var(--btn-letter-spacing, normal)',
    textTransform: 'var(--btn-transform, none)' as React.CSSProperties['textTransform'],
    fontStyle: 'var(--btn-style, normal)',
    borderRadius: 'var(--btn-radius, 6px)',
    padding: 'var(--btn-padding, 0.625rem 1.5rem)',
  }
  // Colours: the primary (default) button reflects the button colour tokens;
  // secondary/outline read their own Styles → Buttons tokens (buttons.secondary/
  // .outline) when the admin has set them, falling back to deriving off the
  // site's brand primary colour otherwise - so untouched sites look identical
  // to before these existed. `--color-on-primary` is a WCAG-derived contrasting
  // text colour computed from the primary hex (lib/design/tokens.ts), so
  // secondary's fallback fill always keeps legible text regardless of brand
  // colour. Hover is applied via the .cactus-btn[data-variant] rules (tokens.ts).
  //
  // "custom" is the one variant that ignores the site's button tokens and paints
  // what this block was given - a one-off button that shouldn't drag every other
  // button on the site with it. Each colour left blank falls back to the same
  // token the primary button uses, so a freshly-switched custom button looks
  // exactly like the primary it came from and diverges only as colours are set.
  // A chosen border with no colour picked paints in `currentColor` rather than
  // transparent: a border you asked for that renders invisibly is a bug report.
  const hasBorder = Boolean(borderWidth) && borderWidth !== 'none'
  const variants: Record<string, React.CSSProperties> = {
    primary:   { background: 'var(--btn-bg, var(--color-primary))', color: 'var(--btn-text-color, var(--color-bg))', border: 'var(--btn-border-width, 0) solid var(--btn-border, transparent)' },
    secondary: { background: 'var(--btn-secondary-bg, var(--color-primary))', color: 'var(--btn-secondary-text, var(--color-on-primary, var(--color-bg)))', border: 'var(--btn-border-width, 0) solid var(--btn-secondary-border, transparent)' },
    outline:   { background: 'transparent', color: 'var(--btn-outline-text, var(--color-primary))', border: 'var(--btn-border-width, 2px) solid var(--btn-outline-border, var(--color-primary))' },
    custom:    { background: bgColor || 'var(--btn-bg, var(--color-primary))', color: textColor || 'var(--btn-text-color, var(--color-bg))', border: hasBorder ? `${borderWidth} solid ${borderColor || 'currentColor'}` : 'none' },
  }
  // Alignment sits on the wrapper, not the button: the <a> is inline-block, so
  // text-align moves it within the full-width wrapper. Unset means `inherit`,
  // which for an inherited property is the same as declaring nothing - buttons
  // saved before this field existed keep taking their container's alignment
  // instead of being silently yanked left.
  const alignRv = normalizeResponsiveValue<string>(align)
  const rawAlignAt = (d: Device) => pickResponsive(alignRv, d) || ''
  const alignAt = (d: Device) => {
    const a = rawAlignAt(d)
    return a === 'full' ? 'inherit' : (a || 'inherit')
  }
  // 'full' stretches the button across its container - the classic mobile
  // treatment - by switching the <a> from inline-block to block; the label
  // centres within it. Per-breakpoint like the alignment itself, so a button
  // can sit inline on desktop and go full-width on phones.
  const isFullAt = (d: Device) => rawAlignAt(d) === 'full'
  const alignCss = responsiveMediaCssFor(`[data-btn-id="${id}"]`, (d) => `text-align:${alignAt(d)};`)
    + responsiveMediaCssFor(`a[data-btn-link="${id}"]`, (d) => `display:${isFullAt(d) ? 'block' : 'inline-block'};text-align:${isFullAt(d) ? 'center' : 'inherit'};`)
  // Hover on the three presets comes from the global .cactus-btn[data-variant]
  // rules in tokens.ts; data-variant="custom" deliberately matches none of them,
  // so a custom button's hover is emitted here instead, scoped to this block.
  // !important for the same reason those rules carry it: the base state is an
  // inline style, and an inline style beats any plain stylesheet selector.
  const hoverDecls = variant === 'custom'
    ? `${hoverBgColor ? `background:${cssColourValue(hoverBgColor)} !important;` : ''}${hoverTextColor ? `color:${cssColourValue(hoverTextColor)} !important;` : ''}`
    : ''
  const hoverCss = hoverDecls ? `a[data-btn-link="${id}"]:hover{${hoverDecls}}` : ''
  return (
    <div
      className={getPaddingClasses(padding)}
      data-btn-id={id}
      {...getAosProps(animationType, animationDuration, animationDelay)}
      style={{ marginBottom: '1rem', textAlign: alignAt('desktop') as React.CSSProperties['textAlign'], ...getStickyStyle(sticky, stickyOffset) }}
    >
      {(alignCss || hoverCss) && <style>{`${alignCss}${hoverCss}`}</style>}
      <a {...emailSafeHref(href, obfuscate)} data-btn-link={id} className="cactus-btn" data-variant={variant || 'primary'} style={{ ...shape, ...(variants[variant] ?? variants.primary), ...(isFullAt('desktop') ? { display: 'block', textAlign: 'center' } : {}) }}>
        {maskEmailText(label, obfuscate)}
      </a>
    </div>
  )
}

function CTABanner(props: any) {
  const { id, heading, subtext, ctaLabel, ctaHref, background, bgColor = '', textColor = '', padding, paddingY = 'none', sticky = 'off', stickyOffset = '', animationType = 'none', animationDuration = 'normal', animationDelay = 'none', puck } = props
  const obfuscate = !puck?.isEditing
  const bgs: Record<string, { bg: string; text: string; sub: string }> = {
    white: { bg: 'var(--color-bg)', text: 'var(--color-fg)', sub: 'var(--color-muted)' },
    light: { bg: 'var(--color-bg-subtle)', text: 'var(--color-fg)', sub: 'var(--color-muted)' },
    brand: { bg: 'var(--color-primary)', text: 'var(--color-bg)', sub: 'rgba(255,255,255,0.85)' },
  }
  // 'custom' paints this banner's own picked colours; each one left blank falls
  // back to the Light preset it started from. The sub-text rides the picked
  // text colour at 75% so it always reads against the same background.
  const t = background === 'custom'
    ? {
        bg: bgColor || 'var(--color-bg-subtle)',
        text: textColor || 'var(--color-fg)',
        sub: textColor ? `color-mix(in srgb, ${textColor} 75%, transparent)` : 'var(--color-muted)',
      }
    : bgs[background] ?? bgs.light!
  // Height of the banner: the existing "Padding (left/right)" field only ever set
  // padding-left/right (via the cactus-pad-* classes), so the coloured box had
  // nothing holding it off the text above and below it. Per-breakpoint like every
  // other spacing field - desktop is the inline base, tablet/mobile ride the media
  // rules. Deliberately the padding-top/bottom LONGHANDS, not the shorthand: the
  // shorthand would reset the horizontal padding those utility classes provide.
  const pyRv = normalizeResponsiveValue<string>(paddingY)
  const pyAt = (d: Device) => PADDING_Y_MAP[pickResponsive(pyRv, d) ?? 'none'] ?? '0'
  const pyCss = responsiveMediaCssFor(`[data-cta-id="${id}"]`, (d) => `padding-top:${pyAt(d)};padding-bottom:${pyAt(d)};`)
  return (
    <>
      {pyCss && <style>{pyCss}</style>}
      <section
        data-cta-id={id}
        className={getPaddingClasses(padding)}
        style={{ background: t!.bg, border: background === 'white' ? '1px solid var(--color-border)' : 'none', borderRadius: 8, textAlign: 'center', marginBottom: '2rem', paddingTop: pyAt('desktop'), paddingBottom: pyAt('desktop'), ...getStickyStyle(sticky, stickyOffset) }}
        {...getAosProps(animationType, animationDuration, animationDelay)}
      >
        {heading && <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.75rem', fontWeight: 800, color: t!.text, lineHeight: 1.25 }}>{protectText(heading, obfuscate)}</h2>}
        {subtext && <p style={{ margin: '0 0 1.5rem', color: t!.sub, fontSize: '1rem', lineHeight: 1.65 }}>{protectText(subtext, obfuscate)}</p>}
        {ctaLabel && ctaHref && (
          <a {...emailSafeHref(ctaHref, obfuscate)} style={{ display: 'inline-block', padding: '0.75rem 1.75rem', background: background === 'brand' ? 'var(--color-bg)' : 'var(--color-primary)', color: background === 'brand' ? 'var(--color-primary)' : 'var(--color-bg)', borderRadius: 6, fontWeight: 600, textDecoration: 'none', fontSize: '1rem' }}>
            {maskEmailText(ctaLabel, obfuscate)}
          </a>
        )}
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Media blocks
// ---------------------------------------------------------------------------

function ImageBlock(props: any) {
  const { id, mediaUrl, alt, caption, padding, maxWidth = '', align = 'left', sticky = 'off', stickyOffset = '', animationType = 'none', animationDuration = 'normal', animationDelay = 'none', puck } = props
  // The caption is protected; `alt` can't be - it's an attribute, and React
  // escapes attribute values, so an entity-encoded address would show up as the
  // literal text "&#64;". Attributes are the hard edge of this technique.
  const obfuscate = !puck?.isEditing
  if (!mediaUrl) {
    return <div style={{ marginBottom: '1.5rem', background: 'var(--color-bg-subtle)', borderRadius: 6, padding: '3rem', textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.875rem' }}>No image selected</div>
  }
  // maxWidth caps the figure; auto side-margins anchor a capped image to the
  // chosen alignment (a full-width image has nothing to align). Both are
  // per-device: desktop is the inline base, tablet/mobile ride the media rules.
  const mwRv = normalizeResponsiveValue<string>(maxWidth)
  const alignRv = normalizeResponsiveValue<string>(align)
  const sideAt = (d: 'desktop' | 'tablet' | 'mobile') => {
    const mw = (pickResponsive(mwRv, d) ?? '').trim()
    const a = pickResponsive(alignRv, d) ?? 'left'
    return {
      mw,
      ml: mw && (a === 'center' || a === 'right') ? 'auto' : '0',
      mr: mw && a === 'center' ? 'auto' : '0',
    }
  }
  const { mw: baseMw, ml: baseMl, mr: baseMr } = sideAt('desktop')
  const sizeCss = responsiveMediaCssFor(`[data-image-id="${id}"]`, (d) => {
    const { mw, ml, mr } = sideAt(d)
    return `max-width:${mw || 'none'};margin-left:${ml};margin-right:${mr};`
  })
  return (
    <figure data-image-id={id} className={getPaddingClasses(padding)} style={{ margin: `0 ${baseMr} 1.5rem ${baseMl}`, maxWidth: baseMw || undefined, ...getStickyStyle(sticky, stickyOffset) }} {...getAosProps(animationType, animationDuration, animationDelay)}>
      {sizeCss && <style>{sizeCss}</style>}
      {/* Border radius/colour/width reflect the Styles → Images tokens, defaulting to the original look.
          Deliberately not lazy: an Image block can be the first thing on a page, and lazy-loading the
          LCP element is a measurable regression. decoding="async" is free either way. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mediaUrl} alt={alt ?? ''} decoding="async" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 'var(--img-radius, 6px)', border: 'var(--img-border-width, 0) solid var(--img-border-color, transparent)' }} />
      {caption && <figcaption style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--color-muted)', marginTop: '0.5rem' }}>{protectText(caption, obfuscate)}</figcaption>}
    </figure>
  )
}

function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) return `https://www.youtube.com/embed/${u.searchParams.get('v')}`
    if (u.hostname === 'youtu.be') return `https://www.youtube.com/embed${u.pathname}`
    if (u.hostname.includes('vimeo.com')) return `https://player.vimeo.com/video${u.pathname}`
    return url
  } catch { return null }
}

function VideoEmbed(props: any) {
  const { id, url, aspectRatio, title, padding, sticky = 'off', stickyOffset = '', animationType = 'none', animationDuration = 'normal', animationDelay = 'none' } = props
  if (!url) return <div style={{ background: 'var(--color-bg-subtle)', borderRadius: 6, padding: '3rem', textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>No video URL entered</div>
  const embedUrl = toEmbedUrl(url)
  if (!embedUrl) return <div style={{ background: '#fef2f2', borderRadius: 6, padding: '1rem', color: '#b91c1c', fontSize: '0.875rem', marginBottom: '1.5rem' }}>Could not parse video URL</div>
  const paddings: Record<string, string> = { '16:9': '56.25%', '4:3': '75%', '1:1': '100%' }
  // Aspect ratio is per-device (padding-bottom drives the box height): a wide
  // 16:9 embed on desktop can be a square on mobile, say.
  const arRv = normalizeResponsiveValue<string>(aspectRatio)
  const arCss = responsiveMediaCssFor(`[data-video-id="${id}"]`, (d) => `padding-bottom:${paddings[pickResponsive(arRv, d) ?? '16:9'] ?? '56.25%'};`)
  return (
    <div className={getPaddingClasses(padding)} {...getAosProps(animationType, animationDuration, animationDelay)} style={{ marginBottom: '1.5rem', ...getStickyStyle(sticky, stickyOffset) }}>
      {arCss && <style>{arCss}</style>}
      <div data-video-id={id} style={{ position: 'relative', paddingBottom: paddings[pickResponsive(arRv, 'desktop') ?? '16:9'] ?? '56.25%', height: 0, overflow: 'hidden', borderRadius: 6 }}>
        <iframe src={embedUrl} title={title || 'Video'} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }} />
      </div>
    </div>
  )
}

function Embed(props: any) {
  const { id, src, height, title, padding, sticky = 'off', stickyOffset = '', animationType = 'none', animationDuration = 'normal', animationDelay = 'none' } = props
  if (!src) return <div style={{ background: 'var(--color-bg-subtle)', borderRadius: 6, padding: '3rem', textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>No embed URL entered</div>
  // Height is per-device: embedded widgets frequently need a taller (or
  // shorter) box once the viewport narrows.
  const hRv = normalizeResponsiveValue<string>(height)
  const hAt = (d: 'desktop' | 'tablet' | 'mobile') => (pickResponsive(hRv, d) ?? '').trim() || '400px'
  const hCss = responsiveMediaCssFor(`[data-embed-id="${id}"]`, (d) => `height:${hAt(d)};`)
  return (
    <div className={getPaddingClasses(padding)} {...getAosProps(animationType, animationDuration, animationDelay)} style={{ marginBottom: '1.5rem', ...getStickyStyle(sticky, stickyOffset) }}>
      {hCss && <style>{hCss}</style>}
      <iframe data-embed-id={id} src={src} title={title || 'Embedded content'} style={{ width: '100%', height: hAt('desktop'), border: 'none', borderRadius: 6, display: 'block' }} allowFullScreen />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hero block — enhanced with bg types, layouts, second CTA
// ---------------------------------------------------------------------------

function Hero(props: any) {
  const {
    id, heading, subheading, ctaLabel, ctaHref, cta2Label, cta2Href, cta2Variant = 'outline',
    bg = { mode: 'gradient', color: '' }, bgImage = '', overlayColor = '', overlayOpacity = 0,
    layout = 'centered', imageUrl = '', textScheme = 'dark', minHeight = 'auto',
    padding, animationType = 'none', animationDuration = 'normal', animationDelay = 'none', puck,
  } = props
  const obfuscate = !puck?.isEditing

  const bgType = bg.mode ?? 'gradient'
  const bgColor = bg.color ?? ''
  const bgStyle: React.CSSProperties = {}
  if (bgType === 'gradient') bgStyle.background = bgColor || 'linear-gradient(135deg, var(--color-primary-subtle, #f0fdf4) 0%, var(--color-primary-subtle, #dcfce7) 100%)'
  else if (bgType === 'color' && bgColor) bgStyle.backgroundColor = bgColor
  // A chosen background image always paints over any colour/gradient base,
  // whatever the Background type is - the picker sits alongside the type dropdown.
  if (bgImage) { bgStyle.backgroundImage = `url(${bgImage})`; bgStyle.backgroundSize = 'cover'; bgStyle.backgroundPosition = 'center' }

  const textColor = textScheme === 'light' ? 'var(--color-bg)' : 'var(--color-fg)'
  const subColor = textScheme === 'light' ? 'rgba(255,255,255,0.85)' : 'var(--color-muted)'
  const minH: Record<string, string> = { auto: 'auto', half: '50vh', full: '100vh' }
  const minHeightRv = normalizeResponsiveValue<string>(minHeight)
  // Layout is per-device too: everything it drives (text alignment/width,
  // CTA row justification, side-image visibility, section justify/gap) is
  // expressible in CSS, so tablet/mobile overrides ride media rules on stable
  // data-hero-* hooks while desktop stays the inline base. The side image is
  // rendered whenever ANY breakpoint wants it and toggled via display.
  const layoutRv = normalizeResponsiveValue<string>(layout)
  const layoutAt = (d: 'desktop' | 'tablet' | 'mobile') => pickResponsive(layoutRv, d) ?? 'centered'
  const layoutBase = layoutAt('desktop')
  const hasSideImage = !!imageUrl && (['desktop', 'tablet', 'mobile'] as const).some((d) => layoutAt(d) === 'right-image')
  const minHeightCss = responsiveMediaCssFor(`[data-hero-id="${id}"]`, (d) => `min-height:${minH[pickResponsive(minHeightRv, d) ?? 'auto'] ?? 'auto'};justify-content:${layoutAt(d) === 'right-image' ? 'space-between' : 'normal'};gap:${layoutAt(d) === 'right-image' ? '3rem' : 'normal'};`)
  const layoutCss = [
    responsiveMediaCssFor(`[data-hero-id="${id}"] [data-hero-text]`, (d) => {
      const l = layoutAt(d)
      return `text-align:${l === 'centered' ? 'center' : 'left'};max-width:${l === 'centered' ? '700px' : 'none'};margin-left:${l === 'centered' ? 'auto' : '0'};margin-right:${l === 'centered' ? 'auto' : '0'};`
    }),
    responsiveMediaCssFor(`[data-hero-id="${id}"] [data-hero-ctas]`, (d) => `justify-content:${layoutAt(d) === 'centered' ? 'center' : 'flex-start'};`),
    hasSideImage ? responsiveMediaCssFor(`[data-hero-id="${id}"] [data-hero-img]`, (d) => `display:${layoutAt(d) === 'right-image' ? 'block' : 'none'};`) : '',
  ].filter(Boolean).join('\n')

  const inner = (
    <>
      {overlayColor && overlayOpacity > 0 && (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: overlayColor, opacity: overlayOpacity / 100, pointerEvents: 'none' }} />
      )}
      <div data-hero-text style={{ position: 'relative', zIndex: 1, textAlign: layoutBase === 'centered' ? 'center' : 'left', maxWidth: layoutBase === 'centered' ? 700 : undefined, margin: layoutBase === 'centered' ? '0 auto' : undefined }}>
        <h1 style={{ fontSize: 'clamp(1.75rem, 4vw, 3rem)', fontWeight: 800, margin: '0 0 1rem', lineHeight: 1.15, color: textColor }}>{protectText(heading, obfuscate)}</h1>
        {subheading && <p style={{ fontSize: '1.125rem', color: subColor, margin: '0 0 2rem', lineHeight: 1.65 }}>{protectText(subheading, obfuscate)}</p>}
        {(ctaLabel || cta2Label) && (
          <div data-hero-ctas style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: layoutBase === 'centered' ? 'center' : 'flex-start' }}>
            {ctaLabel && ctaHref && (
              <a {...emailSafeHref(ctaHref, obfuscate)} style={{ display: 'inline-block', padding: '0.75rem 1.75rem', background: 'var(--color-primary)', color: 'var(--color-bg)', borderRadius: 6, fontWeight: 600, textDecoration: 'none', fontSize: '1rem' }}>{maskEmailText(ctaLabel, obfuscate)}</a>
            )}
            {cta2Label && cta2Href && (
              <a {...emailSafeHref(cta2Href, obfuscate)} style={{ display: 'inline-block', padding: '0.75rem 1.75rem', background: cta2Variant === 'outline' ? 'transparent' : 'var(--color-bg)', color: cta2Variant === 'outline' ? textColor : 'var(--color-fg)', border: cta2Variant === 'outline' ? `2px solid ${textColor}` : 'none', borderRadius: 6, fontWeight: 600, textDecoration: 'none', fontSize: '1rem' }}>{maskEmailText(cta2Label, obfuscate)}</a>
            )}
          </div>
        )}
      </div>
      {hasSideImage && (
        // The hero image is the LCP element on most pages, so it is fetched eagerly and at
        // high priority - never lazy, which would push it behind the preload scanner.
        // eslint-disable-next-line @next/next/no-img-element
        <img data-hero-img src={imageUrl} alt="" fetchPriority="high" decoding="async" style={{ width: '45%', minWidth: 240, objectFit: 'cover', borderRadius: 8, flexShrink: 0, display: layoutBase === 'right-image' ? 'block' : 'none' }} />
      )}
    </>
  )

  return (
    <>
      {minHeightCss && <style>{minHeightCss}</style>}
      {layoutCss && <style>{layoutCss}</style>}
      <section data-hero-id={id} className={getPaddingClasses(padding)} style={{ position: 'relative', ...bgStyle, borderRadius: 8, marginBottom: '2rem', minHeight: minH[pickResponsive(minHeightRv, 'desktop') ?? 'auto'] ?? 'auto', display: 'flex', alignItems: 'center', justifyContent: layoutBase === 'right-image' ? 'space-between' : undefined, gap: layoutBase === 'right-image' ? '3rem' : undefined, flexWrap: 'wrap' }}
        {...getAosProps(animationType, animationDuration, animationDelay)}>
        {inner}
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------
// SocialLinks block
// ---------------------------------------------------------------------------

const SOCIAL_ICONS: Record<string, string> = {
  'twitter-x': '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.499 6.203a3.008 3.008 0 00-2.089-2.089c-1.87-.501-9.4-.501-9.4-.501s-7.509-.01-9.399.501A3.008 3.008 0 00.5 6.203a31.45 31.45 0 00-.5 5.798 31.45 31.45 0 00.501 5.783 3.008 3.008 0 002.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.399-.502a3.008 3.008 0 002.089-2.088 31.45 31.45 0 00.5-5.783 31.45 31.45 0 00-.474-5.798zM9.609 15.601V8.408l6.264 3.602z"/></svg>',
  github: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>',
}

function SocialLinks(props: any) {
  const { id, items = [], iconSize = 'md', iconColor = '', layout = 'row', gap = 'normal', padding, sticky = 'off', stickyOffset = '', animationType = 'none', animationDuration = 'normal', animationDelay = 'none', puck } = props
  const obfuscate = !puck?.isEditing
  const sizes: Record<string, number> = { sm: 20, md: 28, lg: 40 }
  const gapMap: Record<string, string> = { tight: '0.5rem', normal: '1rem', wide: '1.75rem' }
  // layout/gap drive the container; icon size drives each link through a shared
  // --social-icon custom property, so one media rule resizes every link at once.
  const layoutRv = normalizeResponsiveValue<string>(layout)
  const gapRv = normalizeResponsiveValue<string>(gap)
  const iconRv = normalizeResponsiveValue<string>(iconSize)
  const szBase = sizes[pickResponsive(iconRv, 'desktop') ?? 'md'] ?? 28
  const css = responsiveMediaCssFor(`[data-social-id="${id}"]`, (d) => `flex-direction:${pickResponsive(layoutRv, d) === 'column' ? 'column' : 'row'};gap:${gapMap[pickResponsive(gapRv, d) ?? 'normal'] ?? '1rem'};--social-icon:${sizes[pickResponsive(iconRv, d) ?? 'md'] ?? 28}px;`)
  const containerStyle = {
    display: 'flex',
    flexDirection: pickResponsive(layoutRv, 'desktop') === 'column' ? 'column' : 'row',
    gap: gapMap[pickResponsive(gapRv, 'desktop') ?? 'normal'] ?? '1rem',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: '1rem',
    '--social-icon': `${szBase}px`,
  } as React.CSSProperties
  return (
    <>
      {css && <style>{css}</style>}
      <div data-social-id={id} className={getPaddingClasses(padding)} {...getAosProps(animationType, animationDuration, animationDelay)} style={{ ...containerStyle, ...getStickyStyle(sticky, stickyOffset) }}>
        {items.map((item: any, i: number) => (
          <a key={i} {...emailSafeHref(item.url || '#', obfuscate)} target="_blank" rel="noopener noreferrer" aria-label={item.platform}
            style={{ display: 'inline-flex', color: iconColor || 'var(--color-fg-secondary)', width: 'var(--social-icon)', height: 'var(--social-icon)', flexShrink: 0 }}
            dangerouslySetInnerHTML={{ __html: (SOCIAL_ICONS[item.platform] ?? SOCIAL_ICONS['twitter-x']) as string }}
          />
        ))}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Content blocks
// ---------------------------------------------------------------------------

function Eyebrow(props: any) {
  const { text, showPulse = 'false', padding, animationType = 'none', animationDuration = 'normal', animationDelay = 'none', puck } = props
  const obfuscate = !puck?.isEditing
  const pulse = showPulse === 'true' || showPulse === true
  return (
    <div className={getPaddingClasses(padding)} {...getAosProps(animationType, animationDuration, animationDelay)} style={{ marginBottom: '1rem' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--color-primary)', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-pill, 9999px)', padding: '7px 16px' }}>
        {pulse && <span className="cactus-eyebrow-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-success)', flexShrink: 0 }} aria-hidden="true" />}
        {protectText(text, obfuscate)}
      </span>
    </div>
  )
}

const TRUST_ICONS: Record<string, string> = {
  check: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  truck: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1 3h13v13H1zM14 8h4l4 4v4h-8zM6 21a2 2 0 100-4 2 2 0 000 4zM19 21a2 2 0 100-4 2 2 0 000 4z"/></svg>',
  shield: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/></svg>',
  clock: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  star: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>',
  tag: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41L11 3.83A2 2 0 009.58 3.24L3.24 9.58A2 2 0 003.83 11l9.58 9.59a2 2 0 002.82 0l4.36-4.36a2 2 0 000-2.82z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
}

// Larger (22px) line icons for the FeatureList "glyph" variant, where each icon
// sits centred in a solid teal rounded square (the concept's belief rows). Kept
// separate from TRUST_ICONS so the inline-row 15px set isn't disturbed.
const GLYPH_ICONS: Record<string, string> = {
  share: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>',
  tag: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41L11 3.83A2 2 0 009.58 3.24L3.24 9.58A2 2 0 003.83 11l9.58 9.59a2 2 0 002.82 0l4.36-4.36a2 2 0 000-2.82z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
  compass: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
  check: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  shield: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/></svg>',
  clock: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  star: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>',
  truck: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 3h13v13H1zM14 8h4l4 4v4h-8zM6 21a2 2 0 100-4 2 2 0 000 4zM19 21a2 2 0 100-4 2 2 0 000 4z"/></svg>',
}

function Trustline(props: any) {
  const { id, items = [], gap = 'normal', padding, animationType = 'none', animationDuration = 'normal', animationDelay = 'none', puck } = props
  const obfuscate = !puck?.isEditing
  const gapMap: Record<string, string> = { tight: '1rem', normal: '1.625rem', wide: '2.25rem' }
  if (!items?.length) return <div className={getPaddingClasses(padding)} style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>No trust items yet — add some in the panel.</div>
  const gapRv = normalizeResponsiveValue<string>(gap)
  const css = responsiveMediaCssFor(`[data-trustline-id="${id}"]`, (d) => `gap:${gapMap[pickResponsive(gapRv, d) ?? 'normal'] ?? '1.625rem'};`)
  return (
    <>
      {css && <style>{css}</style>}
      <div data-trustline-id={id} className={getPaddingClasses(padding)} {...getAosProps(animationType, animationDuration, animationDelay)} style={{ display: 'flex', gap: gapMap[pickResponsive(gapRv, 'desktop') ?? 'normal'] ?? '1.625rem', flexWrap: 'wrap', fontSize: '0.8125rem', color: 'var(--color-fg-secondary)' }}>
        {items.map((item: any, i: number) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-flex', color: 'var(--color-primary)', flexShrink: 0 }} aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: (TRUST_ICONS[item.icon] ?? TRUST_ICONS.check) as string }} />
            {protectText(item.text, obfuscate)}
          </span>
        ))}
      </div>
    </>
  )
}

const CHIP_POSITIONS: Record<string, React.CSSProperties> = {
  static: {},
  'top-left': { position: 'absolute', top: 16, left: 16 },
  'top-right': { position: 'absolute', top: 16, right: 16 },
  'bottom-left': { position: 'absolute', bottom: 16, left: 16 },
  'bottom-right': { position: 'absolute', bottom: 16, right: 16 },
  'bottom-center': { position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)' },
}

function Chip(props: any) {
  const { label, value, position = 'static', animationType = 'none', animationDuration = 'normal', animationDelay = 'none', puck, obfuscate: obfuscateProp } = props
  // A Chip is both a block of its own (Puck hands it `puck`) and something
  // ImageChipPanel renders from a plain array field (no `puck` to read), so the
  // panel passes its own answer down rather than letting this default to "not
  // editing" and obfuscate inside the editor.
  const obfuscate = obfuscateProp ?? !puck?.isEditing
  return (
    <div
      style={{
        ...(CHIP_POSITIONS[position] ?? CHIP_POSITIONS.static),
        background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.10)', padding: '10px 14px', fontSize: '0.75rem',
        lineHeight: 1.45, marginBottom: position === 'static' ? '0.75rem' : 0, maxWidth: 220,
      }}
      {...getAosProps(animationType, animationDuration, animationDelay)}
    >
      {label && <b style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--color-primary)' }}>{protectText(label, obfuscate)}</b>}
      {protectText(value, obfuscate)}
    </div>
  )
}

function Card(props: any) {
  const { id, mediaUrl, alt, heading, body, ctaLabel, ctaHref, padding, minHeight = 'none', sticky = 'off', stickyOffset = '', animationType = 'none', animationDuration = 'normal', animationDelay = 'none', puck } = props
  const obfuscate = !puck?.isEditing
  // "Fill container" stretches the card to whatever holds it - a Grid column, a
  // stretch Group - so a row of cards ends up the same height as its tallest
  // sibling instead of each one hugging its own text. Anything else is a plain
  // floor: the card grows past a fixed height rather than clipping its content.
  // Per-breakpoint, same shape as Heading: desktop is the inline base, the
  // other breakpoints ride media rules on the card's own id hook.
  const mhRv = normalizeResponsiveValue<string>(minHeight)
  const mhAt = (d: Device) => pickResponsive(mhRv, d) ?? 'none'
  const isFill = (['desktop', 'tablet', 'mobile'] as const).some((d) => mhAt(d) === 'fill')
  const hasHeight = (['desktop', 'tablet', 'mobile'] as const).some((d) => mhAt(d) !== 'none')
  const desktopMh = mhAt('desktop')
  const heightDecl = (d: Device) => {
    const v = mhAt(d)
    // A filled card owns the whole container, so the usual bottom margin has
    // to go: 100% + 1.5rem overflows the very box it was told to fit.
    if (v === 'fill') return 'height:100%;align-self:stretch;min-height:auto;margin-bottom:0;'
    if (v === 'none') return 'height:auto;align-self:auto;min-height:auto;margin-bottom:1.5rem;'
    return `height:auto;align-self:auto;min-height:${BLOCK_HEIGHT_MAP[v]};margin-bottom:1.5rem;`
  }
  const wrapCss = hasHeight ? responsiveMediaCssFor(`[data-card-id="${id}"]`, heightDecl) : ''
  const fillCss = isFill ? blockFillCssResponsive('data-card-fill', id, (d) => mhAt(d) === 'fill') : ''
  return (
    <div
      className={getPaddingClasses(padding)}
      {...(hasHeight ? { 'data-card-id': id } : {})}
      {...(isFill ? { 'data-card-fill': id } : {})}
      style={{
        border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', background: 'var(--color-bg)',
        marginBottom: desktopMh === 'fill' ? 0 : '1.5rem',
        ...(desktopMh === 'fill' ? { height: '100%', alignSelf: 'stretch' } : BLOCK_HEIGHT_MAP[desktopMh] ? { minHeight: BLOCK_HEIGHT_MAP[desktopMh] } : {}),
        ...getStickyStyle(sticky, stickyOffset),
      }}
      {...getAosProps(animationType, animationDuration, animationDelay)}>
      {(wrapCss || fillCss) && <style>{`${wrapCss}${fillCss}`}</style>}
      {/* eslint-disable-next-line @next/next/no-img-element -- media URLs are external CDN addresses; next/image requires a configured domain for each provider which users add at setup time */}
      {mediaUrl && <img src={mediaUrl} alt={alt ?? ''} loading="lazy" decoding="async" style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }} />}
      <div style={{ padding: '1.25rem' }}>
        {heading && <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-fg)' }}>{protectText(heading, obfuscate)}</h3>}
        {body && <p style={{ margin: '0 0 1rem', color: 'var(--color-fg-secondary)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{protectText(body, obfuscate)}</p>}
        {ctaLabel && ctaHref && <a {...emailSafeHref(ctaHref, obfuscate)} style={{ display: 'inline-block', padding: '0.5rem 1.25rem', background: 'var(--color-primary)', color: 'var(--color-bg)', borderRadius: 6, fontWeight: 600, textDecoration: 'none', fontSize: '0.875rem' }}>{maskEmailText(ctaLabel, obfuscate)}</a>}
      </div>
    </div>
  )
}

function ImageChipPanel(props: any) {
  const {
    mediaUrl, alt, chips = [], boxShadow = 'none', borderRadius = 'none', borderStyle = 'none',
    borderColor = 'var(--color-border)', borderWidth = '1px', padding,
    framePadding = 'none', frameBg = 'none', gridPattern = 'none', scanEffect = 'off',
    sticky = 'off', stickyOffset = '', animationType = 'none', animationDuration = 'normal', animationDelay = 'none', puck,
  } = props
  const obfuscate = !puck?.isEditing
  const shadowMap: Record<string, string> = { none: 'none', sm: '0 1px 3px rgba(0,0,0,0.1)', md: '0 4px 12px rgba(0,0,0,0.12)', lg: '0 8px 30px rgba(0,0,0,0.15)' }
  const radiusMap: Record<string, string> = { none: '0', sm: '4px', md: '8px', lg: '16px' }
  const framePadMap: Record<string, string> = { none: '0', sm: '16px', md: '30px', lg: '44px' }
  if (!mediaUrl) {
    return <div style={{ marginBottom: '1.5rem', background: 'var(--color-bg-subtle)', borderRadius: 6, padding: '3rem', textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.875rem' }}>No image selected</div>
  }
  const panelRadius = radiusMap[borderRadius] ?? '0'
  const innerPad = framePadMap[framePadding] ?? '0'
  const hasFrame = framePadding !== 'none'
  // Blueprint "holo" panel background: a subtle fill or a two-tone gradient
  // behind the inset image, so the grid lines and frame gutter read the way the
  // concept's self-drawing desk panel does.
  const bgMap: Record<string, string | undefined> = {
    none: undefined,
    subtle: 'var(--color-bg-subtle)',
    gradient: 'linear-gradient(180deg, var(--color-bg), var(--color-bg-subtle))',
  }
  return (
    <div
      className={[gridPattern !== 'none' ? 'cactus-section-grid-scan' : '', hasFrame ? '' : getPaddingClasses(padding)].filter(Boolean).join(' ') || undefined}
      {...getAosProps(animationType, animationDuration, animationDelay)}
      style={{
        // getStickyStyle swaps position to sticky when on; the chips'
        // absolute positioning anchors to either the same way.
        position: 'relative', overflow: 'hidden', marginBottom: '1.5rem',
        boxShadow: shadowMap[boxShadow] ?? 'none',
        borderRadius: panelRadius,
        border: borderStyle !== 'none' ? `${borderWidth} ${borderStyle} ${borderColor}` : undefined,
        background: bgMap[frameBg],
        padding: hasFrame ? innerPad : undefined,
        ...getStickyStyle(sticky, stickyOffset),
      }}
    >
      {scanEffect === 'on' && <div className="cactus-section-scan-beam" aria-hidden="true" />}
      {/* No z-index on the image: the grid sits in the panel background (always
          behind), while the scan beam and chips come later in the DOM so they
          paint over the image without needing an explicit stacking order. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- media URLs are external CDN addresses; next/image requires a configured domain for each provider which users add at setup time */}
      <img src={mediaUrl} alt={alt ?? ''} loading="lazy" decoding="async" style={{ position: 'relative', width: '100%', height: 'auto', display: 'block', borderRadius: hasFrame ? `calc(${panelRadius} - 6px)` : undefined }} />
      {/* Chips are a plain data array, not a Puck slot — Puck doesn't insert its per-item
          drag-handle wrapper around array-field items, so each Chip's own position:absolute
          resolves against this same box in both the editor canvas and the live render. */}
      {chips.map((chip: any, i: number) => <Chip key={i} {...chip} obfuscate={obfuscate} />)}
    </div>
  )
}

function Callout(props: any) {
  const { type, title, body, padding, sticky = 'off', stickyOffset = '', animationType = 'none', animationDuration = 'normal', animationDelay = 'none', puck } = props
  const obfuscate = !puck?.isEditing
  // Colours come from the --status-{key} family (Styles → Colours → Status
  // boxes, emitted by buildTokenStyles); fallbacks are the original built-in
  // hexes so untouched/older sites look identical.
  const themes: Record<string, { bg: string; border: string; icon: string; titleColor: string }> = {
    info:    { bg: 'var(--status-info-bg, #eff6ff)',    border: 'var(--status-info, #3b82f6)',    icon: 'ℹ️', titleColor: 'var(--status-info-title, #1d4ed8)' },
    success: { bg: 'var(--status-success-bg, #f0fdf4)', border: 'var(--status-success, #16a34a)', icon: '✅', titleColor: 'var(--status-success-title, #15803d)' },
    warning: { bg: 'var(--status-warning-bg, #fffbeb)', border: 'var(--status-warning, #f59e0b)', icon: '⚠️', titleColor: 'var(--status-warning-title, #b45309)' },
    error:   { bg: 'var(--status-error-bg, #fef2f2)',   border: 'var(--status-error, #ef4444)',   icon: '❌', titleColor: 'var(--status-error-title, #b91c1c)' },
  }
  const t = (themes[type] ?? themes.info)!
  return (
    <div className={getPaddingClasses(padding)} {...getAosProps(animationType, animationDuration, animationDelay)} style={{ background: t.bg, borderLeft: `4px solid ${t.border}`, borderRadius: '0 6px 6px 0', marginBottom: '1.5rem', ...getStickyStyle(sticky, stickyOffset) }}>
      {title && <p style={{ margin: '0 0 0.375rem', fontWeight: 700, color: t.titleColor, fontSize: '0.9375rem' }}>{t.icon} {protectText(title, obfuscate)}</p>}
      <p style={{ margin: 0, color: 'var(--color-fg-secondary)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{protectText(body, obfuscate)}</p>
    </div>
  )
}

function Badge(props: any) {
  const { label, color, padding, animationType = 'none', animationDuration = 'normal', animationDelay = 'none', puck } = props
  const obfuscate = !puck?.isEditing
  // blue/yellow/red/gray read the Styles → Colours → Badges tokens when the
  // admin has set them (lib/design/tokens.ts), falling back to the original
  // hardcoded pastel hexes otherwise. 'primary' already reused the theme-aware
  // --color-primary-subtle before this and is left as-is.
  const colors: Record<string, { bg: string; text: string }> = {
    primary: { bg: 'var(--color-primary-subtle, #dcfce7)', text: 'var(--color-primary)' },
    blue:    { bg: 'var(--badge-blue-bg, #dbeafe)',   text: 'var(--badge-blue-text, #1d4ed8)' },
    yellow:  { bg: 'var(--badge-yellow-bg, #fef9c3)', text: 'var(--badge-yellow-text, #a16207)' },
    red:     { bg: 'var(--badge-red-bg, #fee2e2)',    text: 'var(--badge-red-text, #b91c1c)' },
    gray:    { bg: 'var(--badge-gray-bg, var(--color-bg-subtle))', text: 'var(--badge-gray-text, var(--color-fg-secondary))' },
  }
  const t = (colors[color] ?? colors.gray)!
  return (
    <div className={getPaddingClasses(padding)} {...getAosProps(animationType, animationDuration, animationDelay)}>
      <span style={{ display: 'inline-block', padding: '0.25rem 0.625rem', borderRadius: 'var(--radius-pill, 9999px)', fontSize: '0.75rem', fontWeight: 600, background: t.bg, color: t.text, marginBottom: '0.5rem' }}>{protectText(label, obfuscate)}</span>
    </div>
  )
}

function Accordion(props: any) {
  const { items, padding, animationType = 'none', animationDuration = 'normal', animationDelay = 'none', puck } = props
  const obfuscate = !puck?.isEditing
  if (!items?.length) return <div style={{ color: 'var(--color-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>No accordion items yet — add some in the panel.</div>
  return (
    <div className={getPaddingClasses(padding)} {...getAosProps(animationType, animationDuration, animationDelay)} style={{ marginBottom: '1.5rem' }}>
      {items.map((item: any, i: number) => (
        <details key={i} style={{ borderBottom: '1px solid var(--color-border)', padding: 0 }}>
          <summary style={{ padding: '0.875rem 0', fontWeight: 600, color: 'var(--color-fg)', cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9375rem' }}>
            {/* Masked rather than linked: a click anywhere in a <summary> toggles
                the panel, so a real mailto: link in here would open the mail app
                AND fold the answer away. The answer below is the place for a
                clickable address anyway. */}
            {maskEmailText(item.question, obfuscate)}
            <span style={{ fontSize: '1.25rem', color: 'var(--color-muted)', flexShrink: 0, marginLeft: '1rem' }}>+</span>
          </summary>
          <p style={{ margin: '0 0 0.875rem', color: 'var(--color-fg-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{protectText(item.answer, obfuscate)}</p>
        </details>
      ))}
    </div>
  )
}

function Stats(props: any) {
  const { items, padding, animationType = 'none', animationDuration = 'normal', animationDelay = 'none', puck } = props
  const obfuscate = !puck?.isEditing
  if (!items?.length) return <div style={{ color: 'var(--color-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>No stats yet — add some in the panel.</div>
  return (
    <div className={getPaddingClasses(padding)} style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '1.5rem' }} {...getAosProps(animationType, animationDuration, animationDelay)}>
      {items.map((item: any, i: number) => (
        <div key={i} style={{ flex: '1 1 120px', textAlign: 'center', padding: '1.25rem', background: 'var(--color-bg-subtle)', borderRadius: 8 }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-primary)', lineHeight: 1 }}>{protectText(item.value, obfuscate)}</div>
          <div style={{ marginTop: '0.375rem', fontSize: '0.875rem', color: 'var(--color-muted)', fontWeight: 500 }}>{protectText(item.label, obfuscate)}</div>
        </div>
      ))}
    </div>
  )
}

function FeatureList(props: any) {
  const { items, iconStyle = 'emoji', padding, animationType = 'none', animationDuration = 'normal', animationDelay = 'none', puck } = props
  const obfuscate = !puck?.isEditing
  if (!items?.length) return <div style={{ color: 'var(--color-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>No features yet — add some in the panel.</div>
  // "glyph" variant: each row leads with a solid teal rounded square holding a
  // white line-icon, with larger serif titles — the concept's "beliefs" rows.
  // "emoji" (default) keeps the original inline emoji + compact title layout so
  // existing FeatureList blocks render unchanged.
  const glyph = iconStyle === 'glyph'
  return (
    <div className={getPaddingClasses(padding)} style={{ marginBottom: '1.5rem' }} {...getAosProps(animationType, animationDuration, animationDelay)}>
      {items.map((item: any, i: number) => (
        <div
          key={i}
          className={glyph ? 'cactus-feature-glyph-row' : undefined}
          style={glyph
            ? { display: 'flex', gap: '1.125rem', padding: '1.375rem 1.5rem', borderRadius: 12, alignItems: 'flex-start', border: '1px solid transparent' }
            : { display: 'flex', gap: '1rem', marginBottom: '1.25rem', alignItems: 'flex-start' }}
        >
          {glyph
            ? <span aria-hidden="true" style={{ flexShrink: 0, width: 46, height: 46, borderRadius: 12, background: 'var(--color-primary)', color: 'var(--color-bg)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                dangerouslySetInnerHTML={{ __html: (GLYPH_ICONS[item.icon] ?? GLYPH_ICONS.check) as string }} />
            : item.emoji && <span style={{ fontSize: '1.75rem', flexShrink: 0, lineHeight: 1 }}>{item.emoji}</span>}
          <div>
            {item.title && (glyph
              ? <h3 style={{ margin: '0 0 0.375rem', fontFamily: 'var(--display-family, Georgia, serif)', fontSize: '1.375rem', fontWeight: 500, color: 'var(--color-fg)', lineHeight: 1.2 }}>{protectText(item.title, obfuscate)}</h3>
              : <h4 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 700, color: 'var(--color-fg)' }}>{protectText(item.title, obfuscate)}</h4>)}
            {item.description && <p style={{ margin: 0, color: 'var(--color-fg-secondary)', lineHeight: 1.65, fontSize: glyph ? '0.9375rem' : '0.9375rem', maxWidth: glyph ? '48ch' : undefined, whiteSpace: 'pre-wrap' }}>{protectText(item.description, obfuscate)}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Spec data panel (concept's ".xcard": a windowed table with a dot title-bar
//    and an optional "same price for all" pill on a highlighted row) ──────────
function SpecPanel(props: any) {
  const { title = '', rows = [], boxShadow = 'md', borderRadius = 'lg', padding, sticky = 'off', stickyOffset = '', animationType = 'none', animationDuration = 'normal', animationDelay = 'none', puck } = props
  const obfuscate = !puck?.isEditing
  const shadowMap: Record<string, string> = { none: 'none', sm: '0 1px 3px rgba(0,0,0,0.1)', md: '0 4px 12px rgba(0,0,0,0.10)', lg: '0 8px 30px rgba(0,0,0,0.15)' }
  const radiusMap: Record<string, string> = { none: '0', sm: '4px', md: '8px', lg: '16px' }
  return (
    <div className={getPaddingClasses(padding)} {...getAosProps(animationType, animationDuration, animationDelay)} style={{ marginBottom: '1.5rem', ...getStickyStyle(sticky, stickyOffset) }}>
      <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: radiusMap[borderRadius] ?? '16px', boxShadow: shadowMap[boxShadow] ?? shadowMap.md, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--color-border)', background: 'linear-gradient(90deg, var(--color-primary-subtle, rgba(0,0,0,0.03)), transparent)' }}>
          <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--color-primary)', flexShrink: 0 }} />
          <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--color-border)', flexShrink: 0 }} />
          <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--color-border)', flexShrink: 0 }} />
          {title && <b style={{ marginLeft: 6, fontSize: '0.875rem', color: 'var(--color-fg)' }}>{protectText(title, obfuscate)}</b>}
        </div>
        <div>
          {rows.map((row: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: '1rem', padding: '12px 20px', borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--color-bg-subtle)', alignItems: 'baseline' }}>
              <span style={{ flex: '0 0 44%', color: 'var(--color-muted)', fontSize: '0.875rem' }}>{protectText(row.label, obfuscate)}</span>
              <span style={{ flex: '1 1 auto', color: 'var(--color-fg-secondary)', fontSize: '0.875rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                {row.highlight
                  ? <b style={{ color: 'var(--color-primary)', fontSize: '1rem' }}>{protectText(row.value, obfuscate)}</b>
                  : <span>{protectText(row.value, obfuscate)}</span>}
                {row.badge && (
                  <span style={{ background: 'color-mix(in srgb, var(--color-success) 12%, transparent)', color: 'var(--color-success)', borderRadius: 9999, padding: '3px 10px', fontSize: '0.75rem', fontWeight: 600 }}>{protectText(row.badge, obfuscate)}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Ticker / marquee band (concept's ".ticker-band": a teal strip of phrases
//    scrolling seamlessly; items are duplicated so the -50% loop is invisible) ─
function Ticker(props: any) {
  const { items = [], speed = 'normal', animationType = 'none', animationDuration = 'normal', animationDelay = 'none', puck } = props
  const obfuscate = !puck?.isEditing
  const speedMap: Record<string, string> = { slow: '45s', normal: '30s', fast: '20s' }
  if (!items?.length) return <div style={{ color: 'var(--color-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>No ticker phrases yet — add some in the panel.</div>
  const loop = [...items, ...items]
  return (
    <div {...getAosProps(animationType, animationDuration, animationDelay)} style={{ background: 'var(--color-primary)', color: 'var(--color-bg)', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', padding: '16px 0', overflow: 'hidden', marginBottom: '1.5rem' }}>
      <div className="cactus-ticker" style={{ animationDuration: speedMap[speed] ?? '30s' }}>
        {loop.map((it: any, i: number) => (
          <span key={i} className="cactus-ticker-item" aria-hidden={i >= items.length ? 'true' : undefined}>{protectText(it.text, obfuscate)}</span>
        ))}
      </div>
    </div>
  )
}

function Logos(props: any) {
  const { id, items, logoHeight, justify, padding, animationType = 'none', animationDuration = 'normal', animationDelay = 'none', puck } = props
  const obfuscate = !puck?.isEditing
  const heights: Record<string, number> = { sm: 32, md: 48, lg: 64 }
  const justifyMap: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' }
  if (!items?.length) return <div className={getPaddingClasses(padding)} style={{ color: 'var(--color-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>No logos added yet — add some in the panel.</div>
  // justify drives the container; logo height drives every logo through a shared
  // --logo-h custom property, so one media rule resizes them all together.
  const justifyRv = normalizeResponsiveValue<string>(justify)
  const heightRv = normalizeResponsiveValue<string>(logoHeight)
  const heightPx = heights[pickResponsive(heightRv, 'desktop') ?? 'md'] ?? 48
  const css = responsiveMediaCssFor(`[data-logos-id="${id}"]`, (d) => `justify-content:${justifyMap[pickResponsive(justifyRv, d) ?? 'center'] ?? 'center'};--logo-h:${heights[pickResponsive(heightRv, d) ?? 'md'] ?? 48}px;`)
  const containerStyle = { display: 'flex', flexWrap: 'wrap', gap: '2rem', justifyContent: justifyMap[pickResponsive(justifyRv, 'desktop') ?? 'center'] ?? 'center', alignItems: 'center', marginBottom: '1.5rem', '--logo-h': `${heightPx}px` } as React.CSSProperties
  return (
    <>
      {css && <style>{css}</style>}
      <div data-logos-id={id} className={getPaddingClasses(padding)} style={containerStyle}
        {...getAosProps(animationType, animationDuration, animationDelay)}>
        {items.map((item: any, i: number) => {
          const inner = item.logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={item.logoUrl} alt={item.alt ?? ''} loading="lazy" decoding="async" style={{ height: 'var(--logo-h)', width: 'auto', objectFit: 'contain' }} />
            : <div style={{ height: 'var(--logo-h)', width: 120, background: 'var(--color-bg-subtle)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-muted)', fontSize: '0.75rem' }}>Logo</div>
          return item.href
            ? <a key={i} {...emailSafeHref(item.href, obfuscate)} style={{ display: 'inline-flex', alignItems: 'center' }}>{inner}</a>
            : <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>{inner}</span>
        })}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Site blocks
// ---------------------------------------------------------------------------

function Copyright(props: any) {
  const {
    id, siteName, prefix = '©', customPrefix = '', yearFormat = 'current', startYear,
    showSiteName = true, suffix = '', alignment = 'left', fontSize = 'small',
    textColor = 'var(--color-muted)',
    privacyPolicyUrl = '', privacyPolicyLabel = 'Privacy Policy',
    termsUrl = '', termsLabel = 'Terms of Service',
    customLink1Url = '', customLink1Label = '', customLink2Url = '', customLink2Label = '',
    puck,
  } = props
  const obfuscate = !puck?.isEditing
  const currentYear = new Date().getFullYear()
  const resolvedPrefix = prefix === 'custom' ? (customPrefix || '©') : prefix === 'none' ? '' : prefix
  let yearText = ''
  if (yearFormat === 'current') yearText = String(currentYear)
  else if (yearFormat === 'range' && startYear) yearText = `${startYear}–${currentYear}`
  const fontSizes: Record<string, string> = { small: '0.875rem', medium: '1rem', large: '1.125rem' }
  const showSiteNameBool = showSiteName !== false && (showSiteName as unknown) !== 'false'
  const parts = [resolvedPrefix, yearText, showSiteNameBool ? (siteName ?? 'My Site') : '', suffix].filter(Boolean)
  const links = [
    privacyPolicyUrl ? { url: privacyPolicyUrl, label: privacyPolicyLabel } : null,
    termsUrl ? { url: termsUrl, label: termsLabel } : null,
    customLink1Url ? { url: customLink1Url, label: customLink1Label || customLink1Url } : null,
    customLink2Url ? { url: customLink2Url, label: customLink2Label || customLink2Url } : null,
  ].filter(Boolean) as Array<{ url: string; label: string }>
  // alignment drives the row's justify-content; font size drives the text and
  // links through a shared --copy-fs custom property. One media rule per
  // breakpoint carries both.
  const jc = (a: string) => (a === 'center' ? 'center' : a === 'right' ? 'flex-end' : 'space-between')
  const alignRv = normalizeResponsiveValue<string>(alignment)
  const fsRv = normalizeResponsiveValue<string>(fontSize)
  const fsBase = fontSizes[pickResponsive(fsRv, 'desktop') ?? 'small'] ?? '0.875rem'
  const css = responsiveMediaCssFor(`[data-copyright-id="${id}"]`, (d) => `justify-content:${jc(pickResponsive(alignRv, d) ?? 'left')};--copy-fs:${fontSizes[pickResponsive(fsRv, d) ?? 'small'] ?? '0.875rem'};`)
  return (
    <>
      {css && <style>{css}</style>}
      <div data-copyright-id={id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: jc(pickResponsive(alignRv, 'desktop') ?? 'left'), gap: '1.5rem', width: '100%', '--copy-fs': fsBase } as React.CSSProperties}>
        <span style={{ color: textColor, fontSize: 'var(--copy-fs)' }}>{protectText(parts.join(' '), obfuscate)}</span>
        {links.length > 0 && (
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            {links.map((link) => <a key={link.url} {...emailSafeHref(link.url, obfuscate)} style={{ color: textColor, fontSize: 'var(--copy-fs)', textDecoration: 'none' }}>{maskEmailText(link.label, obfuscate)}</a>)}
          </div>
        )}
      </div>
    </>
  )
}

const menuFontSizeMap: Record<string, string> = { small: '0.8125rem', medium: '0.9375rem', large: '1.0625rem' }
const menuFontWeightMap: Record<string, string | number> = { normal: 400, medium: 500, semibold: 600, bold: 700 }
const menuVerticalGapMap: Record<string, string> = { tight: '0.25rem', normal: '0.5rem', wide: '1rem' }

function MenuBlock(props: any) {
  const {
    id, resolvedItems, orientation, spacing, alignment, itemFontSize = 'medium', itemFontWeight = 'medium', textTransform = 'none', itemColor, hoverBackground,
    hoverColor, activeColor, activeUnderline = 'none', activeUnderlineColor, activeUnderlineThickness, activeUnderlineOffset, activeFontWeight, itemFontFamily, showDropdowns = 'hover',
    spacingShrunk, itemFontSizeShrunk, itemFontWeightShrunk,
    itemSpacingFluid, letterSpacingFluid, itemFontSizeFluid,
    scale, dropdownAlign = 'left', fitOneLine = 'no',
  } = props
  if (!resolvedItems) {
    return <div style={{ padding: '0.75rem 1rem', background: 'var(--color-bg-subtle)', borderRadius: 6, color: 'var(--color-muted)', fontSize: '0.875rem' }}>Menu — configure in editor</div>
  }
  // spacing/font-size/font-weight/text-transform are each a ResponsiveValue.
  // Desktop is the vertical menu's inline base; tablet/mobile are folded into
  // the per-id media rules below. Legacy plain-string data normalises to
  // desktop-only, so it renders identically and emits no media rules.
  const spacingRv = normalizeResponsiveValue<string>(spacing)
  const fontSizeRv = normalizeResponsiveValue<string>(itemFontSize)
  const fontWeightRv = normalizeResponsiveValue<string>(itemFontWeight)
  const transformRv = normalizeResponsiveValue<string>(textTransform)
  const spacingD = pickResponsive(spacingRv, 'desktop') ?? 'normal'
  const fontSizeD = pickResponsive(fontSizeRv, 'desktop') ?? 'medium'
  const fontWeightD = pickResponsive(fontWeightRv, 'desktop') ?? 'medium'
  const transformD = pickResponsive(transformRv, 'desktop') ?? 'none'
  const fluidGap = fluidClamp(itemSpacingFluid?.min, itemSpacingFluid?.max, 'rem')
  const fluidFontSize = fluidClamp(itemFontSizeFluid?.min, itemFontSizeFluid?.max, 'rem')
  const fluidLetterSpacing = fluidClamp(letterSpacingFluid?.min, letterSpacingFluid?.max, 'em')
  const linkStyleOverride: React.CSSProperties = {}
  if (itemColor) linkStyleOverride.color = itemColor
  if (itemFontFamily) linkStyleOverride.fontFamily = itemFontFamily
  if (fontSizeD !== 'medium') linkStyleOverride.fontSize = menuFontSizeMap[fontSizeD]
  if (fontWeightD !== 'medium') linkStyleOverride.fontWeight = menuFontWeightMap[fontWeightD]
  if (transformD !== 'none') linkStyleOverride.textTransform = transformD as React.CSSProperties['textTransform']
  if (fluidFontSize) linkStyleOverride.fontSize = fluidFontSize
  if (fluidLetterSpacing) linkStyleOverride.letterSpacing = fluidLetterSpacing
  const shrinkListClass = `menu-vlist-shrink-${id}`
  const shrinkLinkClass = `menu-vlink-shrink-${id}`
  const hasVerticalShrink = spacingShrunk || itemFontSizeShrunk || itemFontWeightShrunk
  const linkColours = { hoverColor, hoverBackground, activeColor, activeUnderline, activeUnderlineColor, activeUnderlineThickness, activeUnderlineOffset, activeFontWeight }
  // React hoists+dedupes precedence-tagged stylesheet links, so a Google font
  // picked on this block alone (not in the site tokens buildFontHref covers)
  // still loads on the published page.
  const menuFontHref = googleFontHrefForFamily(itemFontFamily)
  // Per-breakpoint overrides for the vertical menu, keyed on the block's own
  // shrink classes (already unique per id). Font-size is skipped when the fluid
  // clamp owns it; gap is skipped when fluid item spacing does. Matches the
  // top-level-only scope of linkStyleOverride (child links are untouched here).
  const vLinkMediaCss = responsiveMediaCssFor(`.${shrinkLinkClass}`, (d) => {
    const parts: string[] = []
    if (!fluidFontSize) parts.push(`font-size:${menuFontSizeMap[pickResponsive(fontSizeRv, d) ?? 'medium'] ?? menuFontSizeMap.medium}`)
    parts.push(`font-weight:${menuFontWeightMap[pickResponsive(fontWeightRv, d) ?? 'medium'] ?? menuFontWeightMap.medium}`)
    parts.push(`text-transform:${pickResponsive(transformRv, d) ?? 'none'}`)
    return parts.join(';') + ';'
  })
  const vListMediaCss = fluidGap ? '' : responsiveMediaCssFor(`.${shrinkListClass}`, (d) => `gap:${menuVerticalGapMap[pickResponsive(spacingRv, d) ?? 'normal'] ?? '0.5rem'};`)
  const vMediaCss = [vLinkMediaCss, vListMediaCss].filter(Boolean).join('\n')
  // Scale rides on the list itself here - a vertical menu is a single box, so
  // there is nothing else to carry it (no hamburger, no dropdown trigger).
  const { className: scaleClass, css: scaleCss } = menuScaleStyles(id, scale)
  if (orientation === 'vertical') {
    return (
      <nav>
        {menuFontHref && <link rel="stylesheet" href={menuFontHref} precedence="default" />}
        {scaleCss && <style>{scaleCss}</style>}
        {vMediaCss && <style>{vMediaCss}</style>}
        {hasVerticalShrink && (
          <style>{[
            spacingShrunk ? `${HEADER_SHRUNK_SELECTOR} .${shrinkListClass}{gap:${menuVerticalGapMap[spacingShrunk] ?? '0.5rem'} !important;}` : '',
            itemFontSizeShrunk ? `${HEADER_SHRUNK_SELECTOR} .${shrinkLinkClass}{font-size:${menuFontSizeMap[itemFontSizeShrunk]} !important;}` : '',
            itemFontWeightShrunk ? `${HEADER_SHRUNK_SELECTOR} .${shrinkLinkClass}{font-weight:${menuFontWeightMap[itemFontWeightShrunk]} !important;}` : '',
          ].filter(Boolean).join('\n')}</style>
        )}
        <ul className={[shrinkListClass, scaleClass].filter(Boolean).join(' ')} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: fluidGap ?? menuVerticalGapMap[spacingD] ?? '0.5rem' }}>
          {resolvedItems.map((item: any) => (
            <li key={item.id}>
              <MenuVerticalLink item={item} colours={linkColours}
                className={shrinkLinkClass}
                style={{ display: 'block', padding: '0.25rem 0', fontSize: menuFontSizeMap[fontSizeD] ?? '0.9375rem', fontWeight: menuFontWeightMap[fontWeightD] ?? 500, color: itemColor || 'var(--color-fg-secondary)', textDecoration: 'none', ...linkStyleOverride }} />
              {item.children?.length > 0 && (
                <ul style={{ listStyle: 'none', margin: '0.25rem 0 0', padding: '0 0 0 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {item.children.map((child: any) => (
                    <li key={child.id}><MenuVerticalLink item={child} colours={linkColours} style={{ display: 'block', padding: '0.25rem 0', fontSize: '0.9rem', color: itemColor || 'var(--color-muted)', textDecoration: 'none' }} /></li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>
    )
  }
  // Cascading fallback (tablet inherits desktop, mobile inherits tablet) matches the
  // "Same as desktop"/"Same as tablet" placeholder text ResponsiveSelectField shows
  // for an unset breakpoint - and GridBlock's identical pick() for column widths.
  const nav = normalizeResponsiveValue<string>(props.navToggle)
  const showDesktopToggle = nav.desktop ?? 'show'
  const showTabletToggle = nav.tablet ?? showDesktopToggle
  const showMobileToggle = nav.mobile ?? showTabletToggle
  return <MenuBlockClient blockId={id} resolvedItems={resolvedItems} spacing={spacing} alignment={alignment} itemFontSize={itemFontSize} itemFontWeight={itemFontWeight} textTransform={textTransform} itemColor={itemColor} itemFontFamily={itemFontFamily} hoverColor={hoverColor} activeColor={activeColor} activeUnderline={activeUnderline} activeUnderlineColor={activeUnderlineColor} activeUnderlineThickness={activeUnderlineThickness} activeUnderlineOffset={activeUnderlineOffset} activeFontWeight={activeFontWeight} showDropdowns={showDropdowns} hoverBackground={hoverBackground} showDesktopToggle={showDesktopToggle} showTabletToggle={showTabletToggle} showMobileToggle={showMobileToggle} scale={scale} dropdownAlign={dropdownAlign} fitOneLine={fitOneLine} spacingShrunk={spacingShrunk} itemFontSizeShrunk={itemFontSizeShrunk} itemFontWeightShrunk={itemFontWeightShrunk} itemSpacingFluid={itemSpacingFluid} letterSpacingFluid={letterSpacingFluid} itemFontSizeFluid={itemFontSizeFluid} />
}

function LoginButton(props: any) {
  const { isLoggedIn, adminPath, loginLabel, registerLabel } = props
  const base = adminPath ? `/${adminPath}` : ''
  if (isLoggedIn) {
    return (
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <a href={`${base}/account`} style={{ padding: '0.5rem 1rem', borderRadius: 6, border: '1px solid var(--color-border)', textDecoration: 'none', color: 'var(--color-fg-secondary)', fontSize: '0.875rem', fontWeight: 500 }}>My Account</a>
        <form action="/api/auth/logout" method="POST" style={{ margin: 0 }}>
          <button type="submit" style={{ padding: '0.5rem 1rem', borderRadius: 6, background: 'none', border: '1px solid var(--color-border)', color: 'var(--color-fg-secondary)', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Sign out</button>
        </form>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <a href={`${base}/login`} style={{ padding: '0.5rem 1rem', borderRadius: 6, border: '1px solid var(--color-border)', textDecoration: 'none', color: 'var(--color-fg-secondary)', fontSize: '0.875rem', fontWeight: 500 }}>{loginLabel || 'Sign in'}</a>
      <a href={`${base}/register`} style={{ padding: '0.5rem 1rem', borderRadius: 6, background: 'var(--color-primary)', border: '1px solid var(--color-primary)', textDecoration: 'none', color: 'var(--color-bg)', fontSize: '0.875rem', fontWeight: 500 }}>{registerLabel || 'Register'}</a>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Members blocks — editor-side previews (MEMBERS_SPEC.md Phase 7).
// The editor has no member session to check (it runs under an admin session,
// never a member one), so these always render a fixed preview state rather
// than trying to guess; the live-site behaviour lives in
// lib/puck/components/MembersBlocksRsc.tsx, swapped in via rscComponents
// below. MembersLogin/MembersRegister reuse the exact same client
// components as the real login/register pages, so those two previews are
// pixel-identical to production, not just a placeholder.
const MEMBERS_GATE_LABEL_STYLE: React.CSSProperties = { fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.02em' }

function MembersLoginBlock(props: any) {
  return <LoginForm redirectTo={props.redirectTo || '/'} />
}

function MembersRegisterBlock() {
  return <RegisterForm registrationMode="OPEN" />
}

function MembersAccountLinkBlock(props: any) {
  const { loginLabel, registerLabel } = props
  // Built via a variable rather than a literal "/account/..." string, same
  // as LoginButton above - this is only an editor preview, never real
  // navigation, and a literal internal-looking path trips the Next.js
  // no-html-link-for-pages lint rule that a computed one doesn't.
  const base = '/account'
  const linkStyle: React.CSSProperties = { padding: '0.5rem 1rem', borderRadius: 6, border: '1px solid var(--color-border)', textDecoration: 'none', color: 'var(--color-text-secondary)', fontSize: '0.875rem', fontWeight: 500 }
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <a href={`${base}/login`} style={linkStyle}>{loginLabel || 'Sign in'}</a>
      <a href={`${base}/register`} style={{ ...linkStyle, background: 'var(--color-primary)', border: '1px solid var(--color-primary)', color: 'var(--color-bg)' }}>{registerLabel || 'Register'}</a>
    </div>
  )
}

function MemberGateBlock(props: any) {
  const { content } = props
  return (
    <div style={{ border: '1px dashed var(--color-border)', borderRadius: 6, padding: '0.75rem' }}>
      <div style={MEMBERS_GATE_LABEL_STYLE}>Member gate — signed-in members only, live</div>
      {typeof content === 'function' ? content() : null}
    </div>
  )
}

function TrustedMemberGateBlock(props: any) {
  const { content } = props
  return (
    <div style={{ border: '1px dashed var(--color-border)', borderRadius: 6, padding: '0.75rem' }}>
      <div style={MEMBERS_GATE_LABEL_STYLE}>Trusted member gate — trusted members only, live</div>
      {typeof content === 'function' ? content() : null}
    </div>
  )
}

function MembersProfileBlock() {
  return (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '0.75rem', background: 'var(--color-bg-subtle)', borderRadius: 6 }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--color-border)', flexShrink: 0 }} />
      <div>
        <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>Member name</div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>Preview — shows the signed-in member&apos;s own profile live</div>
      </div>
    </div>
  )
}

// RSC-safe SiteLogo (no client hooks). Plain function, no server-only APIs —
// safe to live in the client-reachable base config (SiteHeaderBlock below
// renders it directly, in both the editor and the real page).
export function SiteLogoRsc(props: any) {
  const { id, logoUrl, logoUrlDark, siteName, cellHeight, cellHeightShrunk, logoHeight, logoHeightShrunk, showTextWithLogo = 'false', showIcon = 'true', textColor, align, homeUrl = '/' } = props
  // cellHeight/cellHeightShrunk are the current field keys; logoHeight/
  // logoHeightShrunk are accepted as a fallback for pre-rename saved data and
  // for SiteHeaderBlock, which still passes logoHeight. Per-breakpoint via the
  // same helper SiteLogoClient uses, so the two halves cannot drift.
  const { base: cellH, css: cellHCss } = siteLogoCellHeight(id, cellHeight, logoHeight)
  const cellHShrunk = cellHeightShrunk ?? logoHeightShrunk
  const showTextBool = showTextWithLogo === true || showTextWithLogo === 'true'
  const showIconBool = showIcon !== false && showIcon !== 'false'
  // Alignment comes from the same helper SiteLogoClient uses, so the editor and
  // the published page cannot disagree about it.
  const { justifyContent, css: alignCss } = siteLogoAlign(id, align)
  const style: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent, gap: '0.5rem', fontWeight: 700, fontSize: '1.125rem', color: textColor || 'var(--color-text)', textDecoration: 'none' }
  if (logoUrl) {
    // Shared --header-cell-height custom property drives the logo image height;
    // the shrink override just swaps the variable. Mirrors SiteLogoClient (the
    // editor render) exactly so editor and live markup stay identical.
    const logoImgStyle = {
      '--header-cell-height': `${cellH}px`,
      height: 'var(--header-cell-height)',
      width: 'auto',
      maxWidth: '100%',
      objectFit: 'contain',
      transition: 'height 0.25s ease',
    } as React.CSSProperties
    return (
      <a href={homeUrl || '/'} data-sitelogo-id={id} style={style}>
        {alignCss && <style>{alignCss}</style>}
        {cellHCss && <style>{cellHCss}</style>}
        {cellHShrunk && (
          <style>{`header[data-shrink-root][data-shrunk] img[data-site-logo]{--header-cell-height:${cellHShrunk}px !important;}`}</style>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={siteName ?? 'Logo'} data-logo-variant={logoUrlDark ? 'light' : undefined} data-site-logo style={logoImgStyle} />
        {logoUrlDark && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrlDark} alt={siteName ?? 'Logo'} data-logo-variant="dark" data-site-logo style={logoImgStyle} />
        )}
        {showTextBool && siteName && <span>{siteName}</span>}
      </a>
    )
  }
  return (
    <a href={homeUrl || '/'} data-sitelogo-id={id} style={style}>
      {alignCss && <style>{alignCss}</style>}
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG logo asset with known static path; no CDN optimisation needed */}
      {showIconBool && <img src="/cactus.svg" alt="Cactus Foundation" style={{ height: 28, width: 28, flexShrink: 0 }} />}
      {siteName ?? 'Site Name'}
    </a>
  )
}

 

// ---------------------------------------------------------------------------
// Main puckConfig
// ---------------------------------------------------------------------------

// Page-wide chrome: background colour behind/between Sections, plus optional
// breathing room above the first Section and below the last. Deliberately no
// max-width field here — every Section already carries its own maxWidth and
// manages its own full-bleed background, so a root-level max-width would clip
// straight through any Section set to "Full bleed".
const pagePaddingYMap: Record<string, string> = { none: '0', sm: '2rem', md: '4rem', lg: '6rem' }

const pageRootRender = ({ children, bg = { mode: 'none', color: '' }, paddingY = 'none' }: any) => {
  const background = bg.mode === 'color' ? (bg.color || undefined) : undefined
  const padding = pagePaddingYMap[paddingY] ?? '0'
  return (
    <div style={{ background, paddingTop: padding, paddingBottom: padding }}>
      {children}
    </div>
  )
}

export const puckConfig = {
  categories: {
    layout:     { title: 'Layout',     components: ['Section', 'Grid2', 'Grid3', 'Grid4', 'Group', 'Split', 'Spacer', 'Divider'], defaultExpanded: true },
    typography: { title: 'Typography', components: ['Heading', 'TextBlock', 'RichTextBlock', 'Quote', 'Caption'], defaultExpanded: true },
    actions:    { title: 'Actions',    components: ['ButtonLink', 'CTABanner'],                                 defaultExpanded: true },
    media:      { title: 'Media',      components: ['ImageBlock', 'VideoEmbed', 'Embed'],                       defaultExpanded: true },
    content:    { title: 'Content',    components: ['Hero', 'Eyebrow', 'Card', 'ImageChipPanel', 'Callout', 'Badge', 'Trustline', 'Chip', 'Accordion', 'FeatureList', 'SpecPanel', 'Ticker', 'Stats', 'Logos', 'SocialLinks'], defaultExpanded: true },
    site:       { title: 'Site',       components: ['SiteHeader', 'SiteLogo', 'Copyright', 'MenuBlock', 'LoginButton', 'ThemeToggle', 'CookieSettingsLink'], defaultExpanded: false },
    members:    { title: 'Members',    components: ['MembersLogin', 'MembersRegister', 'MembersAccountLink', 'MemberGate', 'TrustedMemberGate', 'MembersProfile'], defaultExpanded: false },
    embed:      { title: 'Embed',      components: ['LayoutEmbed'], defaultExpanded: false },
    modules:    { title: 'Modules',    components: Object.keys(moduleComponents), defaultExpanded: true },
  },
  root: {
    fields: {
      bg:       { type: 'custom' as const, label: 'Page background', render: PageBgColorField },
      paddingY: { type: 'select' as const, label: 'Padding above/below content', options: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }] },
    },
    defaultProps: { bg: { mode: 'none', color: '' }, paddingY: 'none' },
    render: pageRootRender,
  },
  components: (() => {
    const raw: Record<string, any> = {
    // ── Layout ──────────────────────────────────────────────────────────────
    Section: {
      label: 'Section',
      fields: {
        content: { type: 'slot' as const },
        bg: { type: 'custom' as const, label: 'Background type', render: SectionBgColorField },
        bgImage: { type: 'text' as const, label: 'Background image URL' },
        bgSize: { type: 'select' as const, label: 'Image size', options: [{ value: 'cover', label: 'Cover' }, { value: 'contain', label: 'Contain' }, { value: 'repeat', label: 'Tile' }] },
        overlayColor: { type: 'custom' as const, label: 'Overlay colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} /> },
        overlayOpacity: { type: 'number' as const, label: 'Overlay opacity (0–100)', min: 0, max: 100 },
        paddingY: { type: 'custom' as const, label: 'Vertical padding', options: SECTION_PADDING_Y_OPTIONS, render: ResponsiveSelectField },
        maxWidth: { type: 'custom' as const, label: 'Content max-width', options: [{ value: 'none', label: 'Full bleed' }, { value: 'narrow', label: 'Narrow (720px)' }, { value: 'standard', label: 'Standard (960px)' }, { value: 'wide', label: 'Wide (1200px)' }, { value: 'custom', label: 'Custom…' }], render: ResponsiveSelectField },
        maxWidthCustom: { type: 'custom' as const, label: 'Custom max-width', units: ['px', '%', 'rem', 'vw', 'ch'], render: ResponsiveUnitValueField },
        contentAlign: { type: 'custom' as const, label: 'Content vertical alignment', options: [{ value: 'top', label: 'Top' }, { value: 'middle', label: 'Middle' }, { value: 'bottom', label: 'Bottom' }], render: ResponsiveSelectField },
        textColor: { type: 'custom' as const, label: 'Text colour override', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} /> },
        sticky: { type: 'select' as const, label: 'Sticky', options: [{ value: 'off', label: 'Off' }, { value: 'on', label: 'Stick to top' }] },
        stickyOffset: { type: 'custom' as const, label: 'Sticky offset', units: ['px', 'rem', 'vh'], render: UnitValueField },
        boxShadow: { type: 'select' as const, label: 'Box shadow', options: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }] },
        borderStyle: { type: 'select' as const, label: 'Border', options: [{ value: 'none', label: 'None' }, { value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }] },
        borderColor: { type: 'custom' as const, label: 'Border colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} allowManual /> },
        borderWidth: { type: 'select' as const, label: 'Border width', options: [{ value: '1px', label: '1px' }, { value: '2px', label: '2px' }, { value: '4px', label: '4px' }] },
        borderRadius: { type: 'select' as const, label: 'Border radius', options: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'Small (4px)' }, { value: 'md', label: 'Medium (8px)' }, { value: 'lg', label: 'Large (16px)' }] },
        opacity: { type: 'select' as const, label: 'Opacity', options: [{ value: '100', label: '100%' }, { value: '90', label: '90%' }, { value: '75', label: '75%' }, { value: '50', label: '50%' }] },
        ...aosFields,
      },
      defaultProps: { bg: { mode: 'none', color: '' }, bgImage: '', bgSize: 'cover', overlayColor: '', overlayOpacity: 0, paddingY: 'lg', maxWidth: 'standard', maxWidthCustom: '', contentAlign: 'top', textColor: '', sticky: 'off', stickyOffset: '0px', boxShadow: 'none', borderStyle: 'none', borderColor: 'var(--color-border)', borderWidth: '1px', borderRadius: 'none', opacity: '100', ...aosDefaults },
      // Only applicable fields survive: the image picker/size belong to the
      // 'image' background (though they stay visible while a legacy block still
      // carries an image under another mode, so a painting value is never
      // invisible-but-active); the overlay scrim needs a background to sit on,
      // and its opacity needs a colour to apply to; border colour/width need a
      // border style; the sticky offset needs sticky on; the custom width needs
      // "Custom…" picked at some breakpoint. Border radius stays either way -
      // it rounds the section's background/image even without a border.
      resolveFields: (data: any, { fields }: any) => {
        const p = data.props ?? {}
        const rest: Record<string, any> = { ...fields }
        const mode = p.bg?.mode ?? 'none'
        if (mode !== 'image' && !p.bgImage) { delete rest.bgImage; delete rest.bgSize }
        else if (!p.bgImage) delete rest.bgSize
        if (mode === 'none' && !p.bgImage) { delete rest.overlayColor; delete rest.overlayOpacity }
        else if (!p.overlayColor) delete rest.overlayOpacity
        if ((p.borderStyle ?? 'none') === 'none') { delete rest.borderColor; delete rest.borderWidth }
        // (sticky's offset trim happens centrally in withResponsiveVisibility)
        const mw = p.maxWidth
        const mwVals = typeof mw === 'string' ? [mw] : [mw?.desktop, mw?.tablet, mw?.mobile]
        if (!mwVals.includes('custom')) delete rest.maxWidthCustom
        return rest
      },
      render: SectionBlock,
    },
    Grid: {
      label: 'Grid',
      fields: {
        columns: { type: 'select' as const, label: 'Columns', options: [{ value: '2', label: '2 columns' }, { value: '3', label: '3 columns' }, { value: '4', label: '4 columns' }] },
        columnSizes: { type: 'custom' as const, label: 'Column widths', options: GRID_COLUMN_SIZE_OPTIONS, render: ResponsiveSelectField },
        verticalAlign: { type: 'custom' as const, label: 'Vertical align', options: [{ value: 'stretch', label: 'Stretch' }, { value: 'start', label: 'Top' }, { value: 'center', label: 'Middle' }, { value: 'end', label: 'Bottom' }], render: ResponsiveSelectField },
        gap: { type: 'custom' as const, label: 'Gap', options: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }], render: ResponsiveSelectField },
        padding: paddingField,
        spaceBelow: { type: 'custom' as const, label: 'Space below', options: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }], render: ResponsiveSelectField },
        col1Align: { type: 'select' as const, label: 'Col 1 align', options: [{ value: 'start', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'end', label: 'Right' }] },
        col2Align: { type: 'select' as const, label: 'Col 2 align', options: [{ value: 'start', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'end', label: 'Right' }] },
        col3Align: { type: 'select' as const, label: 'Col 3 align', options: [{ value: 'start', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'end', label: 'Right' }] },
        col4Align: { type: 'select' as const, label: 'Col 4 align', options: [{ value: 'start', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'end', label: 'Right' }] },
        col1Width: { type: 'custom' as const, label: 'Col 1 width', units: ['px', '%', 'fr', 'rem', 'vw'], render: ResponsiveUnitValueField },
        col2Width: { type: 'custom' as const, label: 'Col 2 width', units: ['px', '%', 'fr', 'rem', 'vw'], render: ResponsiveUnitValueField },
        col3Width: { type: 'custom' as const, label: 'Col 3 width', units: ['px', '%', 'fr', 'rem', 'vw'], render: ResponsiveUnitValueField },
        col4Width: { type: 'custom' as const, label: 'Col 4 width', units: ['px', '%', 'fr', 'rem', 'vw'], render: ResponsiveUnitValueField },
        // Shrunk-state fields - only shown when this Grid sits in a header with
        // "Shrink on scroll" turned on (see resolveFields below). Blank = don't
        // shrink that column/gap. Setting a shrunk width also opts the column
        // into "scale to width" automatically (see GridBlock's colScaled).
        gapShrunk: { type: 'select' as const, label: 'Shrunk gap', options: [{ value: '', label: 'Same as gap' }, { value: 'none', label: 'None' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }] },
        col1WidthShrunk: { type: 'custom' as const, label: 'Col 1 shrunk width', units: ['px', '%', 'fr', 'rem', 'vw'], render: ResponsiveUnitValueField },
        col2WidthShrunk: { type: 'custom' as const, label: 'Col 2 shrunk width', units: ['px', '%', 'fr', 'rem', 'vw'], render: ResponsiveUnitValueField },
        col3WidthShrunk: { type: 'custom' as const, label: 'Col 3 shrunk width', units: ['px', '%', 'fr', 'rem', 'vw'], render: ResponsiveUnitValueField },
        col4WidthShrunk: { type: 'custom' as const, label: 'Col 4 shrunk width', units: ['px', '%', 'fr', 'rem', 'vw'], render: ResponsiveUnitValueField },
        ...aosFields,
        col1: { type: 'slot' as const }, col2: { type: 'slot' as const }, col3: { type: 'slot' as const }, col4: { type: 'slot' as const },
      },
      defaultProps: { columns: '2', gap: 'md', padding: 'none', columnSizes: 'equal', verticalAlign: 'stretch', spaceBelow: 'md', col1Align: 'start', col2Align: 'start', col3Align: 'start', col4Align: 'start', col1Width: '', col2Width: '', col3Width: '', col4Width: '', gapShrunk: '', col1WidthShrunk: '', col2WidthShrunk: '', col3WidthShrunk: '', col4WidthShrunk: '', ...aosDefaults },
      resolveFields: (data: any, { fields, appState }: any) => {
        let result = fields
        if (!isHeaderShrinkEnabled(appState)) {
          const { gapShrunk: _g, col1WidthShrunk: _1, col2WidthShrunk: _2, col3WidthShrunk: _3, col4WidthShrunk: _4, ...rest } = result
          result = rest
        }

        const colCount = parseInt(data.props?.columns ?? '2', 10)
        const sizesProp = data.props?.columnSizes
        const sizesVal = typeof sizesProp === 'string' ? sizesProp : sizesProp?.desktop
        const isManual = sizesVal === 'manual'

        const trimmed: Record<string, unknown> = {}
        for (const [key, field] of Object.entries(result)) {
          // Group 2 absent = the bare col{n} slot field itself (not just Align/
          // Width/WidthShrunk) - without trimming those too, Puck's Outline
          // panel keeps listing a 4th column drop-zone even once columns is
          // set to 3.
          const m = /^col([1-4])(Align|Width|WidthShrunk)?$/.exec(key)
          if (m) {
            if (parseInt(m[1] ?? '0', 10) > colCount) continue // no such column at this count
            // Base width only means anything in Manual mode. Shrunk width is
            // its own independent override (a column can shrink-on-scroll with
            // a preset/equal base width) so it isn't gated by isManual.
            if (m[2] === 'Width' && !isManual) continue
          }
          trimmed[key] = field
        }
        if (trimmed.columnSizes) {
          trimmed.columnSizes = {
            ...(trimmed.columnSizes as object),
            options: colCount === 2 ? GRID_COLUMN_SIZE_OPTIONS : GRID_COLUMN_SIZE_OPTIONS.filter((o) => !TWO_COL_ONLY_SIZE_VALUES.has(o.value)),
          }
        }
        return trimmed
      },
      // Leaving Manual mode hides col*Width but getGridTemplateColumns still lets
      // a non-blank width win over the preset regardless of columnSizes - without
      // this, switching back to "Equal" would silently keep rendering the old
      // manual widths while the field claiming "Equal" is out of view.
      resolveData: (data: any, { changed }: any) => {
        if (!changed.columnSizes) return data
        const sizesProp = data.props?.columnSizes
        const sizesVal = typeof sizesProp === 'string' ? sizesProp : sizesProp?.desktop
        if (sizesVal === 'manual') return data
        const hasWidth = [1, 2, 3, 4].some((n) => {
          const w = data.props?.[`col${n}Width`]
          const v = typeof w === 'string' ? w : (w?.desktop ?? w?.tablet ?? w?.mobile)
          return !!(v && v.trim())
        })
        if (!hasWidth) return data
        return { ...data, props: { ...data.props, col1Width: '', col2Width: '', col3Width: '', col4Width: '' } }
      },
      render: GridBlock,
    },
    Grid2: grid2Component,
    Grid3: grid3Component,
    Grid4: grid4Component,
    Group: {
      label: 'Group',
      fields: {
        columns: { type: 'custom' as const, label: 'Columns (grid)', options: [{ value: 'auto', label: 'Auto (flow)' }, { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }, { value: '5', label: '5' }, { value: '6', label: '6' }], render: ResponsiveSelectField },
        direction: { type: 'custom' as const, label: 'Direction', options: [{ value: 'row', label: 'Row' }, { value: 'column', label: 'Column' }], render: ResponsiveSelectField },
        justify: { type: 'select' as const, label: 'Justify content', options: [{ value: 'start', label: 'Start' }, { value: 'center', label: 'Centre' }, { value: 'end', label: 'End' }, { value: 'between', label: 'Space between' }, { value: 'around', label: 'Space around' }, { value: 'evenly', label: 'Space evenly' }] },
        align: { type: 'custom' as const, label: 'Align items', options: [{ value: 'start', label: 'Start' }, { value: 'center', label: 'Centre' }, { value: 'end', label: 'End' }, { value: 'stretch', label: 'Stretch' }], render: ResponsiveSelectField },
        wrap: { type: 'select' as const, label: 'Wrap', options: [{ value: 'wrap', label: 'Wrap' }, { value: 'nowrap', label: 'No wrap' }] },
        gap: { type: 'custom' as const, label: 'Gap', options: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }], render: ResponsiveSelectField },
        padding: paddingField,
        gapShrunk: { type: 'select' as const, label: 'Shrunk gap', options: [{ value: '', label: 'Same as gap' }, { value: 'none', label: 'None' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }] },
        items: { type: 'slot' as const },
      },
      defaultProps: { columns: 'auto', direction: 'row', justify: 'start', align: 'stretch', wrap: 'wrap', gap: 'md', padding: 'none', gapShrunk: '' },
      resolveFields: (data: any, { fields, appState }: any) => {
        const rest: Record<string, any> = { ...fields }
        if (!isHeaderShrinkEnabled(appState)) delete rest.gapShrunk
        // With a column count set the Group renders as an equal-width grid
        // (GroupBlock's gridMode, gated on the desktop value), so the flex-only
        // knobs - direction, justify, wrap - do nothing and come off the panel.
        const colsProp = data.props?.columns
        const colsDesktop = typeof colsProp === 'string' ? colsProp : colsProp?.desktop
        const n = colsDesktop && colsDesktop !== 'auto' ? parseInt(colsDesktop, 10) : NaN
        if (Number.isFinite(n) && n > 0) { delete rest.direction; delete rest.justify; delete rest.wrap }
        return rest
      },
      render: GroupBlock,
    },
    Split: {
      label: 'Split',
      fields: {
        ratio:   { type: 'select' as const, label: 'Column ratio', options: [{ value: '50/50', label: '50 / 50' }, { value: '60/40', label: '60 / 40' }, { value: '40/60', label: '40 / 60' }, { value: '70/30', label: '70 / 30' }, { value: '30/70', label: '30 / 70' }] },
        align:   { type: 'custom' as const, label: 'Vertical align', options: [{ value: 'stretch', label: 'Stretch' }, { value: 'start', label: 'Top' }, { value: 'center', label: 'Middle' }, { value: 'end', label: 'Bottom' }], render: ResponsiveSelectField },
        gap:     { type: 'custom' as const, label: 'Gap', options: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }], render: ResponsiveSelectField },
        padding: paddingField,
        ...aosFields,
      },
      defaultProps: { ratio: '50/50', align: 'stretch', gap: 'md', padding: 'none', ...aosDefaults },
      render: SplitBlock,
    },
    Spacer: {
      label: 'Space',
      fields: {
        height: { type: 'custom' as const, label: 'Height', options: [{ value: 'xs', label: 'XS (8px)' }, { value: 'sm', label: 'Small (16px)' }, { value: 'md', label: 'Medium (32px)' }, { value: 'lg', label: 'Large (64px)' }, { value: 'xl', label: 'XL (96px)' }, { value: 'custom', label: 'Custom…' }], render: ResponsiveSelectField },
        heightCustom: { type: 'custom' as const, label: 'Custom height', units: ['px', 'rem', 'vh'], render: ResponsiveUnitValueField },
      },
      defaultProps: { height: 'md' as const, heightCustom: '' },
      resolveFields: (data: any, { fields }: any) => {
        const h = data.props?.height
        const vals = typeof h === 'string' ? [h] : [h?.desktop, h?.tablet, h?.mobile]
        if (vals.includes('custom')) return fields
        const { heightCustom: _hc, ...rest } = fields
        return rest
      },
      render: Spacer,
    },
    Divider: {
      label: 'Divider',
      fields: {
        style: { type: 'select' as const, label: 'Line style', options: [{ value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }, { value: 'dotted', label: 'Dotted' }] },
        color: { type: 'custom' as const, label: 'Colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} allowManual /> },
        thickness: { type: 'custom' as const, label: 'Thickness', options: [{ value: 'thin', label: 'Thin' }, { value: 'medium', label: 'Medium' }, { value: 'thick', label: 'Thick' }], render: ResponsiveSelectField },
        ...aosFields,
      },
      defaultProps: { style: 'solid' as const, color: '' as const, thickness: 'thin' as const, ...aosDefaults },
      render: Divider,
    },
    // ── Embed ───────────────────────────────────────────────────────────────
    // Drop a saved Layout (e.g. a shop Category layout) into any page. Picking
    // a layout reveals that layout type's options (module-declared) via
    // resolveFields; the live render happens server-side (LayoutEmbedRsc in
    // config.rsc). Editor shows a placeholder card. Kept in the `embed`
    // category (not a module-layout category) so layouts can't embed layouts.
    LayoutEmbed: {
      label: 'Embed Layout',
      fields: {
        layoutRef: { type: 'custom' as const, label: 'Layout', render: ({ value, onChange }: any) => <LayoutPickerField value={value} onChange={onChange} /> },
      },
      defaultProps: { layoutRef: null },
      resolveFields: (data: any) => {
        const type: string | undefined = data?.props?.layoutRef?.type
        const optionFields: Record<string, unknown> = {}
        for (const opt of type ? moduleEmbedOptions[type] ?? [] : []) {
          if (opt.type === 'number') optionFields[opt.key] = { type: 'number', label: opt.label }
          else if (opt.type === 'select') optionFields[opt.key] = { type: 'select', label: opt.label, options: opt.options ?? [] }
          else optionFields[opt.key] = { type: 'text', label: opt.label }
        }
        return {
          layoutRef: { type: 'custom', label: 'Layout', render: ({ value, onChange }: any) => <LayoutPickerField value={value} onChange={onChange} /> },
          ...optionFields,
        }
      },
      render: ({ layoutRef }: any) => (
        <div style={{ padding: '1.25rem', border: '1px dashed var(--color-border)', borderRadius: 8, background: 'var(--color-bg-subtle)', color: 'var(--color-text-muted)', fontSize: '0.875rem', textAlign: 'center' }}>
          {layoutRef?.name
            ? <>Embedded layout: <strong style={{ color: 'var(--color-text)' }}>{layoutRef.name}</strong> <span style={{ opacity: 0.7 }}>(renders on the live page)</span></>
            : 'Embed Layout - pick a layout in the settings panel on the right.'}
        </div>
      ),
    },

    // ── Typography ───────────────────────────────────────────────────────────
    Heading: {
      label: 'Heading',
      fields: {
        text: { type: 'textarea' as const, label: 'Text (one line per row for stagger reveal)' },
        level: { type: 'select' as const, label: 'Level', options: [{ value: 'display', label: 'Display (hero, largest)' }, { value: 'h2', label: 'H2' }, { value: 'h3', label: 'H3' }, { value: 'h4', label: 'H4' }, { value: 'h5', label: 'H5' }] },
        align: { type: 'custom' as const, label: 'Alignment', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }], render: ResponsiveSelectField },
        fitOneLine: { type: 'select' as const, label: 'Keep on one line (shrink text to fit)', options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }] },
        fontSize: { type: 'custom' as const, label: 'Font size (blank = site style)', units: ['px', 'rem', 'em', 'vw'], render: ResponsiveUnitValueField },
        minHeight: { type: 'custom' as const, label: 'Block height', options: BLOCK_HEIGHT_OPTIONS, render: ResponsiveSelectField },
        verticalAlign: { type: 'custom' as const, label: 'Vertical position', options: [{ value: 'top', label: 'Top' }, { value: 'middle', label: 'Middle' }, { value: 'bottom', label: 'Bottom' }], render: ResponsiveSelectField },
        color: { type: 'custom' as const, label: 'Colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} allowManual /> },
        highlightText: { type: 'text' as const, label: 'Emphasise word/phrase (recolours it in brand)' },
        highlightMark: { type: 'select' as const, label: 'Emphasis mark', options: [{ value: 'underline', label: 'Highlighter underline' }, { value: 'none', label: 'Colour only' }] },
        href: { type: 'text' as const, label: 'Link URL (makes the whole heading clickable)' },
        hoverUnderline: { type: 'select' as const, label: 'Underline on hover (linked headings)', options: [{ value: 'none', label: 'No' }, { value: 'yes', label: 'Yes' }] },
        hoverUnderlineColor: { type: 'custom' as const, label: 'Hover underline colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} allowManual /> },
        padding: paddingField,
        ...STICKY_FIELDS,
        revealAnimation: { type: 'select' as const, label: 'Reveal animation (on load)', options: [{ value: 'none', label: 'None' }, { value: 'stagger-lines', label: 'Stagger lines in' }] },
        ...aosFields,
      },
      defaultProps: { text: 'Section heading', level: 'h2' as const, align: 'left' as const, fitOneLine: 'no' as const, fontSize: '', minHeight: 'none' as const, verticalAlign: 'top' as const, color: '' as const, highlightText: '', highlightMark: 'underline' as const, href: '', hoverUnderline: 'none' as const, hoverUnderlineColor: '', padding: 'default', ...STICKY_DEFAULTS, revealAnimation: 'none' as const, ...aosDefaults },
      // Only applicable fields survive: the vertical position needs a block
      // height (at some breakpoint) to move within; the emphasis mark needs a
      // phrase to emphasise; the hover underline (and colour) needs a link.
      resolveFields: (data: any, { fields: f }: any) => {
        const p = data.props ?? {}
        const rest: Record<string, any> = { ...f }
        const mh = p.minHeight
        const mhVals = typeof mh === 'string' ? [mh] : [mh?.desktop, mh?.tablet, mh?.mobile]
        if (!mhVals.some((v: string | undefined) => v && v !== 'none')) delete rest.verticalAlign
        if (!p.highlightText) delete rest.highlightMark
        if (!p.href) { delete rest.hoverUnderline; delete rest.hoverUnderlineColor }
        else if (p.hoverUnderline !== 'yes') delete rest.hoverUnderlineColor
        return rest
      },
      render: Heading,
    },
    TextBlock: {
      label: 'Text',
      fields: {
        content: { type: 'textarea' as const, label: 'Content' },
        align: { type: 'custom' as const, label: 'Alignment', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }], render: ResponsiveSelectField },
        size: { type: 'custom' as const, label: 'Text size', options: [{ value: 'base', label: 'Base (1rem)' }, { value: 'md', label: 'Lead (1.125rem)' }, { value: 'lg', label: 'Large (1.25rem)' }], render: ResponsiveSelectField },
        maxWidth: { type: 'custom' as const, label: 'Max width', options: [{ value: 'none', label: 'Full width' }, { value: 'prose', label: 'Prose (46ch)' }, { value: 'wide', label: 'Wide (60ch)' }], render: ResponsiveSelectField },
        color: { type: 'custom' as const, label: 'Colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} allowManual /> },
        padding: paddingField,
        ...STICKY_FIELDS,
        ...aosFields,
      },
      defaultProps: { content: 'Enter your text here…', align: 'left' as const, size: 'base' as const, maxWidth: 'none' as const, color: '' as const, padding: 'default', ...STICKY_DEFAULTS, ...aosDefaults },
      render: TextBlock,
    },
    RichTextBlock: {
      label: 'Rich Text',
      fields: {
        content: { type: 'richtext' as const, label: 'Content' },
        textColor: { type: 'custom' as const, label: 'Text colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} allowManual /> },
        padding: paddingField,
        ...STICKY_FIELDS,
        ...aosFields,
      },
      defaultProps: { content: '', textColor: '', padding: 'default', ...STICKY_DEFAULTS, ...aosDefaults },
      render: RichTextBlock,
    },
    Quote: {
      label: 'Quote',
      fields: {
        quote: { type: 'textarea' as const, label: 'Quote' },
        attribution: { type: 'text' as const, label: 'Attribution' },
        mediaUrl: { type: 'text' as const, label: 'Photo URL' },
        alt: { type: 'text' as const, label: 'Photo alt text' },
        imageSize: { type: 'select' as const, label: 'Photo width', options: [{ value: 'sm', label: 'Small (72px)' }, { value: 'md', label: 'Medium (112px)' }, { value: 'lg', label: 'Large (160px)' }] },
        imageHeight: { type: 'number' as const, label: 'Photo height (px, blank = square)' },
        imageShape: { type: 'select' as const, label: 'Photo shape', options: [{ value: 'circle', label: 'Circle' }, { value: 'rounded', label: 'Rounded' }, { value: 'square', label: 'Square' }] },
        padding: paddingField,
        ...STICKY_FIELDS,
        ...aosFields,
      },
      defaultProps: { quote: 'Enter a quote here…', attribution: '', mediaUrl: '', alt: '', imageSize: 'md' as const, imageHeight: 0, imageShape: 'circle' as const, padding: 'default', ...STICKY_DEFAULTS, ...aosDefaults },
      // Photo settings are noise until there's a photo to settle.
      resolveFields: (data: any, { fields }: any) => {
        if (data?.props?.mediaUrl) return fields
        const { alt: _a, imageSize: _s, imageHeight: _h, imageShape: _sh, ...rest } = fields
        return rest
      },
      render: Quote,
    },
    Caption: {
      label: 'Caption',
      fields: {
        text: { type: 'text' as const, label: 'Text' },
        align: { type: 'custom' as const, label: 'Alignment', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }], render: ResponsiveSelectField },
        padding: paddingField,
        ...aosFields,
      },
      defaultProps: { text: 'Caption text', align: 'left' as const, padding: 'default', ...aosDefaults },
      render: Caption,
    },

    // ── Actions ──────────────────────────────────────────────────────────────
    ButtonLink: {
      label: 'Button',
      fields: {
        label: { type: 'text' as const, label: 'Label' }, href: { type: 'text' as const, label: 'URL' },
        variant: { type: 'select' as const, label: 'Style', options: [{ value: 'primary', label: 'Primary' }, { value: 'secondary', label: 'Secondary' }, { value: 'outline', label: 'Outline' }, { value: 'custom', label: 'Custom' }] },
        align: { type: 'custom' as const, label: 'Alignment', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }, { value: 'full', label: 'Full width' }], render: ResponsiveSelectField },
        bgColor: { type: 'custom' as const, label: 'Button colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} allowManual /> },
        textColor: { type: 'custom' as const, label: 'Text colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} allowManual /> },
        hoverBgColor: { type: 'custom' as const, label: 'Hover colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} allowManual /> },
        hoverTextColor: { type: 'custom' as const, label: 'Hover text colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} allowManual /> },
        borderWidth: { type: 'select' as const, label: 'Border', options: BUTTON_BORDER_OPTIONS },
        borderColor: { type: 'custom' as const, label: 'Border colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} allowManual /> },
        padding: paddingField,
        ...STICKY_FIELDS,
        ...aosFields,
      },
      defaultProps: { label: 'Click here', href: '#', variant: 'primary' as const, align: '' as const, bgColor: '', textColor: '', hoverBgColor: '', hoverTextColor: '', borderWidth: 'none' as const, borderColor: '', padding: 'default', ...STICKY_DEFAULTS, ...aosDefaults },
      // Only what's applicable. The three preset variants take their colours and
      // border from the site's Styles → Buttons tokens, so the per-block colour
      // and border fields are dead weight on them - they belong to Custom alone.
      // A border colour, in turn, has nothing to paint until a border width is
      // chosen.
      resolveFields: (data: any, { fields }: any) => {
        const p = data?.props ?? {}
        if (p.variant !== 'custom') {
          const { bgColor: _bg, textColor: _tx, hoverBgColor: _hbg, hoverTextColor: _htx, borderWidth: _bw, borderColor: _bc, ...rest } = fields
          return rest
        }
        if (!p.borderWidth || p.borderWidth === 'none') {
          const { borderColor: _bc, ...rest } = fields
          return rest
        }
        return fields
      },
      render: ButtonLink,
    },
    CTABanner: {
      label: 'CTA Banner',
      fields: {
        heading: { type: 'text' as const, label: 'Heading' }, subtext: { type: 'textarea' as const, label: 'Sub-text' },
        ctaLabel: { type: 'text' as const, label: 'Button label' }, ctaHref: { type: 'text' as const, label: 'Button URL' },
        background: { type: 'select' as const, label: 'Background', options: [{ value: 'light', label: 'Light' }, { value: 'white', label: 'White (bordered)' }, { value: 'brand', label: 'Brand colour' }, { value: 'custom', label: 'Custom colours' }] },
        bgColor: { type: 'custom' as const, label: 'Background colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} allowManual /> },
        textColor: { type: 'custom' as const, label: 'Text colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} allowManual /> },
        padding: paddingField,
        paddingY: { type: 'custom' as const, label: 'Vertical padding (top/bottom)', options: PADDING_Y_OPTIONS, render: ResponsiveSelectField },
        ...STICKY_FIELDS,
        ...aosFields,
      },
      defaultProps: { heading: 'Ready to get started?', subtext: '', ctaLabel: 'Get in touch', ctaHref: '#', background: 'light' as const, bgColor: '', textColor: '', padding: 'none', paddingY: 'none' as const, ...STICKY_DEFAULTS, ...aosDefaults },
      // The three presets carry their own colours, so the per-block colour
      // pickers only appear on Custom.
      resolveFields: (data: any, { fields }: any) => {
        if (data.props?.background === 'custom') return fields
        const { bgColor: _bg, textColor: _tx, ...rest } = fields
        return rest
      },
      render: CTABanner,
    },

    // ── Media ────────────────────────────────────────────────────────────────
    ImageBlock: {
      label: 'Image',
      fields: {
        mediaUrl: { type: 'text' as const, label: 'Image URL' }, mediaId: { type: 'text' as const, label: 'Media ID' }, alt: { type: 'text' as const, label: 'Alt text' }, caption: { type: 'text' as const, label: 'Caption' },
        maxWidth: { type: 'custom' as const, label: 'Max width', units: ['px', '%', 'rem', 'vw'], render: ResponsiveUnitValueField },
        align: { type: 'custom' as const, label: 'Alignment', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }], render: ResponsiveSelectField },
        padding: paddingField, ...STICKY_FIELDS, ...aosFields,
      },
      defaultProps: { mediaUrl: '', mediaId: '', alt: '', caption: '', maxWidth: '', align: 'left', padding: 'default', ...STICKY_DEFAULTS, ...aosDefaults },
      // Until an image is picked, the block is just a placeholder - the text,
      // sizing and alignment settings have nothing to describe. Alignment also
      // needs a max width: a full-width image has nothing to align against.
      resolveFields: (data: any, { fields }: any) => {
        const p = data.props ?? {}
        const rest: Record<string, any> = { ...fields }
        if (!p.mediaUrl) {
          for (const k of ['alt', 'caption', 'maxWidth', 'align', 'sticky', 'stickyOffset', 'animationType', 'animationDuration', 'animationDelay']) delete rest[k]
          return rest
        }
        const mw = p.maxWidth
        const hasMw = typeof mw === 'string' ? !!mw.trim() : !!(mw?.desktop || mw?.tablet || mw?.mobile)
        if (!hasMw) delete rest.align
        return rest
      },
      render: ImageBlock,
    },
    VideoEmbed: {
      label: 'Video',
      fields: { url: { type: 'text' as const, label: 'Video URL (YouTube / Vimeo)' }, title: { type: 'text' as const, label: 'Title (accessibility)' }, aspectRatio: { type: 'custom' as const, label: 'Aspect ratio', options: [{ value: '16:9', label: '16:9' }, { value: '4:3', label: '4:3' }, { value: '1:1', label: 'Square' }], render: ResponsiveSelectField }, padding: paddingField, ...STICKY_FIELDS, ...aosFields },
      defaultProps: { url: '', title: '', aspectRatio: '16:9' as const, padding: 'default', ...STICKY_DEFAULTS, ...aosDefaults },
      // Everything else describes a video; without a URL there isn't one.
      resolveFields: (data: any, { fields }: any) => {
        if (data.props?.url) return fields
        const { title: _t, aspectRatio: _ar, sticky: _s, stickyOffset: _so, animationType: _at, animationDuration: _ad, animationDelay: _adl, ...rest } = fields
        return rest
      },
      render: VideoEmbed,
    },
    Embed: {
      label: 'Embed',
      fields: { src: { type: 'text' as const, label: 'URL to embed' }, height: { type: 'custom' as const, label: 'Height', units: ['px', 'vh', 'rem'], render: ResponsiveUnitValueField }, title: { type: 'text' as const, label: 'Title (accessibility)' }, padding: paddingField, ...STICKY_FIELDS, ...aosFields },
      defaultProps: { src: '', height: '400px', title: '', padding: 'default', ...STICKY_DEFAULTS, ...aosDefaults },
      // Everything else describes the embedded frame; no URL, no frame.
      resolveFields: (data: any, { fields }: any) => {
        if (data.props?.src) return fields
        const { height: _h, title: _t, sticky: _s, stickyOffset: _so, animationType: _at, animationDuration: _ad, animationDelay: _adl, ...rest } = fields
        return rest
      },
      render: Embed,
    },

    // ── Content ──────────────────────────────────────────────────────────────
    Hero: {
      label: 'Hero',
      fields: {
        heading: { type: 'text' as const, label: 'Heading' }, subheading: { type: 'textarea' as const, label: 'Sub-heading' },
        ctaLabel: { type: 'text' as const, label: 'Primary CTA label' }, ctaHref: { type: 'text' as const, label: 'Primary CTA URL' },
        cta2Label: { type: 'text' as const, label: 'Second CTA label' }, cta2Href: { type: 'text' as const, label: 'Second CTA URL' },
        cta2Variant: { type: 'select' as const, label: 'Second CTA style', options: [{ value: 'outline', label: 'Outline' }, { value: 'solid', label: 'Solid' }] },
        bg: { type: 'custom' as const, label: 'Background', render: HeroBgColorField }, bgImage: { type: 'text' as const, label: 'Background image URL' },
        overlayColor: { type: 'custom' as const, label: 'Overlay colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} /> }, overlayOpacity: { type: 'number' as const, label: 'Overlay opacity (0–100)', min: 0, max: 100 },
        layout: { type: 'custom' as const, label: 'Layout', options: [{ value: 'centered', label: 'Centred text' }, { value: 'left', label: 'Left-aligned text' }, { value: 'right-image', label: 'Text + image (right)' }], render: ResponsiveSelectField },
        imageUrl: { type: 'text' as const, label: 'Side image URL (right-image layout)' },
        textScheme: { type: 'select' as const, label: 'Text colour', options: [{ value: 'dark', label: 'Dark (for light backgrounds)' }, { value: 'light', label: 'Light (for dark backgrounds)' }] },
        minHeight: { type: 'custom' as const, label: 'Min height', options: [{ value: 'auto', label: 'Auto' }, { value: 'half', label: '50vh' }, { value: 'full', label: 'Full screen (100vh)' }], render: ResponsiveSelectField },
        padding: paddingField, ...aosFields,
      },
      defaultProps: { heading: 'Welcome', subheading: '', ctaLabel: '', ctaHref: '', cta2Label: '', cta2Href: '', cta2Variant: 'outline', bg: { mode: 'gradient', color: '' }, bgImage: '', overlayColor: '', overlayOpacity: 0, layout: 'centered', imageUrl: '', textScheme: 'dark', minHeight: 'auto', padding: 'none', ...aosDefaults },
      // Only applicable fields survive: the background image belongs to the
      // 'image' background (but stays visible while a legacy block still
      // carries one under another mode); overlay opacity needs an overlay
      // colour; the side image needs a right-image layout at some breakpoint;
      // the second CTA's style needs a second CTA.
      resolveFields: (data: any, { fields }: any) => {
        const p = data.props ?? {}
        const rest: Record<string, any> = { ...fields }
        const mode = p.bg?.mode ?? 'gradient'
        if (mode !== 'image' && !p.bgImage) delete rest.bgImage
        if (!p.overlayColor) delete rest.overlayOpacity
        const l = p.layout
        const layouts = typeof l === 'string' ? [l] : [l?.desktop, l?.tablet, l?.mobile]
        if (!layouts.includes('right-image')) delete rest.imageUrl
        if (!p.cta2Label) delete rest.cta2Variant
        return rest
      },
      render: Hero,
    },
    Card: {
      label: 'Card',
      fields: { mediaUrl: { type: 'text' as const, label: 'Image URL' }, mediaId: { type: 'text' as const, label: 'Media ID' }, alt: { type: 'text' as const, label: 'Alt text' }, heading: { type: 'text' as const, label: 'Heading' }, body: { type: 'textarea' as const, label: 'Body text' }, ctaLabel: { type: 'text' as const, label: 'Button label' }, ctaHref: { type: 'text' as const, label: 'Button URL' }, minHeight: { type: 'custom' as const, label: 'Card height', options: BLOCK_HEIGHT_OPTIONS, render: ResponsiveSelectField }, padding: paddingField, ...STICKY_FIELDS, ...aosFields },
      defaultProps: { mediaUrl: '', mediaId: '', alt: '', heading: 'Card heading', body: '', ctaLabel: '', ctaHref: '', minHeight: 'none' as const, padding: 'none', ...STICKY_DEFAULTS, ...aosDefaults },
      render: Card,
    },
    ImageChipPanel: {
      label: 'Image + Floating Chips',
      fields: {
        mediaUrl: { type: 'text' as const, label: 'Image URL' },
        alt: { type: 'text' as const, label: 'Alt text' },
        chips: {
          type: 'array' as const, label: 'Chips',
          getItemSummary: (item: { label?: string }) => item.label || 'Chip',
          arrayFields: {
            label: { type: 'text' as const, label: 'Label (bold line)' },
            value: { type: 'text' as const, label: 'Value / detail text' },
            position: { type: 'select' as const, label: 'Position', options: [{ value: 'top-left', label: 'Top left' }, { value: 'top-right', label: 'Top right' }, { value: 'bottom-left', label: 'Bottom left' }, { value: 'bottom-right', label: 'Bottom right' }, { value: 'bottom-center', label: 'Bottom centre' }] },
            animationType: { type: 'select' as const, label: 'Reveal', options: [{ value: 'none', label: 'None' }, { value: 'fade-in', label: 'Fade in' }] },
            animationDelay: { type: 'select' as const, label: 'Delay', options: [{ value: 'none', label: 'None' }, { value: '200ms', label: '200ms' }, { value: '400ms', label: '400ms' }, { value: '600ms', label: '600ms' }] },
          },
          defaultItemProps: { label: 'Label', value: 'Detail text', position: 'top-right', animationType: 'none', animationDelay: 'none' },
        },
        boxShadow: { type: 'select' as const, label: 'Box shadow', options: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }] },
        borderStyle: { type: 'select' as const, label: 'Border', options: [{ value: 'none', label: 'None' }, { value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }] },
        borderColor: { type: 'custom' as const, label: 'Border colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} allowManual /> },
        borderWidth: { type: 'select' as const, label: 'Border width', options: [{ value: '1px', label: '1px' }, { value: '2px', label: '2px' }, { value: '4px', label: '4px' }] },
        borderRadius: { type: 'select' as const, label: 'Border radius', options: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'Small (4px)' }, { value: 'md', label: 'Medium (8px)' }, { value: 'lg', label: 'Large (16px)' }] },
        framePadding: { type: 'select' as const, label: 'Frame padding (blueprint gutter)', options: [{ value: 'none', label: 'None (image fills panel)' }, { value: 'sm', label: 'Small (16px)' }, { value: 'md', label: 'Medium (30px)' }, { value: 'lg', label: 'Large (44px)' }] },
        frameBg: { type: 'select' as const, label: 'Panel background', options: [{ value: 'none', label: 'None' }, { value: 'subtle', label: 'Subtle fill' }, { value: 'gradient', label: 'Gradient' }] },
        gridPattern: { type: 'select' as const, label: 'Blueprint grid', options: [{ value: 'none', label: 'Off' }, { value: 'subtle', label: 'On' }] },
        scanEffect: { type: 'select' as const, label: 'Scan sheen (animated)', options: [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }] },
        padding: paddingField,
        ...STICKY_FIELDS,
        ...aosFields,
      },
      defaultProps: {
        mediaUrl: '', alt: '',
        chips: [{ label: 'Label', value: 'Detail text', position: 'top-right' as const, animationType: 'none' as const, animationDelay: 'none' as const }],
        boxShadow: 'md' as const, borderStyle: 'solid' as const, borderColor: 'var(--color-border)', borderWidth: '1px' as const, borderRadius: 'lg' as const,
        framePadding: 'none' as const, frameBg: 'none' as const, gridPattern: 'none' as const, scanEffect: 'off' as const,
        padding: 'none', ...STICKY_DEFAULTS, ...aosDefaults,
      },
      // Until an image is picked the panel is just a placeholder, so only the
      // picker (and padding) show. Border colour/width need a border style;
      // the panel background only shows through a frame gutter.
      resolveFields: (data: any, { fields }: any) => {
        const p = data.props ?? {}
        const rest: Record<string, any> = { ...fields }
        if (!p.mediaUrl) {
          for (const k of Object.keys(rest)) {
            if (k !== 'mediaUrl' && k !== 'padding' && k !== 'visibility') delete rest[k]
          }
          return rest
        }
        if ((p.borderStyle ?? 'none') === 'none') { delete rest.borderColor; delete rest.borderWidth }
        if ((p.framePadding ?? 'none') === 'none') delete rest.frameBg
        return rest
      },
      render: ImageChipPanel,
    },
    Callout: {
      label: 'Callout',
      fields: { type: { type: 'select' as const, label: 'Type', options: [{ value: 'info', label: 'Info' }, { value: 'success', label: 'Success' }, { value: 'warning', label: 'Warning' }, { value: 'error', label: 'Error' }] }, title: { type: 'text' as const, label: 'Title' }, body: { type: 'textarea' as const, label: 'Body' }, padding: paddingField, ...STICKY_FIELDS, ...aosFields },
      defaultProps: { type: 'info' as const, title: '', body: 'Notice text here…', padding: 'none', ...STICKY_DEFAULTS, ...aosDefaults },
      render: Callout,
    },
    Badge: {
      label: 'Badge',
      fields: { label: { type: 'text' as const, label: 'Label' }, color: { type: 'select' as const, label: 'Colour', options: [{ value: 'primary', label: 'Brand' }, { value: 'blue', label: 'Blue' }, { value: 'yellow', label: 'Yellow' }, { value: 'red', label: 'Red' }, { value: 'gray', label: 'Gray' }] }, padding: paddingField, ...aosFields },
      defaultProps: { label: 'New', color: 'primary' as const, padding: 'default', ...aosDefaults },
      render: Badge,
    },
    Eyebrow: {
      label: 'Eyebrow',
      fields: {
        text: { type: 'text' as const, label: 'Text' },
        showPulse: { type: 'select' as const, label: 'Pulsing dot', options: [{ value: 'false', label: 'No' }, { value: 'true', label: 'Yes' }] },
        padding: paddingField,
        ...aosFields,
      },
      defaultProps: { text: 'New', showPulse: 'false', padding: 'default', ...aosDefaults },
      render: Eyebrow,
    },
    Trustline: {
      label: 'Trust Row',
      fields: {
        items: { type: 'array' as const, label: 'Items', getItemSummary: (item: { text?: string }) => item.text || 'Item', arrayFields: { icon: { type: 'select' as const, label: 'Icon', options: [{ value: 'check', label: 'Checkmark' }, { value: 'truck', label: 'Delivery' }, { value: 'shield', label: 'Shield' }, { value: 'clock', label: 'Clock' }, { value: 'star', label: 'Star' }, { value: 'tag', label: 'Price tag' }] }, text: { type: 'text' as const, label: 'Text' } }, defaultItemProps: { icon: 'check', text: 'Reassurance point' } },
        gap: { type: 'custom' as const, label: 'Gap', options: [{ value: 'tight', label: 'Tight' }, { value: 'normal', label: 'Normal' }, { value: 'wide', label: 'Wide' }], render: ResponsiveSelectField },
        padding: paddingField,
        ...aosFields,
      },
      defaultProps: { items: [{ icon: 'check', text: 'Reassurance point' }], gap: 'normal' as const, padding: 'default', ...aosDefaults },
      render: Trustline,
    },
    Chip: {
      label: 'Chip',
      fields: {
        label: { type: 'text' as const, label: 'Label (bold line)' },
        value: { type: 'text' as const, label: 'Value / detail text' },
        position: { type: 'select' as const, label: 'Position', options: [{ value: 'static', label: 'In flow (stacked)' }, { value: 'top-left', label: 'Float: top left' }, { value: 'top-right', label: 'Float: top right' }, { value: 'bottom-left', label: 'Float: bottom left' }, { value: 'bottom-right', label: 'Float: bottom right' }, { value: 'bottom-center', label: 'Float: bottom centre' }] },
        ...aosFields,
      },
      defaultProps: { label: 'Label', value: 'Detail text', position: 'static' as const, ...aosDefaults },
      render: Chip,
    },
    Accordion: {
      label: 'Accordion',
      fields: { items: { type: 'array' as const, label: 'Items', getItemSummary: (item: { question?: string }) => item.question || 'Question', arrayFields: { question: { type: 'text' as const, label: 'Question' }, answer: { type: 'textarea' as const, label: 'Answer' } }, defaultItemProps: { question: 'What is the question?', answer: 'This is the answer.' } }, padding: paddingField, ...aosFields },
      defaultProps: { items: [{ question: 'What is the question?', answer: 'This is the answer.' }], padding: 'default', ...aosDefaults },
      render: Accordion,
    },
    FeatureList: {
      label: 'Feature List',
      fields: {
        iconStyle: { type: 'select' as const, label: 'Icon style', options: [{ value: 'emoji', label: 'Emoji' }, { value: 'glyph', label: 'Teal glyph square' }] },
        items: { type: 'array' as const, label: 'Features', getItemSummary: (item: { title?: string }) => item.title || 'Feature', arrayFields: { emoji: { type: 'text' as const, label: 'Emoji (emoji style)' }, icon: { type: 'select' as const, label: 'Icon (glyph style)', options: [{ value: 'share', label: 'Share' }, { value: 'tag', label: 'Price tag' }, { value: 'compass', label: 'Compass' }, { value: 'check', label: 'Checkmark' }, { value: 'shield', label: 'Shield' }, { value: 'clock', label: 'Clock' }, { value: 'star', label: 'Star' }, { value: 'truck', label: 'Delivery' }] }, title: { type: 'text' as const, label: 'Title' }, description: { type: 'textarea' as const, label: 'Description' } }, defaultItemProps: { emoji: '✨', icon: 'check', title: 'Feature title', description: 'Describe this feature here.' } },
        padding: paddingField, ...aosFields,
      },
      defaultProps: { iconStyle: 'emoji' as const, items: [{ emoji: '✨', icon: 'check', title: 'Feature one', description: 'Describe this feature.' }, { emoji: '🚀', icon: 'star', title: 'Feature two', description: 'Describe this feature.' }], padding: 'default', ...aosDefaults },
      render: FeatureList,
    },
    SpecPanel: {
      label: 'Spec Panel',
      fields: {
        title: { type: 'text' as const, label: 'Panel title' },
        rows: {
          type: 'array' as const, label: 'Rows',
          getItemSummary: (item: { label?: string }) => item.label || 'Row',
          arrayFields: {
            label: { type: 'text' as const, label: 'Label' },
            value: { type: 'text' as const, label: 'Value' },
            highlight: { type: 'select' as const, label: 'Emphasise value', options: [{ value: '', label: 'No' }, { value: 'true', label: 'Yes (brand, bold)' }] },
            badge: { type: 'text' as const, label: 'Badge (green pill, optional)' },
          },
          defaultItemProps: { label: 'Label', value: 'Value', highlight: '', badge: '' },
        },
        boxShadow: { type: 'select' as const, label: 'Box shadow', options: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }] },
        borderRadius: { type: 'select' as const, label: 'Border radius', options: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'Small (4px)' }, { value: 'md', label: 'Medium (8px)' }, { value: 'lg', label: 'Large (16px)' }] },
        padding: paddingField,
        ...STICKY_FIELDS,
        ...aosFields,
      },
      defaultProps: {
        title: 'Product record',
        rows: [
          { label: 'Price', value: '£249.00', highlight: 'true', badge: '✓ same for every buyer' },
          { label: 'Lead time', value: '3 to 5 working days', highlight: '', badge: '' },
        ],
        boxShadow: 'md' as const, borderRadius: 'lg' as const, padding: 'none', ...STICKY_DEFAULTS, ...aosDefaults,
      },
      render: SpecPanel,
    },
    Ticker: {
      label: 'Ticker',
      fields: {
        items: { type: 'array' as const, label: 'Phrases', getItemSummary: (item: { text?: string }) => item.text || 'Phrase', arrayFields: { text: { type: 'text' as const, label: 'Text' } }, defaultItemProps: { text: 'A short phrase' } },
        speed: { type: 'select' as const, label: 'Speed', options: [{ value: 'slow', label: 'Slow' }, { value: 'normal', label: 'Normal' }, { value: 'fast', label: 'Fast' }] },
        ...aosFields,
      },
      defaultProps: { items: [{ text: 'One price for all' }, { text: 'Every answer on the page' }, { text: 'Direct from supplier to door' }], speed: 'normal' as const, ...aosDefaults },
      render: Ticker,
    },
    Stats: {
      label: 'Stats',
      fields: { items: { type: 'array' as const, label: 'Stats', getItemSummary: (item: { value?: string; label?: string }) => item.value ? `${item.value} — ${item.label}` : 'Stat', arrayFields: { value: { type: 'text' as const, label: 'Value' }, label: { type: 'text' as const, label: 'Label' } }, defaultItemProps: { value: '100%', label: 'Satisfaction' } }, padding: paddingField, ...aosFields },
      defaultProps: { items: [{ value: '10k+', label: 'Customers' }, { value: '99%', label: 'Uptime' }, { value: '24/7', label: 'Support' }], padding: 'default', ...aosDefaults },
      render: Stats,
    },
    Logos: {
      label: 'Logos',
      fields: { items: { type: 'array' as const, label: 'Logos', getItemSummary: (item: { alt?: string }) => item.alt || 'Logo', arrayFields: { logoUrl: { type: 'text' as const, label: 'Logo URL' }, alt: { type: 'text' as const, label: 'Alt text' }, href: { type: 'text' as const, label: 'Link URL' } }, defaultItemProps: { logoUrl: '', alt: 'Company name', href: '' } }, logoHeight: { type: 'custom' as const, label: 'Logo height', options: [{ value: 'sm', label: 'Small (32px)' }, { value: 'md', label: 'Medium (48px)' }, { value: 'lg', label: 'Large (64px)' }], render: ResponsiveSelectField }, justify: { type: 'custom' as const, label: 'Alignment', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }], render: ResponsiveSelectField }, padding: paddingField, ...aosFields },
      defaultProps: { items: [{ logoUrl: '', alt: 'Partner logo', href: '' }], logoHeight: 'md' as const, justify: 'center' as const, padding: 'default', ...aosDefaults },
      render: Logos,
    },
    SocialLinks: {
      label: 'Social Links',
      fields: {
        items: { type: 'array' as const, label: 'Links', getItemSummary: (item: { platform?: string }) => item.platform || 'Link', arrayFields: { platform: { type: 'select' as const, label: 'Platform', options: [{ value: 'twitter-x', label: 'Twitter / X' }, { value: 'instagram', label: 'Instagram' }, { value: 'facebook', label: 'Facebook' }, { value: 'linkedin', label: 'LinkedIn' }, { value: 'youtube', label: 'YouTube' }, { value: 'github', label: 'GitHub' }, { value: 'tiktok', label: 'TikTok' }] }, url: { type: 'text' as const, label: 'URL' } }, defaultItemProps: { platform: 'twitter-x', url: '' } },
        iconSize: { type: 'custom' as const, label: 'Icon size', options: [{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }], render: ResponsiveSelectField },
        iconColor: { type: 'custom' as const, label: 'Icon colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} allowManual /> },
        layout: { type: 'custom' as const, label: 'Layout', options: [{ value: 'row', label: 'Row' }, { value: 'column', label: 'Column' }], render: ResponsiveSelectField },
        gap: { type: 'custom' as const, label: 'Gap', options: [{ value: 'tight', label: 'Tight' }, { value: 'normal', label: 'Normal' }, { value: 'wide', label: 'Wide' }], render: ResponsiveSelectField },
        padding: paddingField,
        ...STICKY_FIELDS,
        ...aosFields,
      },
      defaultProps: { items: [{ platform: 'twitter-x', url: '' }], iconSize: 'md', iconColor: '', layout: 'row', gap: 'normal', padding: 'default', ...STICKY_DEFAULTS, ...aosDefaults },
      render: SocialLinks,
    },

    // ── Site ─────────────────────────────────────────────────────────────────
    SiteLogo: {
      label: 'Site Logo',
      // "Element height" / "Element height when shrunk" (keys cellHeight/
      // cellHeightShrunk) are deliberately worded apart from the header root's
      // own "Height" / "Shrunk height" so the two never read as duplicate
      // labels in the same sidebar. The render still falls back to the old
      // logoHeight/logoHeightShrunk keys for pre-rename saved data.
      fields: { homeUrl: { type: 'text' as const, label: 'Link URL (default: /)' }, align: { type: 'custom' as const, label: 'Alignment', options: LOGO_ALIGN_OPTIONS, render: ResponsiveSelectField }, cellHeight: { type: 'custom' as const, label: 'Element height (px)', render: ResponsiveNumberField }, cellHeightShrunk: { type: 'custom' as const, label: 'Element height when shrunk', render: ClearableNumberField }, showTextWithLogo: { type: 'select' as const, label: 'Show site name with image', options: [{ value: 'false', label: 'Image only' }, { value: 'true', label: 'Image + name' }] }, showIcon: { type: 'select' as const, label: 'Show cactus icon (text logo)', options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] }, textColor: { type: 'custom' as const, label: 'Text colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} allowManual /> } },
      // No cellHeight default here on purpose: SiteLogoClient/SiteLogoRsc's own
      // `cellHeight ?? logoHeight ?? 40` fallback is the single source of
      // truth for the default. Puck backfills any missing prop from
      // defaultProps at render time - if this declared cellHeight:40, that
      // backfilled 40 would win over a pre-rename block's logoHeight (e.g.
      // the starter header presets, which only ever set logoHeight) since 40
      // isn't nullish, silently shadowing the value the block actually has.
      // align defaults to 'left', which resolves to the flex-start the logo's <a>
      // already used - so backfilling it into blocks saved before the field
      // existed changes nothing (unlike cellHeight above, it has no legacy key
      // to shadow).
      defaultProps: { homeUrl: '/', align: 'left' as const, showTextWithLogo: 'false', showIcon: 'true', textColor: '' },
      resolveFields: (_data: any, { fields, appState }: any) => {
        if (isHeaderShrinkEnabled(appState)) return fields
        const { cellHeightShrunk: _s, ...rest } = fields
        return rest
      },
      render: SiteLogoClient,
    },
    Copyright: {
      label: 'Copyright',
      fields: {
        prefix: { type: 'select' as const, label: 'Copyright symbol', options: [{ value: '©', label: '©' }, { value: 'Copyright', label: 'Copyright (word)' }, { value: 'none', label: 'None' }, { value: 'custom', label: 'Custom…' }] },
        customPrefix: { type: 'text' as const, label: 'Custom prefix' }, yearFormat: { type: 'select' as const, label: 'Year', options: [{ value: 'current', label: 'Current year' }, { value: 'range', label: 'Year range' }, { value: 'none', label: 'No year' }] },
        startYear: { type: 'number' as const, label: 'Range start year' }, showSiteName: { type: 'select' as const, label: 'Show site name', options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] },
        suffix: { type: 'text' as const, label: 'Suffix text' }, alignment: { type: 'custom' as const, label: 'Alignment', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }], render: ResponsiveSelectField },
        fontSize: { type: 'custom' as const, label: 'Font size', options: [{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }], render: ResponsiveSelectField },
        textColor: { type: 'custom' as const, label: 'Text colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} allowManual /> },
        privacyPolicyUrl: { type: 'text' as const, label: 'Privacy Policy URL' }, privacyPolicyLabel: { type: 'text' as const, label: 'Privacy Policy label' },
        termsUrl: { type: 'text' as const, label: 'Terms URL' }, termsLabel: { type: 'text' as const, label: 'Terms label' },
        customLink1Url: { type: 'text' as const, label: 'Extra link 1 URL' }, customLink1Label: { type: 'text' as const, label: 'Extra link 1 label' },
        customLink2Url: { type: 'text' as const, label: 'Extra link 2 URL' }, customLink2Label: { type: 'text' as const, label: 'Extra link 2 label' },
      },
      defaultProps: { prefix: '©', customPrefix: '', yearFormat: 'current', startYear: new Date().getFullYear(), showSiteName: 'true', suffix: '', alignment: 'left', fontSize: 'small', textColor: 'var(--color-muted)', privacyPolicyUrl: '', privacyPolicyLabel: 'Privacy Policy', termsUrl: '', termsLabel: 'Terms of Service', customLink1Url: '', customLink1Label: '', customLink2Url: '', customLink2Label: '' },
      // The custom prefix needs "Custom…" picked; the start year needs the
      // range format; each link label needs its link to actually exist.
      resolveFields: (data: any, { fields }: any) => {
        const p = data.props ?? {}
        const rest: Record<string, any> = { ...fields }
        if (p.prefix !== 'custom') delete rest.customPrefix
        if (p.yearFormat !== 'range') delete rest.startYear
        if (!p.privacyPolicyUrl) delete rest.privacyPolicyLabel
        if (!p.termsUrl) delete rest.termsLabel
        if (!p.customLink1Url) delete rest.customLink1Label
        if (!p.customLink2Url) delete rest.customLink2Label
        return rest
      },
      render: Copyright,
    },
    MenuBlock: {
      label: 'Menu',
      fields: {
        menuId: { type: 'text' as const, label: 'Menu ID' }, menuName: { type: 'text' as const, label: 'Menu name (display)' },
        orientation: { type: 'select' as const, label: 'Orientation', options: [{ value: 'horizontal', label: 'Horizontal' }, { value: 'vertical', label: 'Vertical' }] },
        spacing: { type: 'custom' as const, label: 'Item spacing', options: [{ value: 'tight', label: 'Tight' }, { value: 'normal', label: 'Normal' }, { value: 'wide', label: 'Wide' }], render: ResponsiveSelectField },
        alignment: { type: 'custom' as const, label: 'Horizontal alignment', options: [{ value: 'flex-start', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'space-between', label: 'Space between' }, { value: 'space-around', label: 'Space around' }], render: ResponsiveSelectField },
        scale: { type: 'custom' as const, label: 'Scale (%, 100 = normal)', render: ResponsiveNumberField },
        fitOneLine: { type: 'select' as const, label: 'Keep on one line (shrink items to fit)', options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }] },
        itemFontSize: { type: 'custom' as const, label: 'Font size', options: [{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }], render: ResponsiveSelectField },
        itemFontWeight: { type: 'custom' as const, label: 'Font weight', options: [{ value: 'normal', label: 'Normal' }, { value: 'medium', label: 'Medium' }, { value: 'semibold', label: 'Semibold' }, { value: 'bold', label: 'Bold' }], render: ResponsiveSelectField },
        textTransform: { type: 'custom' as const, label: 'Text transform', options: [{ value: 'none', label: 'None' }, { value: 'uppercase', label: 'UPPERCASE' }, { value: 'capitalize', label: 'Capitalize' }, { value: 'lowercase', label: 'lowercase' }], render: ResponsiveSelectField },
        itemFontFamily: { type: 'custom' as const, label: 'Font', render: ({ value, onChange }: any) => <SiteFontField value={value} onChange={onChange} /> },
        itemColor: { type: 'custom' as const, label: 'Link colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} /> },
        hoverColor: { type: 'custom' as const, label: 'Hover colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} /> },
        hoverBackground: { type: 'custom' as const, label: 'Hover background', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} /> },
        activeColor: { type: 'custom' as const, label: 'Active item colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} /> },
        activeFontWeight: { type: 'select' as const, label: 'Active font weight', options: [{ value: '', label: 'Same as items' }, { value: 'normal', label: 'Normal' }, { value: 'medium', label: 'Medium' }, { value: 'semibold', label: 'Semibold' }, { value: 'bold', label: 'Bold' }] },
        activeUnderline: { type: 'select' as const, label: 'Underline active item', options: [{ value: 'none', label: 'No' }, { value: 'underline', label: 'Yes' }] },
        activeUnderlineColor: { type: 'custom' as const, label: 'Active underline colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} /> },
        activeUnderlineThickness: { type: 'custom' as const, label: 'Underline thickness', units: ['px', 'em'], render: UnitValueField },
        activeUnderlineOffset: { type: 'custom' as const, label: 'Underline offset', units: ['px', 'em'], render: UnitValueField },
        showDropdowns: { type: 'select' as const, label: 'Dropdowns open on', options: [{ value: 'hover', label: 'Hover' }, { value: 'click', label: 'Click' }] },
        navToggle: { type: 'custom' as const, label: 'Nav behaviour', options: [{ value: 'collapse', label: 'Collapse to hamburger' }, { value: 'dropdown', label: 'Dropdown (current page)' }, { value: 'show', label: 'Always show' }], render: ResponsiveSelectField },
        dropdownAlign: { type: 'select' as const, label: 'Dropdown alignment (hamburger + dropdown)', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }] },
        spacingShrunk: { type: 'select' as const, label: 'Shrunk item spacing', options: [{ value: '', label: 'Same as spacing' }, { value: 'tight', label: 'Tight' }, { value: 'normal', label: 'Normal' }, { value: 'wide', label: 'Wide' }] },
        itemFontSizeShrunk: { type: 'select' as const, label: 'Shrunk font size', options: [{ value: '', label: 'Same as font size' }, { value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }] },
        itemFontWeightShrunk: { type: 'select' as const, label: 'Shrunk font weight', options: [{ value: '', label: 'Same as font weight' }, { value: 'normal', label: 'Normal' }, { value: 'medium', label: 'Medium' }, { value: 'semibold', label: 'Semibold' }, { value: 'bold', label: 'Bold' }] },
        itemSpacingFluid: { type: 'custom' as const, label: 'Responsive item spacing (rem)', minLabel: 'Min spacing', maxLabel: 'Max spacing', render: MinMaxPairField },
        letterSpacingFluid: { type: 'custom' as const, label: 'Responsive character spacing (em)', minLabel: 'Min spacing', maxLabel: 'Max spacing', render: MinMaxPairField },
        itemFontSizeFluid: { type: 'custom' as const, label: 'Responsive font size (rem)', minLabel: 'Min size', maxLabel: 'Max size', render: MinMaxPairField },
      },
      defaultProps: { menuId: '', menuName: '', orientation: 'horizontal' as const, spacing: { desktop: 'normal' }, alignment: { desktop: 'flex-start' }, scale: { desktop: 100 }, itemFontSize: { desktop: 'medium' }, itemFontWeight: { desktop: 'medium' }, textTransform: { desktop: 'none' }, itemFontFamily: '', itemColor: '', hoverColor: '', hoverBackground: '', activeColor: '', activeFontWeight: '', activeUnderline: 'none' as const, activeUnderlineColor: '', activeUnderlineThickness: '', activeUnderlineOffset: '', showDropdowns: 'hover', navToggle: { desktop: 'show', tablet: 'collapse', mobile: 'collapse' }, dropdownAlign: 'left' as const, fitOneLine: 'no' as const, spacingShrunk: '', itemFontSizeShrunk: '', itemFontWeightShrunk: '', itemSpacingFluid: { min: '', max: '' }, letterSpacingFluid: { min: '', max: '' }, itemFontSizeFluid: { min: '', max: '' } },
      resolveFields: (data: any, { fields, appState }: any) => {
        const p = data?.props ?? {}
        const out: Record<string, any> = { ...fields }
        if (p.activeUnderline !== 'underline') {
          delete out.activeUnderlineColor; delete out.activeUnderlineThickness; delete out.activeUnderlineOffset
        }
        // A vertical menu is a plain stacked list: no hamburger/dropdown
        // behaviour, no horizontal alignment, nothing to fit on one line.
        if (p.orientation === 'vertical') {
          delete out.alignment; delete out.navToggle; delete out.dropdownAlign
          delete out.showDropdowns; delete out.fitOneLine
        }
        if (!isHeaderShrinkEnabled(appState)) {
          delete out.spacingShrunk; delete out.itemFontSizeShrunk; delete out.itemFontWeightShrunk
        }
        return out
      },
      render: MenuBlock,
    },
    LoginButton: {
      label: 'Login Button',
      fields: { loginLabel: { type: 'text' as const, label: 'Login label' }, registerLabel: { type: 'text' as const, label: 'Register label' } },
      defaultProps: { loginLabel: 'Sign in', registerLabel: 'Register' },
      render: LoginButton,
    },
    // ── Members (MEMBERS_SPEC.md Phase 7) ──────────────────────────────────────
    // Editor renders here; the live site swaps in the RSC versions from
    // MembersBlocksRsc.tsx — see lib/puck/config.rsc.tsx.
    MembersLogin: {
      label: 'Members: Login',
      fields: { redirectTo: { type: 'text' as const, label: 'Redirect after sign-in' } },
      defaultProps: { redirectTo: '/' },
      render: MembersLoginBlock,
    },
    MembersRegister: {
      label: 'Members: Register',
      fields: {},
      defaultProps: {},
      render: MembersRegisterBlock,
    },
    MembersAccountLink: {
      label: 'Members: Account Link',
      fields: { loginLabel: { type: 'text' as const, label: 'Sign-in label' }, registerLabel: { type: 'text' as const, label: 'Register label' } },
      defaultProps: { loginLabel: 'Sign in', registerLabel: 'Register' },
      render: MembersAccountLinkBlock,
    },
    MemberGate: {
      label: 'Member Gate',
      fields: {
        content: { type: 'slot' as const },
        fallbackMessage: { type: 'text' as const, label: 'Message shown to guests' },
      },
      defaultProps: { fallbackMessage: 'Sign in to view this content.' },
      render: MemberGateBlock,
    },
    TrustedMemberGate: {
      label: 'Trusted Member Gate',
      fields: {
        content: { type: 'slot' as const },
        fallbackMessage: { type: 'text' as const, label: 'Message shown to non-trusted visitors' },
      },
      defaultProps: { fallbackMessage: 'This content is only available to trusted members.' },
      render: TrustedMemberGateBlock,
    },
    MembersProfile: {
      label: 'Members: My Profile',
      fields: {},
      defaultProps: {},
      render: MembersProfileBlock,
    },
    ThemeToggle: {
      label: 'Theme Toggle',
      fields: {
        style: {
          type: 'select' as const, label: 'Style',
          options: [
            { value: 'segmented', label: 'Segmented pill (icons)' },
            { value: 'expand', label: 'Icon, expand on hover' },
            { value: 'dropdown', label: 'Icon, dropdown menu' },
            { value: 'text', label: 'Segmented pill (text)' },
            { value: 'switch', label: 'Sun / moon switch' },
            { value: 'cycle', label: 'Single icon, click to cycle' },
          ],
        },
      },
      defaultProps: { style: 'segmented' },
      render: ({ style }: { style?: 'segmented' | 'expand' | 'dropdown' | 'text' | 'switch' | 'cycle' }) => (
        <ThemeToggleClient style={style} />
      ),
    },
    CookieSettingsLink: {
      label: 'Cookie Preferences',
      fields: {
        label: { type: 'text' as const, label: 'Link text' },
      },
      defaultProps: { label: 'Cookie preferences' },
      render: (props: any) => (
        <button
          type="button"
           
          onClick={() => { if (typeof window !== 'undefined') (window as any).cactusConsent?.open() }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', font: 'inherit', padding: 0, textDecoration: 'underline' }}
        >
          {props.label || 'Cookie preferences'}
        </button>
      ),
    },
    SiteHeader: {
      label: 'Site Header',
      fields: {
        bg:               { type: 'custom' as const, label: 'Background', render: HeaderBgColorField },
        height:           { type: 'select' as const, label: 'Height', options: [{ value: 'auto', label: 'Auto' }, { value: '48px', label: '48px' }, { value: '64px', label: '64px (default)' }, { value: '72px', label: '72px' }, { value: '80px', label: '80px' }, { value: '96px', label: '96px' }] },
        sticky:           { type: 'select' as const, label: 'Sticky', options: [{ value: 'yes', label: 'Sticky (fixed to top)' }, { value: 'no', label: 'Static' }] },
        border:           { type: 'custom' as const, label: 'Border bottom', render: BorderField },
        maxWidth:         { type: 'select' as const, label: 'Content max-width', options: [{ value: 'none', label: 'Full width' }, { value: '720px', label: '720px' }, { value: '960px', label: '960px' }, { value: '1200px', label: '1200px' }, { value: '1400px', label: '1400px' }] },
        logoHeight:       { type: 'number' as const, label: 'Logo height (px)' },
        showTextWithLogo: { type: 'select' as const, label: 'Show site name', options: [{ value: 'false', label: 'Logo only' }, { value: 'true', label: 'Logo + name' }] },
        logoHomeUrl:      { type: 'text' as const, label: 'Logo link URL' },
        itemFontSize:     { type: 'custom' as const, label: 'Nav font size', options: [{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }], render: ResponsiveSelectField },
        itemFontWeight:   { type: 'custom' as const, label: 'Nav font weight', options: [{ value: 'normal', label: 'Normal' }, { value: 'medium', label: 'Medium' }, { value: 'semibold', label: 'Semibold' }, { value: 'bold', label: 'Bold' }], render: ResponsiveSelectField },
        itemColor:        { type: 'custom' as const, label: 'Nav link colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} /> },
        itemFontFamily:   { type: 'custom' as const, label: 'Nav font', render: ({ value, onChange }: any) => <SiteFontField value={value} onChange={onChange} /> },
        hoverColor:       { type: 'custom' as const, label: 'Nav hover colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} /> },
        hoverBackground:  { type: 'custom' as const, label: 'Nav hover background', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} /> },
        activeColor:      { type: 'custom' as const, label: 'Active item colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} /> },
        activeFontWeight: { type: 'select' as const, label: 'Active font weight', options: [{ value: '', label: 'Same as items' }, { value: 'normal', label: 'Normal' }, { value: 'medium', label: 'Medium' }, { value: 'semibold', label: 'Semibold' }, { value: 'bold', label: 'Bold' }] },
        activeUnderline:  { type: 'select' as const, label: 'Underline active item', options: [{ value: 'none', label: 'No' }, { value: 'underline', label: 'Yes' }] },
        activeUnderlineColor: { type: 'custom' as const, label: 'Active underline colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} /> },
        activeUnderlineThickness: { type: 'custom' as const, label: 'Underline thickness', units: ['px', 'em'], render: UnitValueField },
        activeUnderlineOffset: { type: 'custom' as const, label: 'Underline offset', units: ['px', 'em'], render: UnitValueField },
        showDropdowns:    { type: 'select' as const, label: 'Dropdowns open on', options: [{ value: 'hover', label: 'Hover' }, { value: 'click', label: 'Click' }] },
        alignment:        { type: 'custom' as const, label: 'Nav horizontal alignment', options: [{ value: 'flex-start', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'space-between', label: 'Space between' }, { value: 'space-around', label: 'Space around' }], render: ResponsiveSelectField },
        showMobileToggle: { type: 'select' as const, label: 'Mobile nav', options: [{ value: 'collapse', label: 'Collapse to hamburger' }, { value: 'show', label: 'Always show' }] },
        showTabletToggle: { type: 'select' as const, label: 'Tablet nav', options: [{ value: 'collapse', label: 'Collapse to hamburger' }, { value: 'show', label: 'Always show' }] },
      },
      defaultProps: {
        bg: { mode: 'color', color: '' }, height: '64px', sticky: 'yes',
        border: { show: 'show', color: '' }, maxWidth: '1200px',
        logoHeight: 40, showTextWithLogo: 'false', logoHomeUrl: '/',
        itemFontSize: 'medium', itemFontWeight: 'medium', itemColor: '', itemFontFamily: '', hoverColor: '', hoverBackground: '', activeColor: '', activeFontWeight: '', activeUnderline: 'none' as const, activeUnderlineColor: '', activeUnderlineThickness: '', activeUnderlineOffset: '', showDropdowns: 'hover', alignment: 'flex-start' as const, showMobileToggle: 'collapse', showTabletToggle: 'collapse',
      },
      resolveFields: (data: any, { fields }: any) => {
        if (data?.props?.activeUnderline === 'underline') return fields
        const { activeUnderlineColor: _auc, activeUnderlineThickness: _aut, activeUnderlineOffset: _auo, ...rest } = fields
        return rest
      },
      render: SiteHeaderBlock,
    },
    ...moduleComponents,
    }
    return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, withResponsiveVisibility(value)]))
  })(),
} satisfies Config

export default puckConfig
export type PuckConfig = typeof puckConfig

// ---------------------------------------------------------------------------
// Footer Puck config — used in Appearance > Footer editor
// ---------------------------------------------------------------------------

export const footerPuckConfig = {
  categories: {
    site:       { title: 'Site',       components: ['SiteLogo', 'Copyright', 'MenuBlock', 'SocialLinks', 'ButtonLink', 'CookieSettingsLink'], defaultExpanded: true },
    layout:     { title: 'Layout',     components: ['Grid2', 'Grid3', 'Grid4', 'Group', 'Split', 'Spacer', 'Divider'], defaultExpanded: false },
    typography: { title: 'Typography', components: ['Heading', 'TextBlock', 'RichTextBlock'], defaultExpanded: false },
  },
  root: {
    fields: {
      bgColor:    { type: 'custom' as const, label: 'Background colour', render: ({ value, onChange, field }: any) => <SiteColourField value={value} onChange={onChange} label={field.label} /> },
      paddingY:   { type: 'select' as const, label: 'Vertical padding', options: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }] },
      border:     { type: 'custom' as const, label: 'Border top', render: BorderField },
      maxWidth:   { type: 'select' as const, label: 'Content max-width', options: [{ value: 'none', label: 'Full width' }, { value: '720px', label: '720px' }, { value: '960px', label: '960px' }, { value: '1200px', label: '1200px' }] },
    },
    defaultProps: { bgColor: '', paddingY: 'md', border: { show: 'show', color: '' }, maxWidth: '1200px' },
    render: ({ children, bgColor, paddingY, border, maxWidth }: any) => {
      const pyMap: Record<string, string> = { none: '0', sm: '2rem', md: '3rem', lg: '5rem' }
      return (
        <footer style={{ background: bgColor || undefined, borderTop: border?.show === 'show' ? `1px solid ${border?.color || 'var(--admin-border, #e5e7eb)'}` : 'none' }}>
          <div style={{ maxWidth: maxWidth === 'none' ? '100%' : (maxWidth || '1200px'), margin: '0 auto', padding: `${pyMap[paddingY] ?? '3rem'} 1.5rem` }}>
            {children}
          </div>
        </footer>
      )
    },
  },
  components: {
    SiteLogo:            puckConfig.components.SiteLogo,
    Copyright:           puckConfig.components.Copyright,
    MenuBlock:           puckConfig.components.MenuBlock,
    // The footer root already applies a 1.5rem gutter, so blocks default to no
    // extra padding here (otherwise they'd double up against the site default).
    SocialLinks:         noGutterDefault(puckConfig.components.SocialLinks),
    ButtonLink:          noGutterDefault(puckConfig.components.ButtonLink),
    CookieSettingsLink:  puckConfig.components.CookieSettingsLink,
    // Grid stays mapped (but unlisted in any category above) purely so
    // pre-split data - saved-block entries or history snapshots a migration
    // missed - still renders/edits; new blocks come from Grid2/3/4.
    Grid:                puckConfig.components.Grid,
    Grid2:               puckConfig.components.Grid2,
    Grid3:               puckConfig.components.Grid3,
    Grid4:               puckConfig.components.Grid4,
    Group:               puckConfig.components.Group,
    Split:               puckConfig.components.Split,
    Spacer:              puckConfig.components.Spacer,
    Divider:             puckConfig.components.Divider,
    Heading:             noGutterDefault(puckConfig.components.Heading),
    TextBlock:           noGutterDefault(puckConfig.components.TextBlock),
    RichTextBlock:       noGutterDefault(puckConfig.components.RichTextBlock),
  },
}

// ---------------------------------------------------------------------------
// Layout Puck config — used in Layouts editor (structural blocks + ContentSlot)
// ---------------------------------------------------------------------------

export const layoutPuckConfig = {
  categories: {
    layout:     { title: 'Structure',  components: ['ContentSlot', 'Section', 'Grid2', 'Grid3', 'Grid4', 'Group', 'Split', 'Spacer', 'Divider'], defaultExpanded: true },
    typography: { title: 'Typography', components: ['Heading', 'TextBlock', 'RichTextBlock', 'Quote', 'Caption'],              defaultExpanded: false },
    actions:    { title: 'Actions',    components: ['ButtonLink', 'CTABanner'],                                                defaultExpanded: false },
    media:      { title: 'Media',      components: ['ImageBlock', 'VideoEmbed', 'Embed'],                                      defaultExpanded: false },
    content:    { title: 'Content',    components: ['Hero', 'Eyebrow', 'Card', 'ImageChipPanel', 'Callout', 'Badge', 'Trustline', 'Chip', 'Accordion', 'FeatureList', 'SpecPanel', 'Ticker', 'Stats', 'Logos', 'SocialLinks'], defaultExpanded: false },
    site:       { title: 'Site',       components: ['SiteHeader', 'SiteLogo', 'Copyright', 'MenuBlock', 'LoginButton', 'ThemeToggle', 'CookieSettingsLink'], defaultExpanded: false },
    members:    { title: 'Members',    components: ['MembersLogin', 'MembersRegister', 'MembersAccountLink', 'MemberGate', 'TrustedMemberGate', 'MembersProfile'], defaultExpanded: false },
    modules:    { title: 'Modules',    components: Object.keys(moduleComponents), defaultExpanded: true },
  },
  root: {
    render: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  },
  components: {
    ContentSlot: {
      label: 'Content Slot',
      fields: {},
      defaultProps: {},
      render: ContentSlot,
    },
    Section:      puckConfig.components.Section,
    Grid:         puckConfig.components.Grid,
    Grid2:        puckConfig.components.Grid2,
    Grid3:        puckConfig.components.Grid3,
    Grid4:        puckConfig.components.Grid4,
    Group:        puckConfig.components.Group,
    Split:        puckConfig.components.Split,
    Spacer:       puckConfig.components.Spacer,
    Divider:      puckConfig.components.Divider,
    Heading:      puckConfig.components.Heading,
    TextBlock:    puckConfig.components.TextBlock,
    RichTextBlock: puckConfig.components.RichTextBlock,
    Quote:        puckConfig.components.Quote,
    Caption:      puckConfig.components.Caption,
    ButtonLink:   puckConfig.components.ButtonLink,
    CTABanner:    puckConfig.components.CTABanner,
    ImageBlock:   puckConfig.components.ImageBlock,
    VideoEmbed:   puckConfig.components.VideoEmbed,
    Embed:        puckConfig.components.Embed,
    Hero:         puckConfig.components.Hero,
    Eyebrow:      puckConfig.components.Eyebrow,
    Card:         puckConfig.components.Card,
    ImageChipPanel: puckConfig.components.ImageChipPanel,
    Callout:      puckConfig.components.Callout,
    Badge:        puckConfig.components.Badge,
    Trustline:    puckConfig.components.Trustline,
    Chip:         puckConfig.components.Chip,
    Accordion:    puckConfig.components.Accordion,
    FeatureList:  puckConfig.components.FeatureList,
    SpecPanel:    puckConfig.components.SpecPanel,
    Ticker:       puckConfig.components.Ticker,
    Stats:        puckConfig.components.Stats,
    Logos:        puckConfig.components.Logos,
    SocialLinks:  puckConfig.components.SocialLinks,
    SiteHeader:   puckConfig.components.SiteHeader,
    SiteLogo:     puckConfig.components.SiteLogo,
    Copyright:    puckConfig.components.Copyright,
    MenuBlock:    puckConfig.components.MenuBlock,
    LoginButton:        puckConfig.components.LoginButton,
    ThemeToggle:        puckConfig.components.ThemeToggle,
    CookieSettingsLink: puckConfig.components.CookieSettingsLink,
    MembersLogin:       puckConfig.components.MembersLogin,
    MembersRegister:    puckConfig.components.MembersRegister,
    MembersAccountLink: puckConfig.components.MembersAccountLink,
    MemberGate:         puckConfig.components.MemberGate,
    TrustedMemberGate:  puckConfig.components.TrustedMemberGate,
    MembersProfile:     puckConfig.components.MembersProfile,
    ...moduleComponents,
  },
}

// ---------------------------------------------------------------------------
// Header Puck config — site + structural blocks only, no content blocks
// ---------------------------------------------------------------------------

const headerRootRender = ({
  children, bg = { mode: 'color', color: '' }, height = '64px', sticky = 'yes',
  border = { show: 'show', color: '' }, maxWidth = '1200px',
  shrinkOnScroll = 'no', shrinkHeight = '48px',
}: any) => {
  const bgMode = bg.mode ?? 'color'
  const bgColor = bg.color ?? ''
  // "Solid colour" must always paint a background: fall back to the site
  // background token when no colour is picked, so the header can never render
  // see-through by accident. 'transparent' and 'transparent-scroll' are meant to
  // start see-through, so they keep their existing behaviour.
  const background = bgMode === 'transparent'
    ? 'transparent'
    : bgMode === 'color'
      ? (bgColor || 'var(--color-bg)')
      : (bgColor || undefined)
  const shrinking = shrinkOnScroll === 'yes'
  // data-header-root is unconditional (unlike data-shrink-root, which only
  // appears when shrink-on-scroll is on): it scopes the header-only true-
  // centering CSS that GridBlock/GroupBlock emit, so those rules are inert
  // anywhere outside a header.
  const headerEl = (
    <header
      data-bg-mode={bgMode}
      data-header-root=""
      data-shrink-root={shrinking ? '' : undefined}
      style={{
        height: height === 'auto' ? undefined : height,
        minHeight: height === 'auto' ? 48 : undefined,
        background,
        borderBottom: border?.show === 'show' ? `1px solid ${border?.color || 'var(--color-border, #e5e7eb)'}` : 'none',
        position: sticky === 'yes' ? 'sticky' : 'relative',
        top: sticky === 'yes' ? 0 : undefined,
        zIndex: sticky === 'yes' ? 100 : undefined,
        width: '100%',
      }}
    >
      <div data-header-inner style={{
        maxWidth: maxWidth === 'none' ? '100%' : (maxWidth || '1200px'),
        margin: '0 auto',
        padding: '0 1.5rem',
        height: '100%',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
      }}>
        {/* Row's cross-axis (alignItems above) centres this vertically; without an
            explicit width the content zone shrinks to its own content on the main
            axis instead of spanning the header, so it must be forced full-width here.
            position:relative makes this the containing block for the header-only
            true-centering rules GridBlock/GroupBlock emit (absolute, left:50%). */}
        <div style={{ width: '100%', position: 'relative' }}>{children}</div>
      </div>
    </header>
  )
  if (!shrinking) return headerEl
  return (
    <>
      <style>{[
        `header[data-shrink-root]{transition:height 0.25s ease;}`,
        `header[data-shrink-root][data-shrunk]{height:${shrinkHeight} !important;}`,
      ].join('\n')}</style>
      <HeaderShrinkScroll>{headerEl}</HeaderShrinkScroll>
    </>
  )
}

// Module blocks that opted into the header via `layoutTypes: ["header"]` in their
// manifest (e.g. the shop's cart-summary widget). Lets a module contribute chrome
// blocks to the header editor without any module-specific code living in core —
// same reserved-key mechanism getConfig already uses for 'header' as a layout type.
const headerModuleBlocks = moduleComponentsByLayoutType['header'] ?? {}

export const headerPuckConfig = {
  categories: {
    site:       { title: 'Site',       components: ['SiteLogo', 'MenuBlock', 'LoginButton', 'ThemeToggle', 'MembersAccountLink'], defaultExpanded: true },
    layout:     { title: 'Structure',  components: ['Grid2', 'Grid3', 'Grid4', 'Group', 'Spacer', 'Divider'], defaultExpanded: true },
    typography: { title: 'Text',       components: ['Heading', 'TextBlock', 'RichTextBlock'], defaultExpanded: false },
    actions:    { title: 'Actions',    components: ['ButtonLink'], defaultExpanded: false },
    ...(Object.keys(headerModuleBlocks).length > 0
      ? { blocks: { title: 'Blocks', components: Object.keys(headerModuleBlocks), defaultExpanded: true } }
      : {}),
  },
  root: {
    fields: {
      bg:           { type: 'custom' as const, label: 'Background', render: HeaderBgColorField },
      height:       { type: 'select' as const, label: 'Height', options: [{ value: 'auto', label: 'Auto' }, { value: '48px', label: '48px' }, { value: '64px', label: '64px (default)' }, { value: '72px', label: '72px' }, { value: '80px', label: '80px' }, { value: '96px', label: '96px' }] },
      sticky:       { type: 'select' as const, label: 'Sticky', options: [{ value: 'yes', label: 'Sticky (fixed to top)' }, { value: 'no', label: 'Static' }] },
      border:       { type: 'custom' as const, label: 'Border bottom', render: BorderField },
      maxWidth:     { type: 'select' as const, label: 'Content max-width', options: [{ value: 'none', label: 'Full width' }, { value: '720px', label: '720px' }, { value: '960px', label: '960px' }, { value: '1200px', label: '1200px' }, { value: '1400px', label: '1400px' }] },
      shrinkOnScroll: { type: 'select' as const, label: 'Shrink on scroll', options: [{ value: 'no', label: 'Off' }, { value: 'yes', label: 'On' }] },
      shrinkHeight: { type: 'custom' as const, label: 'Shrunk height', units: ['px', 'rem'], render: UnitValueField },
    },
    defaultProps: { bg: { mode: 'color', color: '' }, height: '64px', sticky: 'yes', border: { show: 'show', color: '' }, maxWidth: '1200px', shrinkOnScroll: 'no', shrinkHeight: '48px' },
    resolveFields: (data: any, { fields }: any) => {
      if (data.props?.shrinkOnScroll === 'yes') return fields
      const { shrinkHeight: _h, ...rest } = fields
      return rest
    },
    render: headerRootRender,
  },
  components: {
    SiteLogo:     puckConfig.components.SiteLogo,
    MenuBlock:    puckConfig.components.MenuBlock,
    LoginButton:  puckConfig.components.LoginButton,
    ThemeToggle:  puckConfig.components.ThemeToggle,
    MembersAccountLink: puckConfig.components.MembersAccountLink,
    Grid:         puckConfig.components.Grid,
    Grid2:        puckConfig.components.Grid2,
    Grid3:        puckConfig.components.Grid3,
    Grid4:        puckConfig.components.Grid4,
    Group:        puckConfig.components.Group,
    Spacer:       puckConfig.components.Spacer,
    Divider:      puckConfig.components.Divider,
    Heading:      puckConfig.components.Heading,
    TextBlock:    puckConfig.components.TextBlock,
    RichTextBlock: puckConfig.components.RichTextBlock,
    ButtonLink:   puckConfig.components.ButtonLink,
    ...headerModuleBlocks,
  },
}

// ---------------------------------------------------------------------------
// Full-page Puck config — for notFound + statusPage types (no ContentSlot)
// ---------------------------------------------------------------------------

export const fullPagePuckConfig = puckConfig

// ---------------------------------------------------------------------------
// Module layout Puck config — used for module-declared layout types (e.g.
// directoryCategory, directoryEntry). Offers this layout type's own tagged
// blocks plus the same shared content/layout/typography/actions/media
// categories used by infoPage — deliberately excludes site/members categories,
// which are chrome-only concerns not relevant to module content pages.
// ---------------------------------------------------------------------------

const MODULE_LAYOUT_CATEGORY_KEYS = ['layout', 'typography', 'actions', 'media', 'content'] as const

// Shared by both the editor (here) and the RSC render path (lib/puck/config.rsc.tsx)
// so the "module declares its own blocks" wiring only exists in one place.
export function getModuleLayoutSharedParts() {
  const sharedCategories = Object.fromEntries(
    MODULE_LAYOUT_CATEGORY_KEYS.map((k) => [k, puckConfig.categories[k]])
  )
  const sharedComponents = Object.fromEntries(
    MODULE_LAYOUT_CATEGORY_KEYS.flatMap((k) => puckConfig.categories[k].components)
      .map((name) => [name, (puckConfig.components as any)[name]])
  )
  return { sharedCategories, sharedComponents }
}

export function getModuleLayoutPuckConfig(layoutType: string) {
  const modBlocks = moduleComponentsByLayoutType[layoutType] ?? {}
  const { sharedCategories, sharedComponents } = getModuleLayoutSharedParts()
  return {
    categories: {
      blocks: { title: 'Blocks', components: Object.keys(modBlocks), defaultExpanded: true },
      ...sharedCategories,
    },
    root: {
      render: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    },
    components: { ...sharedComponents, ...modBlocks },
  }
}

export function getModuleLayoutPuckRscConfig(layoutType: string) {
  return getModuleLayoutPuckConfig(layoutType)
}
