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
import MenuBlockClient from '@/lib/puck/components/MenuBlockClient'
import SiteLogoClient from '@/lib/puck/components/SiteLogoClient'
import { SiteColourField } from '@/lib/puck/SiteColourField'
import { BorderField } from '@/lib/puck/BorderField'
import { SectionBgColorField, HeroBgColorField, HeaderBgColorField, PageBgColorField } from '@/lib/puck/BgColorField'
import { LayoutPickerField } from '@/lib/puck/LayoutPickerField'
import { moduleEmbedOptions } from '@/lib/puck/module-embed-options'
import { ThemeToggle as ThemeToggleClient } from '@/components/ThemeToggle'
import { moduleComponents, moduleComponentsByLayoutType } from '@/lib/puck/module-components'
import LoginForm from '@/components/members/LoginForm'
import RegisterForm from '@/components/members/RegisterForm'

 

// Extensions matching Puck's default richtext configuration — used to convert
// TipTap JSON stored in publishedData back to HTML for the RSC render path.
const richtextExtensions = [
  Document, Paragraph, Text, Bold, Italic, Strike, Underline,
  TiptapHeading, Blockquote, Code, CodeBlock, HardBreak, HorizontalRule,
  Link, BulletList, OrderedList, ListItem,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
]

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

const PADDING_MAP: Record<string, string> = {
  none: '0', sm: '0.5rem', md: '1rem', lg: '2rem', xl: '4rem',
}
// Block padding is horizontal-only: it acts as a left/right gutter so content
// doesn't run to the page edges, without stacking vertical gaps on top of each
// block's own margins. 'default' (and unset) pulls the site-wide gutter set in
// Styles → Spacing, falling back to 1.5rem to match the Section/footer gutters.
function getPadding(p?: string): string {
  if (!p || p === 'default') return '0 var(--block-padding, 1.5rem)'
  const v = PADDING_MAP[p]
  return v && v !== '0' ? `0 ${v}` : '0'
}

const paddingField = {
  type: 'select' as const,
  label: 'Padding (left/right)',
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

// AOS (Animate On Scroll) helpers — data attributes rendered server-side, AOS JS picks them up client-side
const AOS_TYPE_MAP: Record<string, string> = {
  'fade-in': 'fade', 'slide-up': 'fade-up', 'slide-down': 'fade-down',
  'slide-left': 'fade-left', 'slide-right': 'fade-right',
  'zoom-in': 'zoom-in', 'zoom-out': 'zoom-out',
}
const AOS_DURATION_MAP: Record<string, string> = { fast: '300', normal: '600', slow: '1000' }
const AOS_DELAY_MAP: Record<string, string> = { none: '0', '100ms': '100', '200ms': '200', '400ms': '400', '600ms': '600' }

function getAosProps(animationType: string, animationDuration: string, animationDelay: string): Record<string, string> {
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

// ---------------------------------------------------------------------------
// Layout blocks
// ---------------------------------------------------------------------------

// A custom width wins over the columnSizes preset for its own column; columns
// left blank fall back to `1fr` so a single custom width doesn't collapse its
// neighbours to zero width.
function getGridTemplateColumns(columnSizes: string | undefined, colCount: number, colWidths?: Array<string | undefined>): string {
  if (colWidths?.slice(0, colCount).some(w => w && w.trim())) {
    return colWidths.slice(0, colCount).map(w => (w && w.trim()) || '1fr').join(' ')
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
  const { columns, gap, padding, col1, col2, col3, col4, verticalAlign, columnSizes, col1Align, col2Align, col3Align, col4Align, col1Width, col2Width, col3Width, col4Width, spaceBelow } = props
  const colCount = parseInt(columns ?? '2', 10)
  const slots = [col1, col2, col3, col4].slice(0, colCount)
  const colAligns = [col1Align, col2Align, col3Align, col4Align]
  const colWidths = [col1Width, col2Width, col3Width, col4Width]
  const justifyMap: Record<string, string> = { center: 'center', end: 'flex-end' }
  return (
    <div className="puck-grid" data-cols={colCount} style={{
      display: 'grid',
      gridTemplateColumns: getGridTemplateColumns(columnSizes, colCount, colWidths),
      gap: GAP_MAP[gap] ?? '1rem',
      padding: getPadding(padding),
      marginBottom: SPACE_BELOW_MAP[spaceBelow ?? 'md'] ?? '1.5rem',
      alignItems: ({ stretch: 'stretch', start: 'start', center: 'center', end: 'end' } as any)[verticalAlign] ?? 'stretch',
    }}>
      {slots.map((slot, i) => {
        const jc = colAligns[i] && justifyMap[colAligns[i]]
        const content = typeof slot === 'function' ? slot() : null
        return (
          <div key={i} style={{ minWidth: 0, ...(jc ? { display: 'flex', justifyContent: jc } : {}) }}>
            {/* Puck's own editor-canvas wrapper around a slot's dropped block
                stretches to fill this column (unlike the RSC/live render, which
                renders the block's own markup directly). Without this inner
                width:fit-content wrapper, that stretched wrapper leaves nothing
                for `justifyContent` to centre/end against, so a centred or
                right-aligned column looked left-aligned only in the editor. */}
            {jc ? <div style={{ width: 'fit-content', maxWidth: '100%' }}>{content}</div> : content}
          </div>
        )
      })}
    </div>
  )
}

function GroupBlock(props: any) {
  const { direction, justify, align, wrap, gap, padding, items } = props
  const justifyMap: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between', around: 'space-around', evenly: 'space-evenly' }
  const alignMap: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' }
  if (typeof items !== 'function') return null
  // Pass flex styles directly to the SlotRender wrapper so its children are
  // proper flex items rather than sitting inside an unstyled block container.
  return items({
    style: {
      display: 'flex',
      flexDirection: direction === 'column' ? 'column' : 'row',
      justifyContent: justifyMap[justify] ?? 'flex-start',
      alignItems: alignMap[align] ?? 'stretch',
      flexWrap: wrap === 'nowrap' ? 'nowrap' : 'wrap',
      gap: GAP_MAP[gap] ?? '1rem',
      padding: getPadding(padding),
    }
  })
}

function SiteHeaderBlock(props: any) {
  const {
    logoUrl, logoUrlDark, siteName, resolvedItems,
    bg = { mode: 'color', color: 'var(--color-bg)' }, height = '64px',
    sticky = 'yes', border = { show: 'show', color: 'var(--color-border)' },
    maxWidth = '1200px', logoHeight = 40, showTextWithLogo = 'false',
    logoHomeUrl = '/', itemFontSize = 'medium', itemFontWeight = 'medium',
    itemColor = '', showMobileToggle = 'collapse',
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
          <MenuBlockClient resolvedItems={resolvedItems} spacing="normal" itemFontSize={itemFontSize} itemFontWeight={itemFontWeight} textTransform="none" itemColor={itemColor} showMobileToggle={showMobileToggle} />
        )}
      </div>
    </header>
  )
}

function SplitBlock(props: any) {
  const { puck, ratio, align = 'stretch', gap = 'md', padding } = props
  const alignMap: Record<string, string> = { stretch: 'stretch', start: 'flex-start', center: 'center', end: 'flex-end' }
  const gapValue = GAP_MAP[gap] ?? '1rem'

  const gridCols: Record<string, string> = {
    '50/50': '1fr 1fr',
    '60/40': '3fr 2fr',
    '40/60': '2fr 3fr',
    '70/30': '7fr 3fr',
    '30/70': '3fr 7fr',
  }
  const cols = gridCols[ratio] ?? '1fr 1fr'

  return (
    <div className="puck-split" style={{ display: 'grid', gridTemplateColumns: cols, alignItems: alignMap[align] ?? 'stretch', gap: gapValue, marginBottom: padding === 'none' ? 0 : '1.5rem', padding: getPadding(padding) }}>
      <div>{puck?.renderDropZone?.({ zone: 'left', minEmptyHeight: 80 })}</div>
      <div>{puck?.renderDropZone?.({ zone: 'right', minEmptyHeight: 80 })}</div>
    </div>
  )
}

function Spacer(props: any) {
  const heights: Record<string, number> = { xs: 8, sm: 16, md: 32, lg: 64, xl: 96 }
  return <div style={{ height: heights[props.height] ?? 32 }} />
}

function Divider(props: any) {
  const { style, color, thickness } = props
  const colors: Record<string, string> = { gray: 'var(--color-border)', dark: 'var(--color-fg)', brand: 'var(--color-primary)' }
  const heights: Record<string, string> = { thin: '1px', medium: '2px', thick: '4px' }
  return (
    <hr style={{
      border: 'none',
      borderTop: `${heights[thickness] ?? '1px'} ${style ?? 'solid'} ${colors[color] ?? colors.gray}`,
      margin: '1.5rem 0',
    }} />
  )
}

// ---------------------------------------------------------------------------
// Section block — full-width container with background, padding, AOS, sticky
// ---------------------------------------------------------------------------

function SectionBlock(props: any) {
  const {
    content, bg = { mode: 'none', color: '' }, bgImage = '', bgSize = 'cover',
    overlayColor = '', overlayOpacity = 0,
    paddingY = 'lg', maxWidth = 'standard', textColor = '',
    sticky = 'off', stickyOffset = '0px',
    animationType = 'none', animationDuration = 'normal', animationDelay = 'none',
    boxShadow = 'none', borderStyle = 'none', borderColor = 'var(--color-border)',
    borderWidth = '1px', borderRadius = 'none', opacity = '100',
  } = props

  const paddingYMap: Record<string, string> = { none: '0', sm: '2rem', md: '4rem', lg: '6rem', xl: '10rem' }
  const maxWidthMap: Record<string, string> = { none: '100%', narrow: '720px', standard: '960px', wide: '1200px', full: '100%' }
  const shadowMap: Record<string, string> = { none: 'none', sm: '0 1px 3px rgba(0,0,0,0.1)', md: '0 4px 12px rgba(0,0,0,0.12)', lg: '0 8px 30px rgba(0,0,0,0.15)' }
  const radiusMap: Record<string, string> = { none: '0', sm: '4px', md: '8px', lg: '16px' }

  const bgType = bg.mode ?? 'none'
  const bgColor = bg.color ?? ''
  const bgStyle: React.CSSProperties = {}
  if (bgType === 'color' && bgColor) bgStyle.backgroundColor = bgColor
  if (bgType === 'gradient' && bgColor) bgStyle.background = bgColor
  if (bgType === 'image' && bgImage) {
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
    overflow: 'hidden',
  }

  const aosAttrs = getAosProps(animationType, animationDuration, animationDelay)

  return (
    <div style={outerStyle} className={bgType === 'grid-scan' ? 'cactus-section-grid-scan' : undefined} {...aosAttrs}>
      {bgType === 'grid-scan' && <div className="cactus-section-scan-beam" aria-hidden="true" />}
      {overlayColor && overlayOpacity > 0 && (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: overlayColor, opacity: overlayOpacity / 100, pointerEvents: 'none' }} />
      )}
      <div style={{
        maxWidth: maxWidthMap[maxWidth] ?? '960px',
        margin: '0 auto',
        padding: `${paddingYMap[paddingY] ?? '6rem'} 1.5rem`,
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
function renderHighlight(line: string, needle: string, mark: string, keyPrefix: string): React.ReactNode {
  if (!needle) return line
  const parts = line.split(needle)
  if (parts.length === 1) return line
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
    if (seg) out.push(seg)
    if (i < parts.length - 1) {
      out.push(
        <em key={`${keyPrefix}-em-${i}`} style={{ fontStyle: 'normal', color: emColor, ...markStyle }}>{needle}</em>,
      )
    }
  })
  return out
}

function Heading(props: any) {
  const { text, level, align, color, padding, animationType = 'none', animationDuration = 'normal', animationDelay = 'none', revealAnimation = 'none', highlightText = '', highlightMark = 'underline' } = props
  const colors: Record<string, string> = { muted: 'var(--color-muted)', brand: 'var(--color-primary)' }
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
  const style: React.CSSProperties = {
    fontFamily: `var(--${lvl}-family)`,
    fontSize: `var(--${lvl}-size, ${sizes[lvl] ?? sizes.h2})`,
    fontWeight: `var(--${lvl}-weight, ${weights[lvl] ?? 700})` as React.CSSProperties['fontWeight'],
    lineHeight: `var(--${lvl}-line-height, 1.25)`,
    letterSpacing: `var(--${lvl}-letter-spacing, normal)`,
    textTransform: `var(--${lvl}-transform, none)` as React.CSSProperties['textTransform'],
    fontStyle: `var(--${lvl}-style, normal)`,
    color: colors[color] ?? `var(--${lvl}-color, var(--color-fg))`,
    textAlign: align ?? 'left',
    margin: '0 0 1rem',
  }
  const Tag = lvl === 'display' ? 'h1' : lvl
  const headingClassName = lvl === 'display' ? 'cactus-display' : undefined
  // Stagger-lines: each newline in `text` becomes its own clipped line that
  // rises into place, staggered by 120ms per line — a one-shot reveal on
  // mount, independent of the scroll-triggered AOS effect above.
  const content = revealAnimation === 'stagger-lines'
    ? text.split('\n').map((line: string, i: number) => (
        <span key={i} className="cactus-stagger-line">
          <span className="cactus-stagger-line-inner" style={{ animationDelay: `${i * 120}ms` }}>{renderHighlight(line, highlightText, highlightMark, `l${i}`)}</span>
        </span>
      ))
    : renderHighlight(text, highlightText, highlightMark, 'h')
  return (
    <div style={{ padding: getPadding(padding) }} {...getAosProps(animationType, animationDuration, animationDelay)}>
      <Tag style={style} className={headingClassName}>
        {content}
      </Tag>
    </div>
  )
}

function TextBlock(props: any) {
  const { content, align, padding, size = 'base', maxWidth = 'none', color = 'default' } = props
  const sizeMap: Record<string, string> = { base: '1rem', md: '1.125rem', lg: '1.25rem' }
  const maxWidthMap: Record<string, string | undefined> = { none: undefined, prose: '46ch', wide: '60ch' }
  const colorMap: Record<string, string> = { default: 'var(--color-fg-secondary)', muted: 'var(--color-muted)', dark: 'var(--color-fg)' }
  const mw = maxWidthMap[maxWidth]
  // When width is capped, anchor the block to its text alignment (centre/right)
  // via auto side margins rather than letting it always sit flush-left.
  const marginLeft = mw && (align === 'center' || align === 'right') ? 'auto' : undefined
  const marginRight = mw && align === 'center' ? 'auto' : undefined
  return (
    <div style={{ marginBottom: '1.5rem', marginLeft, marginRight, fontSize: sizeMap[size] ?? '1rem', lineHeight: 1.65, color: colorMap[color] ?? 'var(--color-fg-secondary)', textAlign: align ?? 'left', maxWidth: mw, whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: getPadding(padding) }}>
      {content}
    </div>
  )
}

function RichTextBlock(props: any) {
  const { content, padding } = props
  if (!content) {
    return <div style={{ color: 'var(--color-muted)', fontSize: '0.875rem', padding: getPadding(padding) }}>Rich text — edit in the panel</div>
  }
  if (typeof content !== 'string') {
    // In the Puck editor canvas, the richtext field type (via useRichtextProps) transforms
    // the stored value into a React element (<Suspense><RichTextRender /></Suspense>).
    // Render it directly rather than passing to dangerouslySetInnerHTML.
    if (React.isValidElement(content)) {
      return <div className="puck-richtext" style={{ padding: getPadding(padding) }}>{content}</div>
    }
    // In the RSC render path, publishedData may contain TipTap JSON if the user edited
    // in the builder (Puck stores richtext content as TipTap JSON internally).
    // Convert it back to HTML so dangerouslySetInnerHTML receives a string.
    let html = ''
    try {
      html = generateHTML(content as JSONContent, richtextExtensions)
    } catch {
      html = ''
    }
    return <div className="puck-richtext" style={{ padding: getPadding(padding) }} dangerouslySetInnerHTML={{ __html: html }} />
  }
  return <div className="puck-richtext" style={{ padding: getPadding(padding) }} dangerouslySetInnerHTML={{ __html: content }} />
}

function Quote(props: any) {
  const { quote, attribution, padding, animationType = 'none', animationDuration = 'normal', animationDelay = 'none' } = props
  return (
    <div style={{ padding: getPadding(padding) }} {...getAosProps(animationType, animationDuration, animationDelay)}>
      <blockquote style={{ margin: '0 0 1.5rem', padding: '1.25rem 1.5rem', borderLeft: '4px solid var(--color-primary)', background: 'var(--color-bg-subtle)', borderRadius: '0 6px 6px 0' }}>
        <p style={{ margin: 0, fontSize: '1.125rem', fontStyle: 'italic', color: 'var(--color-fg-secondary)', lineHeight: 1.7 }}>{quote}</p>
        {attribution && <footer style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: 'var(--color-muted)', fontStyle: 'normal' }}>— {attribution}</footer>}
      </blockquote>
    </div>
  )
}

function Caption(props: any) {
  const { text, align, padding } = props
  return (
    <p
      className="cactus-caption"
      style={{
        margin: 0, padding: getPadding(padding), textAlign: align ?? 'left',
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
      {text}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Action blocks
// ---------------------------------------------------------------------------

function ButtonLink(props: any) {
  const { label, href, variant, padding } = props
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
  // secondary/outline read the site's brand primary colour directly (not the
  // button-specific override), so all three variants stay theme-aware without
  // any hardcoded colour. `--color-on-primary` is a WCAG-derived contrasting
  // text colour computed from the primary hex (lib/design/tokens.ts), so
  // secondary's fill always keeps legible text regardless of brand colour.
  // Hover is applied via the .cactus-btn rule (tokens.ts).
  const variants: Record<string, React.CSSProperties> = {
    primary:   { background: 'var(--btn-bg, var(--color-primary))', color: 'var(--btn-text-color, var(--color-bg))', border: 'var(--btn-border-width, 0) solid var(--btn-border, transparent)' },
    secondary: { background: 'var(--color-primary)', color: 'var(--color-on-primary, var(--color-bg))', border: 'var(--btn-border-width, 0) solid var(--btn-border, transparent)' },
    outline:   { background: 'transparent', color: 'var(--color-primary)', border: 'var(--btn-border-width, 2px) solid var(--btn-border, var(--color-primary))' },
  }
  return (
    <div style={{ marginBottom: '1rem', padding: getPadding(padding) }}>
      <a href={href} className="cactus-btn" style={{ ...shape, ...(variants[variant] ?? variants.primary) }}>
        {label}
      </a>
    </div>
  )
}

function CTABanner(props: any) {
  const { heading, subtext, ctaLabel, ctaHref, background, padding, animationType = 'none', animationDuration = 'normal', animationDelay = 'none' } = props
  const bgs: Record<string, { bg: string; text: string; sub: string }> = {
    white: { bg: 'var(--color-bg)', text: 'var(--color-fg)', sub: 'var(--color-muted)' },
    light: { bg: 'var(--color-bg-subtle)', text: 'var(--color-fg)', sub: 'var(--color-muted)' },
    brand: { bg: 'var(--color-primary)', text: 'var(--color-bg)', sub: 'rgba(255,255,255,0.85)' },
  }
  const t = bgs[background] ?? bgs.light!
  return (
    <section style={{ background: t!.bg, border: background === 'white' ? '1px solid var(--color-border)' : 'none', borderRadius: 8, padding: getPadding(padding) || '2.5rem 2rem', textAlign: 'center', marginBottom: '2rem' }}
      {...getAosProps(animationType, animationDuration, animationDelay)}>
      {heading && <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.75rem', fontWeight: 800, color: t!.text, lineHeight: 1.25 }}>{heading}</h2>}
      {subtext && <p style={{ margin: '0 0 1.5rem', color: t!.sub, fontSize: '1rem', lineHeight: 1.65 }}>{subtext}</p>}
      {ctaLabel && ctaHref && (
        <a href={ctaHref} style={{ display: 'inline-block', padding: '0.75rem 1.75rem', background: background === 'brand' ? 'var(--color-bg)' : 'var(--color-primary)', color: background === 'brand' ? 'var(--color-primary)' : 'var(--color-bg)', borderRadius: 6, fontWeight: 600, textDecoration: 'none', fontSize: '1rem' }}>
          {ctaLabel}
        </a>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Media blocks
// ---------------------------------------------------------------------------

function ImageBlock(props: any) {
  const { mediaUrl, alt, caption, padding, animationType = 'none', animationDuration = 'normal', animationDelay = 'none' } = props
  if (!mediaUrl) {
    return <div style={{ marginBottom: '1.5rem', background: 'var(--color-bg-subtle)', borderRadius: 6, padding: '3rem', textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.875rem' }}>No image selected</div>
  }
  return (
    <figure style={{ margin: '0 0 1.5rem', padding: getPadding(padding) }} {...getAosProps(animationType, animationDuration, animationDelay)}>
      {/* Border radius/colour/width reflect the Styles → Images tokens, defaulting to the original look. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mediaUrl} alt={alt ?? ''} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 'var(--img-radius, 6px)', border: 'var(--img-border-width, 0) solid var(--img-border-color, transparent)' }} />
      {caption && <figcaption style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--color-muted)', marginTop: '0.5rem' }}>{caption}</figcaption>}
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
  const { url, aspectRatio, title, padding } = props
  if (!url) return <div style={{ background: 'var(--color-bg-subtle)', borderRadius: 6, padding: '3rem', textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>No video URL entered</div>
  const embedUrl = toEmbedUrl(url)
  if (!embedUrl) return <div style={{ background: '#fef2f2', borderRadius: 6, padding: '1rem', color: '#b91c1c', fontSize: '0.875rem', marginBottom: '1.5rem' }}>Could not parse video URL</div>
  const paddings: Record<string, string> = { '16:9': '56.25%', '4:3': '75%', '1:1': '100%' }
  return (
    <div style={{ padding: getPadding(padding), marginBottom: '1.5rem' }}>
      <div style={{ position: 'relative', paddingBottom: paddings[aspectRatio] ?? '56.25%', height: 0, overflow: 'hidden', borderRadius: 6 }}>
        <iframe src={embedUrl} title={title || 'Video'} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }} />
      </div>
    </div>
  )
}

function Embed(props: any) {
  const { src, height, title, padding } = props
  if (!src) return <div style={{ background: 'var(--color-bg-subtle)', borderRadius: 6, padding: '3rem', textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>No embed URL entered</div>
  return (
    <div style={{ marginBottom: '1.5rem', padding: getPadding(padding) }}>
      <iframe src={src} title={title || 'Embedded content'} style={{ width: '100%', height: height || '400px', border: 'none', borderRadius: 6, display: 'block' }} allowFullScreen />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hero block — enhanced with bg types, layouts, second CTA
// ---------------------------------------------------------------------------

function Hero(props: any) {
  const {
    heading, subheading, ctaLabel, ctaHref, cta2Label, cta2Href, cta2Variant = 'outline',
    bg = { mode: 'gradient', color: '' }, bgImage = '', overlayColor = '', overlayOpacity = 0,
    layout = 'centered', imageUrl = '', textScheme = 'dark', minHeight = 'auto',
    padding, animationType = 'none', animationDuration = 'normal', animationDelay = 'none',
  } = props

  const bgType = bg.mode ?? 'gradient'
  const bgColor = bg.color ?? ''
  const bgStyle: React.CSSProperties = {}
  if (bgType === 'gradient') bgStyle.background = bgColor || 'linear-gradient(135deg, var(--color-primary-subtle, #f0fdf4) 0%, var(--color-primary-subtle, #dcfce7) 100%)'
  else if (bgType === 'color' && bgColor) bgStyle.backgroundColor = bgColor
  else if (bgType === 'image' && bgImage) { bgStyle.backgroundImage = `url(${bgImage})`; bgStyle.backgroundSize = 'cover'; bgStyle.backgroundPosition = 'center' }

  const textColor = textScheme === 'light' ? 'var(--color-bg)' : 'var(--color-fg)'
  const subColor = textScheme === 'light' ? 'rgba(255,255,255,0.85)' : 'var(--color-muted)'
  const minH: Record<string, string> = { auto: 'auto', half: '50vh', full: '100vh' }

  const inner = (
    <>
      {overlayColor && overlayOpacity > 0 && (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: overlayColor, opacity: overlayOpacity / 100, pointerEvents: 'none' }} />
      )}
      <div style={{ position: 'relative', zIndex: 1, textAlign: layout === 'centered' ? 'center' : 'left', maxWidth: layout === 'centered' ? 700 : undefined, margin: layout === 'centered' ? '0 auto' : undefined }}>
        <h1 style={{ fontSize: 'clamp(1.75rem, 4vw, 3rem)', fontWeight: 800, margin: '0 0 1rem', lineHeight: 1.15, color: textColor }}>{heading}</h1>
        {subheading && <p style={{ fontSize: '1.125rem', color: subColor, margin: '0 0 2rem', lineHeight: 1.65 }}>{subheading}</p>}
        {(ctaLabel || cta2Label) && (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: layout === 'centered' ? 'center' : 'flex-start' }}>
            {ctaLabel && ctaHref && (
              <a href={ctaHref} style={{ display: 'inline-block', padding: '0.75rem 1.75rem', background: 'var(--color-primary)', color: 'var(--color-bg)', borderRadius: 6, fontWeight: 600, textDecoration: 'none', fontSize: '1rem' }}>{ctaLabel}</a>
            )}
            {cta2Label && cta2Href && (
              <a href={cta2Href} style={{ display: 'inline-block', padding: '0.75rem 1.75rem', background: cta2Variant === 'outline' ? 'transparent' : 'var(--color-bg)', color: cta2Variant === 'outline' ? textColor : 'var(--color-fg)', border: cta2Variant === 'outline' ? `2px solid ${textColor}` : 'none', borderRadius: 6, fontWeight: 600, textDecoration: 'none', fontSize: '1rem' }}>{cta2Label}</a>
            )}
          </div>
        )}
      </div>
      {layout === 'right-image' && imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" style={{ width: '45%', minWidth: 240, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
      )}
    </>
  )

  return (
    <section style={{ position: 'relative', ...bgStyle, padding: getPadding(padding) || '5rem 1.5rem', borderRadius: 8, marginBottom: '2rem', minHeight: minH[minHeight] ?? 'auto', display: 'flex', alignItems: 'center', justifyContent: layout === 'right-image' ? 'space-between' : undefined, gap: layout === 'right-image' ? '3rem' : undefined, flexWrap: 'wrap' }}
      {...getAosProps(animationType, animationDuration, animationDelay)}>
      {inner}
    </section>
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
  const { items = [], iconSize = 'md', iconColor = '', layout = 'row', gap = 'normal', padding } = props
  const sizes: Record<string, number> = { sm: 20, md: 28, lg: 40 }
  const gapMap: Record<string, string> = { tight: '0.5rem', normal: '1rem', wide: '1.75rem' }
  const sz = sizes[iconSize] ?? 28
  return (
    <div style={{ display: 'flex', flexDirection: layout === 'column' ? 'column' : 'row', gap: gapMap[gap] ?? '1rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem', padding: getPadding(padding) }}>
      {items.map((item: any, i: number) => (
        <a key={i} href={item.url || '#'} target="_blank" rel="noopener noreferrer" aria-label={item.platform}
          style={{ display: 'inline-flex', color: iconColor || 'var(--color-fg-secondary)', width: sz, height: sz, flexShrink: 0 }}
          dangerouslySetInnerHTML={{ __html: (SOCIAL_ICONS[item.platform] ?? SOCIAL_ICONS['twitter-x']) as string }}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Content blocks
// ---------------------------------------------------------------------------

function Eyebrow(props: any) {
  const { text, showPulse = 'false', padding } = props
  const pulse = showPulse === 'true' || showPulse === true
  return (
    <div style={{ padding: getPadding(padding), marginBottom: '1rem' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--color-primary)', border: '1px solid var(--color-primary)', borderRadius: 9999, padding: '7px 16px' }}>
        {pulse && <span className="cactus-eyebrow-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-success)', flexShrink: 0 }} aria-hidden="true" />}
        {text}
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
  const { items = [], gap = 'normal', padding } = props
  const gapMap: Record<string, string> = { tight: '1rem', normal: '1.625rem', wide: '2.25rem' }
  if (!items?.length) return <div style={{ color: 'var(--color-muted)', fontSize: '0.875rem', padding: getPadding(padding) }}>No trust items yet — add some in the panel.</div>
  return (
    <div style={{ display: 'flex', gap: gapMap[gap] ?? '1.625rem', flexWrap: 'wrap', fontSize: '0.8125rem', color: 'var(--color-fg-secondary)', padding: getPadding(padding) }}>
      {items.map((item: any, i: number) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', color: 'var(--color-primary)', flexShrink: 0 }} aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: (TRUST_ICONS[item.icon] ?? TRUST_ICONS.check) as string }} />
          {item.text}
        </span>
      ))}
    </div>
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
  const { label, value, position = 'static', animationType = 'none', animationDuration = 'normal', animationDelay = 'none' } = props
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
      {label && <b style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--color-primary)' }}>{label}</b>}
      {value}
    </div>
  )
}

function Card(props: any) {
  const { mediaUrl, alt, heading, body, ctaLabel, ctaHref, padding, animationType = 'none', animationDuration = 'normal', animationDelay = 'none' } = props
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', marginBottom: '1.5rem', background: 'var(--color-bg)', padding: getPadding(padding) }}
      {...getAosProps(animationType, animationDuration, animationDelay)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- media URLs are external CDN addresses; next/image requires a configured domain for each provider which users add at setup time */}
      {mediaUrl && <img src={mediaUrl} alt={alt ?? ''} style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }} />}
      <div style={{ padding: '1.25rem' }}>
        {heading && <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-fg)' }}>{heading}</h3>}
        {body && <p style={{ margin: '0 0 1rem', color: 'var(--color-fg-secondary)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{body}</p>}
        {ctaLabel && ctaHref && <a href={ctaHref} style={{ display: 'inline-block', padding: '0.5rem 1.25rem', background: 'var(--color-primary)', color: 'var(--color-bg)', borderRadius: 6, fontWeight: 600, textDecoration: 'none', fontSize: '0.875rem' }}>{ctaLabel}</a>}
      </div>
    </div>
  )
}

function ImageChipPanel(props: any) {
  const {
    mediaUrl, alt, chips = [], boxShadow = 'none', borderRadius = 'none', borderStyle = 'none',
    borderColor = 'var(--color-border)', borderWidth = '1px', padding,
    framePadding = 'none', frameBg = 'none', gridPattern = 'none', scanEffect = 'off',
  } = props
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
      className={gridPattern !== 'none' ? 'cactus-section-grid-scan' : undefined}
      style={{
        position: 'relative', overflow: 'hidden', marginBottom: '1.5rem',
        boxShadow: shadowMap[boxShadow] ?? 'none',
        borderRadius: panelRadius,
        border: borderStyle !== 'none' ? `${borderWidth} ${borderStyle} ${borderColor}` : undefined,
        background: bgMap[frameBg],
        padding: hasFrame ? innerPad : getPadding(padding),
      }}
    >
      {scanEffect === 'on' && <div className="cactus-section-scan-beam" aria-hidden="true" />}
      {/* No z-index on the image: the grid sits in the panel background (always
          behind), while the scan beam and chips come later in the DOM so they
          paint over the image without needing an explicit stacking order. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- media URLs are external CDN addresses; next/image requires a configured domain for each provider which users add at setup time */}
      <img src={mediaUrl} alt={alt ?? ''} style={{ position: 'relative', width: '100%', height: 'auto', display: 'block', borderRadius: hasFrame ? `calc(${panelRadius} - 6px)` : undefined }} />
      {/* Chips are a plain data array, not a Puck slot — Puck doesn't insert its per-item
          drag-handle wrapper around array-field items, so each Chip's own position:absolute
          resolves against this same box in both the editor canvas and the live render. */}
      {chips.map((chip: any, i: number) => <Chip key={i} {...chip} />)}
    </div>
  )
}

function Callout(props: any) {
  const { type, title, body, padding } = props
  const themes: Record<string, { bg: string; border: string; icon: string; titleColor: string }> = {
    info:    { bg: '#eff6ff', border: '#3b82f6', icon: 'ℹ️', titleColor: '#1d4ed8' },
    success: { bg: '#f0fdf4', border: '#16a34a', icon: '✅', titleColor: '#15803d' },
    warning: { bg: '#fffbeb', border: '#f59e0b', icon: '⚠️', titleColor: '#b45309' },
    error:   { bg: '#fef2f2', border: '#ef4444', icon: '❌', titleColor: '#b91c1c' },
  }
  const t = (themes[type] ?? themes.info)!
  return (
    <div style={{ background: t.bg, borderLeft: `4px solid ${t.border}`, borderRadius: '0 6px 6px 0', padding: getPadding(padding) || '1rem 1.25rem', marginBottom: '1.5rem' }}>
      {title && <p style={{ margin: '0 0 0.375rem', fontWeight: 700, color: t.titleColor, fontSize: '0.9375rem' }}>{t.icon} {title}</p>}
      <p style={{ margin: 0, color: 'var(--color-fg-secondary)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{body}</p>
    </div>
  )
}

function Badge(props: any) {
  const { label, color, padding } = props
  const colors: Record<string, { bg: string; text: string }> = {
    primary: { bg: 'var(--color-primary-subtle, #dcfce7)', text: 'var(--color-primary)' },
    blue:    { bg: '#dbeafe', text: '#1d4ed8' },
    yellow:  { bg: '#fef9c3', text: '#a16207' },
    red:     { bg: '#fee2e2', text: '#b91c1c' },
    gray:    { bg: 'var(--color-bg-subtle)', text: 'var(--color-fg-secondary)' },
  }
  const t = (colors[color] ?? colors.gray)!
  return (
    <div style={{ padding: getPadding(padding) }}>
      <span style={{ display: 'inline-block', padding: '0.25rem 0.625rem', borderRadius: 9999, fontSize: '0.75rem', fontWeight: 600, background: t.bg, color: t.text, marginBottom: '0.5rem' }}>{label}</span>
    </div>
  )
}

function Accordion(props: any) {
  const { items, padding } = props
  if (!items?.length) return <div style={{ color: 'var(--color-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>No accordion items yet — add some in the panel.</div>
  return (
    <div style={{ marginBottom: '1.5rem', padding: getPadding(padding) }}>
      {items.map((item: any, i: number) => (
        <details key={i} style={{ borderBottom: '1px solid var(--color-border)', padding: 0 }}>
          <summary style={{ padding: '0.875rem 0', fontWeight: 600, color: 'var(--color-fg)', cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9375rem' }}>
            {item.question}
            <span style={{ fontSize: '1.25rem', color: 'var(--color-muted)', flexShrink: 0, marginLeft: '1rem' }}>+</span>
          </summary>
          <p style={{ margin: '0 0 0.875rem', color: 'var(--color-fg-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{item.answer}</p>
        </details>
      ))}
    </div>
  )
}

function Stats(props: any) {
  const { items, padding, animationType = 'none', animationDuration = 'normal', animationDelay = 'none' } = props
  if (!items?.length) return <div style={{ color: 'var(--color-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>No stats yet — add some in the panel.</div>
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '1.5rem', padding: getPadding(padding) }} {...getAosProps(animationType, animationDuration, animationDelay)}>
      {items.map((item: any, i: number) => (
        <div key={i} style={{ flex: '1 1 120px', textAlign: 'center', padding: '1.25rem', background: 'var(--color-bg-subtle)', borderRadius: 8 }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-primary)', lineHeight: 1 }}>{item.value}</div>
          <div style={{ marginTop: '0.375rem', fontSize: '0.875rem', color: 'var(--color-muted)', fontWeight: 500 }}>{item.label}</div>
        </div>
      ))}
    </div>
  )
}

function FeatureList(props: any) {
  const { items, iconStyle = 'emoji', padding, animationType = 'none', animationDuration = 'normal', animationDelay = 'none' } = props
  if (!items?.length) return <div style={{ color: 'var(--color-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>No features yet — add some in the panel.</div>
  // "glyph" variant: each row leads with a solid teal rounded square holding a
  // white line-icon, with larger serif titles — the concept's "beliefs" rows.
  // "emoji" (default) keeps the original inline emoji + compact title layout so
  // existing FeatureList blocks render unchanged.
  const glyph = iconStyle === 'glyph'
  return (
    <div style={{ marginBottom: '1.5rem', padding: getPadding(padding) }} {...getAosProps(animationType, animationDuration, animationDelay)}>
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
              ? <h3 style={{ margin: '0 0 0.375rem', fontFamily: 'var(--display-family, Georgia, serif)', fontSize: '1.375rem', fontWeight: 500, color: 'var(--color-fg)', lineHeight: 1.2 }}>{item.title}</h3>
              : <h4 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 700, color: 'var(--color-fg)' }}>{item.title}</h4>)}
            {item.description && <p style={{ margin: 0, color: 'var(--color-fg-secondary)', lineHeight: 1.65, fontSize: glyph ? '0.9375rem' : '0.9375rem', maxWidth: glyph ? '48ch' : undefined, whiteSpace: 'pre-wrap' }}>{item.description}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Spec data panel (concept's ".xcard": a windowed table with a dot title-bar
//    and an optional "same price for all" pill on a highlighted row) ──────────
function SpecPanel(props: any) {
  const { title = '', rows = [], boxShadow = 'md', borderRadius = 'lg', padding } = props
  const shadowMap: Record<string, string> = { none: 'none', sm: '0 1px 3px rgba(0,0,0,0.1)', md: '0 4px 12px rgba(0,0,0,0.10)', lg: '0 8px 30px rgba(0,0,0,0.15)' }
  const radiusMap: Record<string, string> = { none: '0', sm: '4px', md: '8px', lg: '16px' }
  return (
    <div style={{ marginBottom: '1.5rem', padding: getPadding(padding) }}>
      <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: radiusMap[borderRadius] ?? '16px', boxShadow: shadowMap[boxShadow] ?? shadowMap.md, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--color-border)', background: 'linear-gradient(90deg, var(--color-primary-subtle, rgba(0,0,0,0.03)), transparent)' }}>
          <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--color-primary)', flexShrink: 0 }} />
          <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--color-border)', flexShrink: 0 }} />
          <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--color-border)', flexShrink: 0 }} />
          {title && <b style={{ marginLeft: 6, fontSize: '0.875rem', color: 'var(--color-fg)' }}>{title}</b>}
        </div>
        <div>
          {rows.map((row: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: '1rem', padding: '12px 20px', borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--color-bg-subtle)', alignItems: 'baseline' }}>
              <span style={{ flex: '0 0 44%', color: 'var(--color-muted)', fontSize: '0.875rem' }}>{row.label}</span>
              <span style={{ flex: '1 1 auto', color: 'var(--color-fg-secondary)', fontSize: '0.875rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                {row.highlight
                  ? <b style={{ color: 'var(--color-primary)', fontSize: '1rem' }}>{row.value}</b>
                  : <span>{row.value}</span>}
                {row.badge && (
                  <span style={{ background: 'color-mix(in srgb, var(--color-success) 12%, transparent)', color: 'var(--color-success)', borderRadius: 9999, padding: '3px 10px', fontSize: '0.75rem', fontWeight: 600 }}>{row.badge}</span>
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
  const { items = [], speed = 'normal' } = props
  const speedMap: Record<string, string> = { slow: '45s', normal: '30s', fast: '20s' }
  if (!items?.length) return <div style={{ color: 'var(--color-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>No ticker phrases yet — add some in the panel.</div>
  const loop = [...items, ...items]
  return (
    <div style={{ background: 'var(--color-primary)', color: 'var(--color-bg)', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', padding: '16px 0', overflow: 'hidden', marginBottom: '1.5rem' }}>
      <div className="cactus-ticker" style={{ animationDuration: speedMap[speed] ?? '30s' }}>
        {loop.map((it: any, i: number) => (
          <span key={i} className="cactus-ticker-item" aria-hidden={i >= items.length ? 'true' : undefined}>{it.text}</span>
        ))}
      </div>
    </div>
  )
}

function Logos(props: any) {
  const { items, logoHeight, justify, padding, animationType = 'none', animationDuration = 'normal', animationDelay = 'none' } = props
  const heights: Record<string, number> = { sm: 32, md: 48, lg: 64 }
  const heightPx = heights[logoHeight] ?? 48
  const justifyMap: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' }
  if (!items?.length) return <div style={{ color: 'var(--color-muted)', fontSize: '0.875rem', padding: getPadding(padding), marginBottom: '1.5rem' }}>No logos added yet — add some in the panel.</div>
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', justifyContent: justifyMap[justify] ?? 'center', alignItems: 'center', padding: getPadding(padding), marginBottom: '1.5rem' }}
      {...getAosProps(animationType, animationDuration, animationDelay)}>
      {items.map((item: any, i: number) => {
        const inner = item.logoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={item.logoUrl} alt={item.alt ?? ''} style={{ height: heightPx, width: 'auto', objectFit: 'contain' }} />
          : <div style={{ height: heightPx, width: 120, background: 'var(--color-bg-subtle)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-muted)', fontSize: '0.75rem' }}>Logo</div>
        return item.href
          ? <a key={i} href={item.href} style={{ display: 'inline-flex', alignItems: 'center' }}>{inner}</a>
          : <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>{inner}</span>
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Site blocks
// ---------------------------------------------------------------------------

function Copyright(props: any) {
  const {
    siteName, prefix = '©', customPrefix = '', yearFormat = 'current', startYear,
    showSiteName = true, suffix = '', alignment = 'left', fontSize = 'small',
    textColor = 'var(--color-muted)',
    privacyPolicyUrl = '', privacyPolicyLabel = 'Privacy Policy',
    termsUrl = '', termsLabel = 'Terms of Service',
    customLink1Url = '', customLink1Label = '', customLink2Url = '', customLink2Label = '',
  } = props
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
  const justifyContent = alignment === 'center' ? 'center' : alignment === 'right' ? 'flex-end' : 'space-between'
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent, gap: '1.5rem', width: '100%' }}>
      <span style={{ color: textColor, fontSize: fontSizes[fontSize] ?? '0.875rem' }}>{parts.join(' ')}</span>
      {links.length > 0 && (
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          {links.map((link) => <a key={link.url} href={link.url} style={{ color: textColor, fontSize: fontSizes[fontSize] ?? '0.875rem', textDecoration: 'none' }}>{link.label}</a>)}
        </div>
      )}
    </div>
  )
}

function MenuBlock(props: any) {
  const { resolvedItems, orientation, spacing, itemFontSize = 'medium', itemFontWeight = 'medium', textTransform = 'none', itemColor, hoverBackground } = props
  if (!resolvedItems) {
    return <div style={{ padding: '0.75rem 1rem', background: 'var(--color-bg-subtle)', borderRadius: 6, color: 'var(--color-muted)', fontSize: '0.875rem' }}>Menu — configure in editor</div>
  }
  const verticalGaps: Record<string, string> = { tight: '0.25rem', normal: '0.5rem', wide: '1rem' }
  const fontSizeMap: Record<string, string> = { small: '0.8125rem', medium: '0.9375rem', large: '1.0625rem' }
  const fontWeightMap: Record<string, string | number> = { normal: 400, medium: 500, semibold: 600, bold: 700 }
  const linkStyleOverride: React.CSSProperties = {}
  if (itemColor) linkStyleOverride.color = itemColor
  if (itemFontSize !== 'medium') linkStyleOverride.fontSize = fontSizeMap[itemFontSize]
  if (itemFontWeight !== 'medium') linkStyleOverride.fontWeight = fontWeightMap[itemFontWeight]
  if (textTransform !== 'none') linkStyleOverride.textTransform = textTransform as React.CSSProperties['textTransform']
  if (orientation === 'vertical') {
    return (
      <nav>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: verticalGaps[spacing] ?? '0.5rem' }}>
          {resolvedItems.map((item: any) => (
            <li key={item.id}>
              <a href={item.href} target={item.openInNewTab ? '_blank' : undefined} rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
                style={{ display: 'block', padding: '0.25rem 0', fontSize: fontSizeMap[itemFontSize] ?? '0.9375rem', fontWeight: fontWeightMap[itemFontWeight] ?? 500, color: itemColor || 'var(--color-fg-secondary)', textDecoration: 'none', ...linkStyleOverride }}>
                {item.label}
              </a>
              {item.children?.length > 0 && (
                <ul style={{ listStyle: 'none', margin: '0.25rem 0 0', padding: '0 0 0 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {item.children.map((child: any) => (
                    <li key={child.id}><a href={child.href} target={child.openInNewTab ? '_blank' : undefined} rel={child.openInNewTab ? 'noopener noreferrer' : undefined} style={{ display: 'block', padding: '0.25rem 0', fontSize: '0.9rem', color: itemColor || 'var(--color-muted)', textDecoration: 'none' }}>{child.label}</a></li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>
    )
  }
  return <MenuBlockClient resolvedItems={resolvedItems} spacing={spacing} itemFontSize={itemFontSize} itemFontWeight={itemFontWeight} textTransform={textTransform} itemColor={itemColor} hoverBackground={hoverBackground} showMobileToggle={props.showMobileToggle} />
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
  const { logoUrl, logoUrlDark, siteName, logoHeight = 40, showTextWithLogo = 'false', showIcon = 'true', textColor, homeUrl = '/' } = props
  const showTextBool = showTextWithLogo === true || showTextWithLogo === 'true'
  const showIconBool = showIcon !== false && showIcon !== 'false'
  const style: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '1.125rem', color: textColor || 'var(--color-fg)', textDecoration: 'none' }
  if (logoUrl) {
    return (
      <a href={homeUrl || '/'} style={style}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={siteName ?? 'Logo'} data-logo-variant={logoUrlDark ? 'light' : undefined} style={{ height: logoHeight, width: 'auto' }} />
        {logoUrlDark && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrlDark} alt={siteName ?? 'Logo'} data-logo-variant="dark" style={{ height: logoHeight, width: 'auto' }} />
        )}
        {showTextBool && siteName && <span>{siteName}</span>}
      </a>
    )
  }
  return (
    <a href={homeUrl || '/'} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG logo asset with known static path; no CDN optimisation needed */}
      {showIconBool && <img src="/cactus.svg" alt="Cactus" style={{ height: 28, width: 28, flexShrink: 0 }} />}
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
    layout:     { title: 'Layout',     components: ['Section', 'Grid', 'Group', 'Split', 'Spacer', 'Divider'], defaultExpanded: true },
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
  components: {
    // ── Layout ──────────────────────────────────────────────────────────────
    Section: {
      label: 'Section',
      fields: {
        content: { type: 'slot' as const },
        bg: { type: 'custom' as const, label: 'Background type', render: SectionBgColorField },
        bgImage: { type: 'text' as const, label: 'Background image URL' },
        bgSize: { type: 'select' as const, label: 'Image size', options: [{ value: 'cover', label: 'Cover' }, { value: 'contain', label: 'Contain' }, { value: 'repeat', label: 'Tile' }] },
        overlayColor: { type: 'custom' as const, label: 'Overlay colour', render: ({ value, onChange }: any) => <SiteColourField value={value} onChange={onChange} /> },
        overlayOpacity: { type: 'number' as const, label: 'Overlay opacity (0–100)' },
        paddingY: { type: 'select' as const, label: 'Vertical padding', options: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }, { value: 'xl', label: 'Extra large' }] },
        maxWidth: { type: 'select' as const, label: 'Content max-width', options: [{ value: 'none', label: 'Full bleed' }, { value: 'narrow', label: 'Narrow (720px)' }, { value: 'standard', label: 'Standard (960px)' }, { value: 'wide', label: 'Wide (1200px)' }] },
        textColor: { type: 'custom' as const, label: 'Text colour override', render: ({ value, onChange }: any) => <SiteColourField value={value} onChange={onChange} /> },
        sticky: { type: 'select' as const, label: 'Sticky', options: [{ value: 'off', label: 'Off' }, { value: 'on', label: 'Stick to top' }] },
        stickyOffset: { type: 'text' as const, label: 'Sticky offset (e.g. 64px)' },
        boxShadow: { type: 'select' as const, label: 'Box shadow', options: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }] },
        borderStyle: { type: 'select' as const, label: 'Border', options: [{ value: 'none', label: 'None' }, { value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }] },
        borderColor: { type: 'text' as const, label: 'Border colour' },
        borderWidth: { type: 'select' as const, label: 'Border width', options: [{ value: '1px', label: '1px' }, { value: '2px', label: '2px' }, { value: '4px', label: '4px' }] },
        borderRadius: { type: 'select' as const, label: 'Border radius', options: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'Small (4px)' }, { value: 'md', label: 'Medium (8px)' }, { value: 'lg', label: 'Large (16px)' }] },
        opacity: { type: 'select' as const, label: 'Opacity', options: [{ value: '100', label: '100%' }, { value: '90', label: '90%' }, { value: '75', label: '75%' }, { value: '50', label: '50%' }] },
        ...aosFields,
      },
      defaultProps: { bg: { mode: 'none', color: '' }, bgImage: '', bgSize: 'cover', overlayColor: '', overlayOpacity: 0, paddingY: 'lg', maxWidth: 'standard', textColor: '', sticky: 'off', stickyOffset: '0px', boxShadow: 'none', borderStyle: 'none', borderColor: 'var(--color-border)', borderWidth: '1px', borderRadius: 'none', opacity: '100', ...aosDefaults },
      render: SectionBlock,
    },
    Grid: {
      label: 'Grid',
      fields: {
        columns: { type: 'select' as const, label: 'Columns', options: [{ value: '2', label: '2 columns' }, { value: '3', label: '3 columns' }, { value: '4', label: '4 columns' }] },
        columnSizes: { type: 'select' as const, label: 'Column widths (2-col)', options: [{ value: 'equal', label: 'Equal' }, { value: 'auto-fill', label: 'Auto + fill' }, { value: 'fill-auto', label: 'Fill + auto' }, { value: '30-70', label: '30 / 70' }, { value: '40-60', label: '40 / 60' }, { value: '60-40', label: '60 / 40' }, { value: '70-30', label: '70 / 30' }] },
        verticalAlign: { type: 'select' as const, label: 'Vertical align', options: [{ value: 'stretch', label: 'Stretch' }, { value: 'start', label: 'Top' }, { value: 'center', label: 'Middle' }, { value: 'end', label: 'Bottom' }] },
        gap: { type: 'select' as const, label: 'Gap', options: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }] },
        padding: paddingField,
        spaceBelow: { type: 'select' as const, label: 'Space below', options: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }] },
        col1Align: { type: 'select' as const, label: 'Col 1 align', options: [{ value: 'start', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'end', label: 'Right' }] },
        col2Align: { type: 'select' as const, label: 'Col 2 align', options: [{ value: 'start', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'end', label: 'Right' }] },
        col3Align: { type: 'select' as const, label: 'Col 3 align', options: [{ value: 'start', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'end', label: 'Right' }] },
        col4Align: { type: 'select' as const, label: 'Col 4 align', options: [{ value: 'start', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'end', label: 'Right' }] },
        col1Width: { type: 'text' as const, label: 'Col 1 width (e.g. 300px, 40%, 2fr - overrides preset)' },
        col2Width: { type: 'text' as const, label: 'Col 2 width (e.g. 300px, 40%, 2fr - overrides preset)' },
        col3Width: { type: 'text' as const, label: 'Col 3 width (e.g. 300px, 40%, 2fr - overrides preset)' },
        col4Width: { type: 'text' as const, label: 'Col 4 width (e.g. 300px, 40%, 2fr - overrides preset)' },
        col1: { type: 'slot' as const }, col2: { type: 'slot' as const }, col3: { type: 'slot' as const }, col4: { type: 'slot' as const },
      },
      defaultProps: { columns: '2', gap: 'md', padding: 'none', columnSizes: 'equal', verticalAlign: 'stretch', spaceBelow: 'md', col1Align: 'start', col2Align: 'start', col3Align: 'start', col4Align: 'start', col1Width: '', col2Width: '', col3Width: '', col4Width: '' },
      render: GridBlock,
    },
    Group: {
      label: 'Group',
      fields: {
        direction: { type: 'select' as const, label: 'Direction', options: [{ value: 'row', label: 'Row' }, { value: 'column', label: 'Column' }] },
        justify: { type: 'select' as const, label: 'Justify content', options: [{ value: 'start', label: 'Start' }, { value: 'center', label: 'Centre' }, { value: 'end', label: 'End' }, { value: 'between', label: 'Space between' }, { value: 'around', label: 'Space around' }, { value: 'evenly', label: 'Space evenly' }] },
        align: { type: 'select' as const, label: 'Align items', options: [{ value: 'start', label: 'Start' }, { value: 'center', label: 'Centre' }, { value: 'end', label: 'End' }, { value: 'stretch', label: 'Stretch' }] },
        wrap: { type: 'select' as const, label: 'Wrap', options: [{ value: 'wrap', label: 'Wrap' }, { value: 'nowrap', label: 'No wrap' }] },
        gap: { type: 'select' as const, label: 'Gap', options: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }] },
        padding: paddingField,
        items: { type: 'slot' as const },
      },
      defaultProps: { direction: 'row', justify: 'start', align: 'stretch', wrap: 'wrap', gap: 'md', padding: 'none' },
      render: GroupBlock,
    },
    Split: {
      label: 'Split',
      fields: {
        ratio:   { type: 'select' as const, label: 'Column ratio', options: [{ value: '50/50', label: '50 / 50' }, { value: '60/40', label: '60 / 40' }, { value: '40/60', label: '40 / 60' }, { value: '70/30', label: '70 / 30' }, { value: '30/70', label: '30 / 70' }] },
        align:   { type: 'select' as const, label: 'Vertical align', options: [{ value: 'stretch', label: 'Stretch' }, { value: 'start', label: 'Top' }, { value: 'center', label: 'Middle' }, { value: 'end', label: 'Bottom' }] },
        gap:     { type: 'select' as const, label: 'Gap', options: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }] },
        padding: paddingField,
      },
      defaultProps: { ratio: '50/50', align: 'stretch', gap: 'md', padding: 'none' },
      render: SplitBlock,
    },
    Spacer: {
      label: 'Space',
      fields: { height: { type: 'select' as const, label: 'Height', options: [{ value: 'xs', label: 'XS (8px)' }, { value: 'sm', label: 'Small (16px)' }, { value: 'md', label: 'Medium (32px)' }, { value: 'lg', label: 'Large (64px)' }, { value: 'xl', label: 'XL (96px)' }] } },
      defaultProps: { height: 'md' as const },
      render: Spacer,
    },
    Divider: {
      label: 'Divider',
      fields: {
        style: { type: 'select' as const, label: 'Line style', options: [{ value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }, { value: 'dotted', label: 'Dotted' }] },
        color: { type: 'select' as const, label: 'Colour', options: [{ value: 'gray', label: 'Gray' }, { value: 'dark', label: 'Dark' }, { value: 'brand', label: 'Brand' }] },
        thickness: { type: 'select' as const, label: 'Thickness', options: [{ value: 'thin', label: 'Thin' }, { value: 'medium', label: 'Medium' }, { value: 'thick', label: 'Thick' }] },
      },
      defaultProps: { style: 'solid' as const, color: 'gray' as const, thickness: 'thin' as const },
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
        align: { type: 'select' as const, label: 'Alignment', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }] },
        color: { type: 'select' as const, label: 'Colour', options: [{ value: 'dark', label: 'Dark' }, { value: 'muted', label: 'Muted' }, { value: 'brand', label: 'Brand' }] },
        highlightText: { type: 'text' as const, label: 'Emphasise word/phrase (recolours it in brand)' },
        highlightMark: { type: 'select' as const, label: 'Emphasis mark', options: [{ value: 'underline', label: 'Highlighter underline' }, { value: 'none', label: 'Colour only' }] },
        padding: paddingField,
        revealAnimation: { type: 'select' as const, label: 'Reveal animation (on load)', options: [{ value: 'none', label: 'None' }, { value: 'stagger-lines', label: 'Stagger lines in' }] },
        ...aosFields,
      },
      defaultProps: { text: 'Section heading', level: 'h2' as const, align: 'left' as const, color: 'dark' as const, highlightText: '', highlightMark: 'underline' as const, padding: 'default', revealAnimation: 'none' as const, ...aosDefaults },
      render: Heading,
    },
    TextBlock: {
      label: 'Text',
      fields: {
        content: { type: 'textarea' as const, label: 'Content' },
        align: { type: 'select' as const, label: 'Alignment', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }] },
        size: { type: 'select' as const, label: 'Text size', options: [{ value: 'base', label: 'Base (1rem)' }, { value: 'md', label: 'Lead (1.125rem)' }, { value: 'lg', label: 'Large (1.25rem)' }] },
        maxWidth: { type: 'select' as const, label: 'Max width', options: [{ value: 'none', label: 'Full width' }, { value: 'prose', label: 'Prose (46ch)' }, { value: 'wide', label: 'Wide (60ch)' }] },
        color: { type: 'select' as const, label: 'Colour', options: [{ value: 'default', label: 'Secondary' }, { value: 'muted', label: 'Muted' }, { value: 'dark', label: 'Dark' }] },
        padding: paddingField,
      },
      defaultProps: { content: 'Enter your text here…', align: 'left' as const, size: 'base' as const, maxWidth: 'none' as const, color: 'default' as const, padding: 'default' },
      render: TextBlock,
    },
    RichTextBlock: {
      label: 'Rich Text',
      fields: { content: { type: 'richtext' as const, label: 'Content' }, padding: paddingField },
      defaultProps: { content: '', padding: 'default' },
      render: RichTextBlock,
    },
    Quote: {
      label: 'Quote',
      fields: { quote: { type: 'textarea' as const, label: 'Quote' }, attribution: { type: 'text' as const, label: 'Attribution' }, padding: paddingField, ...aosFields },
      defaultProps: { quote: 'Enter a quote here…', attribution: '', padding: 'default', ...aosDefaults },
      render: Quote,
    },
    Caption: {
      label: 'Caption',
      fields: {
        text: { type: 'text' as const, label: 'Text' },
        align: { type: 'select' as const, label: 'Alignment', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }] },
        padding: paddingField,
      },
      defaultProps: { text: 'Caption text', align: 'left' as const, padding: 'default' },
      render: Caption,
    },

    // ── Actions ──────────────────────────────────────────────────────────────
    ButtonLink: {
      label: 'Button',
      fields: {
        label: { type: 'text' as const, label: 'Label' }, href: { type: 'text' as const, label: 'URL' },
        variant: { type: 'select' as const, label: 'Style', options: [{ value: 'primary', label: 'Primary' }, { value: 'secondary', label: 'Secondary' }, { value: 'outline', label: 'Outline' }] },
        padding: paddingField,
      },
      defaultProps: { label: 'Click here', href: '#', variant: 'primary' as const, padding: 'default' },
      render: ButtonLink,
    },
    CTABanner: {
      label: 'CTA Banner',
      fields: {
        heading: { type: 'text' as const, label: 'Heading' }, subtext: { type: 'textarea' as const, label: 'Sub-text' },
        ctaLabel: { type: 'text' as const, label: 'Button label' }, ctaHref: { type: 'text' as const, label: 'Button URL' },
        background: { type: 'select' as const, label: 'Background', options: [{ value: 'light', label: 'Light' }, { value: 'white', label: 'White (bordered)' }, { value: 'brand', label: 'Brand colour' }] },
        padding: paddingField, ...aosFields,
      },
      defaultProps: { heading: 'Ready to get started?', subtext: '', ctaLabel: 'Get in touch', ctaHref: '#', background: 'light' as const, padding: 'none', ...aosDefaults },
      render: CTABanner,
    },

    // ── Media ────────────────────────────────────────────────────────────────
    ImageBlock: {
      label: 'Image',
      fields: { mediaUrl: { type: 'text' as const, label: 'Image URL' }, mediaId: { type: 'text' as const, label: 'Media ID' }, alt: { type: 'text' as const, label: 'Alt text' }, caption: { type: 'text' as const, label: 'Caption' }, padding: paddingField, ...aosFields },
      defaultProps: { mediaUrl: '', mediaId: '', alt: '', caption: '', padding: 'default', ...aosDefaults },
      render: ImageBlock,
    },
    VideoEmbed: {
      label: 'Video',
      fields: { url: { type: 'text' as const, label: 'Video URL (YouTube / Vimeo)' }, title: { type: 'text' as const, label: 'Title (accessibility)' }, aspectRatio: { type: 'select' as const, label: 'Aspect ratio', options: [{ value: '16:9', label: '16:9' }, { value: '4:3', label: '4:3' }, { value: '1:1', label: 'Square' }] }, padding: paddingField },
      defaultProps: { url: '', title: '', aspectRatio: '16:9' as const, padding: 'default' },
      render: VideoEmbed,
    },
    Embed: {
      label: 'Embed',
      fields: { src: { type: 'text' as const, label: 'URL to embed' }, height: { type: 'text' as const, label: 'Height (e.g. 400px)' }, title: { type: 'text' as const, label: 'Title (accessibility)' }, padding: paddingField },
      defaultProps: { src: '', height: '400px', title: '', padding: 'default' },
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
        overlayColor: { type: 'custom' as const, label: 'Overlay colour', render: ({ value, onChange }: any) => <SiteColourField value={value} onChange={onChange} /> }, overlayOpacity: { type: 'number' as const, label: 'Overlay opacity (0–100)' },
        layout: { type: 'select' as const, label: 'Layout', options: [{ value: 'centered', label: 'Centred text' }, { value: 'left', label: 'Left-aligned text' }, { value: 'right-image', label: 'Text + image (right)' }] },
        imageUrl: { type: 'text' as const, label: 'Side image URL (right-image layout)' },
        textScheme: { type: 'select' as const, label: 'Text colour', options: [{ value: 'dark', label: 'Dark (for light backgrounds)' }, { value: 'light', label: 'Light (for dark backgrounds)' }] },
        minHeight: { type: 'select' as const, label: 'Min height', options: [{ value: 'auto', label: 'Auto' }, { value: 'half', label: '50vh' }, { value: 'full', label: 'Full screen (100vh)' }] },
        padding: paddingField, ...aosFields,
      },
      defaultProps: { heading: 'Welcome', subheading: '', ctaLabel: '', ctaHref: '', cta2Label: '', cta2Href: '', cta2Variant: 'outline', bg: { mode: 'gradient', color: '' }, bgImage: '', overlayColor: '', overlayOpacity: 0, layout: 'centered', imageUrl: '', textScheme: 'dark', minHeight: 'auto', padding: 'none', ...aosDefaults },
      render: Hero,
    },
    Card: {
      label: 'Card',
      fields: { mediaUrl: { type: 'text' as const, label: 'Image URL' }, mediaId: { type: 'text' as const, label: 'Media ID' }, alt: { type: 'text' as const, label: 'Alt text' }, heading: { type: 'text' as const, label: 'Heading' }, body: { type: 'textarea' as const, label: 'Body text' }, ctaLabel: { type: 'text' as const, label: 'Button label' }, ctaHref: { type: 'text' as const, label: 'Button URL' }, padding: paddingField, ...aosFields },
      defaultProps: { mediaUrl: '', mediaId: '', alt: '', heading: 'Card heading', body: '', ctaLabel: '', ctaHref: '', padding: 'none', ...aosDefaults },
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
        borderColor: { type: 'text' as const, label: 'Border colour' },
        borderWidth: { type: 'select' as const, label: 'Border width', options: [{ value: '1px', label: '1px' }, { value: '2px', label: '2px' }, { value: '4px', label: '4px' }] },
        borderRadius: { type: 'select' as const, label: 'Border radius', options: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'Small (4px)' }, { value: 'md', label: 'Medium (8px)' }, { value: 'lg', label: 'Large (16px)' }] },
        framePadding: { type: 'select' as const, label: 'Frame padding (blueprint gutter)', options: [{ value: 'none', label: 'None (image fills panel)' }, { value: 'sm', label: 'Small (16px)' }, { value: 'md', label: 'Medium (30px)' }, { value: 'lg', label: 'Large (44px)' }] },
        frameBg: { type: 'select' as const, label: 'Panel background', options: [{ value: 'none', label: 'None' }, { value: 'subtle', label: 'Subtle fill' }, { value: 'gradient', label: 'Gradient' }] },
        gridPattern: { type: 'select' as const, label: 'Blueprint grid', options: [{ value: 'none', label: 'Off' }, { value: 'subtle', label: 'On' }] },
        scanEffect: { type: 'select' as const, label: 'Scan sheen (animated)', options: [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }] },
        padding: paddingField,
      },
      defaultProps: {
        mediaUrl: '', alt: '',
        chips: [{ label: 'Label', value: 'Detail text', position: 'top-right' as const, animationType: 'none' as const, animationDelay: 'none' as const }],
        boxShadow: 'md' as const, borderStyle: 'solid' as const, borderColor: 'var(--color-border)', borderWidth: '1px' as const, borderRadius: 'lg' as const,
        framePadding: 'none' as const, frameBg: 'none' as const, gridPattern: 'none' as const, scanEffect: 'off' as const,
        padding: 'none',
      },
      render: ImageChipPanel,
    },
    Callout: {
      label: 'Callout',
      fields: { type: { type: 'select' as const, label: 'Type', options: [{ value: 'info', label: 'Info' }, { value: 'success', label: 'Success' }, { value: 'warning', label: 'Warning' }, { value: 'error', label: 'Error' }] }, title: { type: 'text' as const, label: 'Title' }, body: { type: 'textarea' as const, label: 'Body' }, padding: paddingField },
      defaultProps: { type: 'info' as const, title: '', body: 'Notice text here…', padding: 'none' },
      render: Callout,
    },
    Badge: {
      label: 'Badge',
      fields: { label: { type: 'text' as const, label: 'Label' }, color: { type: 'select' as const, label: 'Colour', options: [{ value: 'primary', label: 'Brand' }, { value: 'blue', label: 'Blue' }, { value: 'yellow', label: 'Yellow' }, { value: 'red', label: 'Red' }, { value: 'gray', label: 'Gray' }] }, padding: paddingField },
      defaultProps: { label: 'New', color: 'primary' as const, padding: 'default' },
      render: Badge,
    },
    Eyebrow: {
      label: 'Eyebrow',
      fields: {
        text: { type: 'text' as const, label: 'Text' },
        showPulse: { type: 'select' as const, label: 'Pulsing dot', options: [{ value: 'false', label: 'No' }, { value: 'true', label: 'Yes' }] },
        padding: paddingField,
      },
      defaultProps: { text: 'New', showPulse: 'false', padding: 'default' },
      render: Eyebrow,
    },
    Trustline: {
      label: 'Trust Row',
      fields: {
        items: { type: 'array' as const, label: 'Items', getItemSummary: (item: { text?: string }) => item.text || 'Item', arrayFields: { icon: { type: 'select' as const, label: 'Icon', options: [{ value: 'check', label: 'Checkmark' }, { value: 'truck', label: 'Delivery' }, { value: 'shield', label: 'Shield' }, { value: 'clock', label: 'Clock' }, { value: 'star', label: 'Star' }, { value: 'tag', label: 'Price tag' }] }, text: { type: 'text' as const, label: 'Text' } }, defaultItemProps: { icon: 'check', text: 'Reassurance point' } },
        gap: { type: 'select' as const, label: 'Gap', options: [{ value: 'tight', label: 'Tight' }, { value: 'normal', label: 'Normal' }, { value: 'wide', label: 'Wide' }] },
        padding: paddingField,
      },
      defaultProps: { items: [{ icon: 'check', text: 'Reassurance point' }], gap: 'normal' as const, padding: 'default' },
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
      fields: { items: { type: 'array' as const, label: 'Items', getItemSummary: (item: { question?: string }) => item.question || 'Question', arrayFields: { question: { type: 'text' as const, label: 'Question' }, answer: { type: 'textarea' as const, label: 'Answer' } }, defaultItemProps: { question: 'What is the question?', answer: 'This is the answer.' } }, padding: paddingField },
      defaultProps: { items: [{ question: 'What is the question?', answer: 'This is the answer.' }], padding: 'default' },
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
      },
      defaultProps: {
        title: 'Product record',
        rows: [
          { label: 'Price', value: '£249.00', highlight: 'true', badge: '✓ same for every buyer' },
          { label: 'Lead time', value: '3 to 5 working days', highlight: '', badge: '' },
        ],
        boxShadow: 'md' as const, borderRadius: 'lg' as const, padding: 'none',
      },
      render: SpecPanel,
    },
    Ticker: {
      label: 'Ticker',
      fields: {
        items: { type: 'array' as const, label: 'Phrases', getItemSummary: (item: { text?: string }) => item.text || 'Phrase', arrayFields: { text: { type: 'text' as const, label: 'Text' } }, defaultItemProps: { text: 'A short phrase' } },
        speed: { type: 'select' as const, label: 'Speed', options: [{ value: 'slow', label: 'Slow' }, { value: 'normal', label: 'Normal' }, { value: 'fast', label: 'Fast' }] },
      },
      defaultProps: { items: [{ text: 'One price for all' }, { text: 'Every answer on the page' }, { text: 'Direct from supplier to door' }], speed: 'normal' as const },
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
      fields: { items: { type: 'array' as const, label: 'Logos', getItemSummary: (item: { alt?: string }) => item.alt || 'Logo', arrayFields: { logoUrl: { type: 'text' as const, label: 'Logo URL' }, alt: { type: 'text' as const, label: 'Alt text' }, href: { type: 'text' as const, label: 'Link URL' } }, defaultItemProps: { logoUrl: '', alt: 'Company name', href: '' } }, logoHeight: { type: 'select' as const, label: 'Logo height', options: [{ value: 'sm', label: 'Small (32px)' }, { value: 'md', label: 'Medium (48px)' }, { value: 'lg', label: 'Large (64px)' }] }, justify: { type: 'select' as const, label: 'Alignment', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }] }, padding: paddingField, ...aosFields },
      defaultProps: { items: [{ logoUrl: '', alt: 'Partner logo', href: '' }], logoHeight: 'md' as const, justify: 'center' as const, padding: 'default', ...aosDefaults },
      render: Logos,
    },
    SocialLinks: {
      label: 'Social Links',
      fields: {
        items: { type: 'array' as const, label: 'Links', getItemSummary: (item: { platform?: string }) => item.platform || 'Link', arrayFields: { platform: { type: 'select' as const, label: 'Platform', options: [{ value: 'twitter-x', label: 'Twitter / X' }, { value: 'instagram', label: 'Instagram' }, { value: 'facebook', label: 'Facebook' }, { value: 'linkedin', label: 'LinkedIn' }, { value: 'youtube', label: 'YouTube' }, { value: 'github', label: 'GitHub' }, { value: 'tiktok', label: 'TikTok' }] }, url: { type: 'text' as const, label: 'URL' } }, defaultItemProps: { platform: 'twitter-x', url: '' } },
        iconSize: { type: 'select' as const, label: 'Icon size', options: [{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }] },
        iconColor: { type: 'text' as const, label: 'Icon colour (hex/CSS)' },
        layout: { type: 'select' as const, label: 'Layout', options: [{ value: 'row', label: 'Row' }, { value: 'column', label: 'Column' }] },
        gap: { type: 'select' as const, label: 'Gap', options: [{ value: 'tight', label: 'Tight' }, { value: 'normal', label: 'Normal' }, { value: 'wide', label: 'Wide' }] },
        padding: paddingField,
      },
      defaultProps: { items: [{ platform: 'twitter-x', url: '' }], iconSize: 'md', iconColor: '', layout: 'row', gap: 'normal', padding: 'default' },
      render: SocialLinks,
    },

    // ── Site ─────────────────────────────────────────────────────────────────
    SiteLogo: {
      label: 'Site Logo',
      fields: { homeUrl: { type: 'text' as const, label: 'Link URL (default: /)' }, logoHeight: { type: 'number' as const, label: 'Logo height (px)' }, showTextWithLogo: { type: 'select' as const, label: 'Show site name with image', options: [{ value: 'false', label: 'Image only' }, { value: 'true', label: 'Image + name' }] }, showIcon: { type: 'select' as const, label: 'Show cactus icon (text logo)', options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] }, textColor: { type: 'text' as const, label: 'Text colour' } },
      defaultProps: { homeUrl: '/', logoHeight: 40, showTextWithLogo: 'false', showIcon: 'true', textColor: '' },
      render: SiteLogoClient,
    },
    Copyright: {
      label: 'Copyright',
      fields: {
        prefix: { type: 'select' as const, label: 'Copyright symbol', options: [{ value: '©', label: '©' }, { value: 'Copyright', label: 'Copyright (word)' }, { value: 'none', label: 'None' }, { value: 'custom', label: 'Custom…' }] },
        customPrefix: { type: 'text' as const, label: 'Custom prefix' }, yearFormat: { type: 'select' as const, label: 'Year', options: [{ value: 'current', label: 'Current year' }, { value: 'range', label: 'Year range' }, { value: 'none', label: 'No year' }] },
        startYear: { type: 'number' as const, label: 'Range start year' }, showSiteName: { type: 'select' as const, label: 'Show site name', options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] },
        suffix: { type: 'text' as const, label: 'Suffix text' }, alignment: { type: 'select' as const, label: 'Alignment', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }] },
        fontSize: { type: 'select' as const, label: 'Font size', options: [{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }] },
        textColor: { type: 'text' as const, label: 'Text colour' },
        privacyPolicyUrl: { type: 'text' as const, label: 'Privacy Policy URL' }, privacyPolicyLabel: { type: 'text' as const, label: 'Privacy Policy label' },
        termsUrl: { type: 'text' as const, label: 'Terms URL' }, termsLabel: { type: 'text' as const, label: 'Terms label' },
        customLink1Url: { type: 'text' as const, label: 'Extra link 1 URL' }, customLink1Label: { type: 'text' as const, label: 'Extra link 1 label' },
        customLink2Url: { type: 'text' as const, label: 'Extra link 2 URL' }, customLink2Label: { type: 'text' as const, label: 'Extra link 2 label' },
      },
      defaultProps: { prefix: '©', customPrefix: '', yearFormat: 'current', startYear: new Date().getFullYear(), showSiteName: 'true', suffix: '', alignment: 'left', fontSize: 'small', textColor: 'var(--color-muted)', privacyPolicyUrl: '', privacyPolicyLabel: 'Privacy Policy', termsUrl: '', termsLabel: 'Terms of Service', customLink1Url: '', customLink1Label: '', customLink2Url: '', customLink2Label: '' },
      render: Copyright,
    },
    MenuBlock: {
      label: 'Menu',
      fields: {
        menuId: { type: 'text' as const, label: 'Menu ID' }, menuName: { type: 'text' as const, label: 'Menu name (display)' },
        orientation: { type: 'select' as const, label: 'Orientation', options: [{ value: 'horizontal', label: 'Horizontal' }, { value: 'vertical', label: 'Vertical' }] },
        spacing: { type: 'select' as const, label: 'Item spacing', options: [{ value: 'tight', label: 'Tight' }, { value: 'normal', label: 'Normal' }, { value: 'wide', label: 'Wide' }] },
        itemFontSize: { type: 'select' as const, label: 'Font size', options: [{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }] },
        itemFontWeight: { type: 'select' as const, label: 'Font weight', options: [{ value: 'normal', label: 'Normal' }, { value: 'medium', label: 'Medium' }, { value: 'semibold', label: 'Semibold' }, { value: 'bold', label: 'Bold' }] },
        textTransform: { type: 'select' as const, label: 'Text transform', options: [{ value: 'none', label: 'None' }, { value: 'uppercase', label: 'UPPERCASE' }, { value: 'capitalize', label: 'Capitalize' }, { value: 'lowercase', label: 'lowercase' }] },
        itemColor: { type: 'text' as const, label: 'Link colour' },
        showDropdowns: { type: 'select' as const, label: 'Dropdowns open on', options: [{ value: 'hover', label: 'Hover' }, { value: 'click', label: 'Click' }] },
        showMobileToggle: { type: 'select' as const, label: 'Mobile behaviour', options: [{ value: 'collapse', label: 'Collapse to hamburger' }, { value: 'show', label: 'Always show' }] },
      },
      defaultProps: { menuId: '', menuName: '', orientation: 'horizontal' as const, spacing: 'normal' as const, itemFontSize: 'medium' as const, itemFontWeight: 'medium' as const, textTransform: 'none' as const, itemColor: '', showDropdowns: 'hover', showMobileToggle: 'collapse' },
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
      fields: {},
      defaultProps: {},
      render: () => <ThemeToggleClient />,
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
        itemFontSize:     { type: 'select' as const, label: 'Nav font size', options: [{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }] },
        itemFontWeight:   { type: 'select' as const, label: 'Nav font weight', options: [{ value: 'normal', label: 'Normal' }, { value: 'medium', label: 'Medium' }, { value: 'semibold', label: 'Semibold' }, { value: 'bold', label: 'Bold' }] },
        itemColor:        { type: 'custom' as const, label: 'Nav link colour', render: ({ value, onChange }: any) => <SiteColourField value={value} onChange={onChange} /> },
        showMobileToggle: { type: 'select' as const, label: 'Mobile nav', options: [{ value: 'collapse', label: 'Collapse to hamburger' }, { value: 'show', label: 'Always show' }] },
      },
      defaultProps: {
        bg: { mode: 'color', color: '' }, height: '64px', sticky: 'yes',
        border: { show: 'show', color: '' }, maxWidth: '1200px',
        logoHeight: 40, showTextWithLogo: 'false', logoHomeUrl: '/',
        itemFontSize: 'medium', itemFontWeight: 'medium', itemColor: '', showMobileToggle: 'collapse',
      },
      render: SiteHeaderBlock,
    },
    ...moduleComponents,
  },
} satisfies Config

export default puckConfig
export type PuckConfig = typeof puckConfig

// ---------------------------------------------------------------------------
// Footer Puck config — used in Appearance > Footer editor
// ---------------------------------------------------------------------------

export const footerPuckConfig = {
  categories: {
    site:       { title: 'Site',       components: ['SiteLogo', 'Copyright', 'MenuBlock', 'SocialLinks', 'ButtonLink', 'CookieSettingsLink'], defaultExpanded: true },
    layout:     { title: 'Layout',     components: ['Grid', 'Group', 'Split', 'Spacer', 'Divider'], defaultExpanded: false },
    typography: { title: 'Typography', components: ['Heading', 'TextBlock', 'RichTextBlock'], defaultExpanded: false },
  },
  root: {
    fields: {
      bgColor:    { type: 'custom' as const, label: 'Background colour', render: ({ value, onChange }: any) => <SiteColourField value={value} onChange={onChange} /> },
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
    Grid:                puckConfig.components.Grid,
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
    layout:     { title: 'Structure',  components: ['ContentSlot', 'Section', 'Grid', 'Group', 'Split', 'Spacer', 'Divider'], defaultExpanded: true },
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

const headerRootRender = ({ children, bg = { mode: 'color', color: '' }, height = '64px', sticky = 'yes', border = { show: 'show', color: '' }, maxWidth = '1200px' }: any) => {
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
  return (
    <header
      data-bg-mode={bgMode}
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
            axis instead of spanning the header, so it must be forced full-width here. */}
        <div style={{ width: '100%' }}>{children}</div>
      </div>
    </header>
  )
}

// Module blocks that opted into the header via `layoutTypes: ["header"]` in their
// manifest (e.g. the shop's cart-summary widget). Lets a module contribute chrome
// blocks to the header editor without any module-specific code living in core —
// same reserved-key mechanism getConfig already uses for 'header' as a layout type.
const headerModuleBlocks = moduleComponentsByLayoutType['header'] ?? {}

export const headerPuckConfig = {
  categories: {
    site:   { title: 'Site',      components: ['SiteLogo', 'MenuBlock', 'LoginButton', 'ThemeToggle', 'MembersAccountLink'], defaultExpanded: true },
    layout: { title: 'Structure', components: ['Grid', 'Group', 'Spacer'], defaultExpanded: true },
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
    },
    defaultProps: { bg: { mode: 'color', color: '' }, height: '64px', sticky: 'yes', border: { show: 'show', color: '' }, maxWidth: '1200px' },
    render: headerRootRender,
  },
  components: {
    SiteLogo:     puckConfig.components.SiteLogo,
    MenuBlock:    puckConfig.components.MenuBlock,
    LoginButton:  puckConfig.components.LoginButton,
    ThemeToggle:  puckConfig.components.ThemeToggle,
    MembersAccountLink: puckConfig.components.MembersAccountLink,
    Grid:         puckConfig.components.Grid,
    Group:        puckConfig.components.Group,
    Spacer:       puckConfig.components.Spacer,
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
