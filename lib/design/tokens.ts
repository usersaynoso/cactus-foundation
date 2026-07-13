import { setResponsiveBreakpoints } from '@/lib/puck/responsiveValue'

export type Typo = {
  family?: string
  weight?: string
  size?: string
  lineHeight?: string
  letterSpacing?: string
  transform?: string
  style?: string
  decoration?: string
}

export type GlobalColour = { id: string; name: string; light: string; dark: string }

export type GlobalFont = {
  id: string
  name: string
  family: string
  weight: string
  size?: string
  lineHeight?: string
  letterSpacing?: string
  transform?: string
  style?: string
  decoration?: string
}

// Every colour has an optional `*Dark` sibling: the dark-mode override. When
// unset, dark mode inherits the light value (buildTokenStyles only redefines the
// CSS var in the dark blocks when an override exists), so old rows stay valid.
type HeadingStyle = Typo & { colour?: string; colourDark?: string }

// One accent colour per status; background and title tints are derived from it
// per mode by statusVars, so owners pick a single colour per box type.
export type StatusColour = { colour?: string; colourDark?: string }
export type StatusKey = 'info' | 'success' | 'warning' | 'error'

// Colours for the ButtonLink block's secondary/outline variants. Shape mirrors
// the top-level buttons colour fields (which style the 'primary' variant).
// Optional and per-field-optional throughout: unset falls back to the
// variant's original behaviour (deriving from --color-primary), so old rows
// and unstyled sites render identically.
export type ButtonVariantStyle = {
  textColour?: string; bgColour?: string; borderColour?: string
  textColourDark?: string; bgColourDark?: string; borderColourDark?: string
  hover?: { textColour?: string; bgColour?: string; textColourDark?: string; bgColourDark?: string }
}

// Colours for the Badge block's non-brand colour options ('primary' already
// reuses --color-primary-subtle). Unset keys keep the block's original
// hardcoded pastel hexes.
export type BadgeColourKey = 'blue' | 'yellow' | 'red' | 'gray'
export type BadgeStyle = { bg?: string; text?: string; bgDark?: string; textDark?: string }
export const BADGE_COLOUR_KEYS: BadgeColourKey[] = ['blue', 'yellow', 'red', 'gray']

export type DesignTokens = {
  version: 2
  designSystem: {
    colours: GlobalColour[]
    fonts: GlobalFont[]
  }
  themeStyle: {
    background: { colour?: string; colourDark?: string }
    body: Typo & { colour?: string; colourDark?: string }
    // Optional - added after initial launch, so older stored rows (and the
    // fresh-install default before a Styles save) may not have these keys.
    // Always read via `ts?.display`/`ts?.caption`, never assume presence.
    display?: HeadingStyle
    caption?: HeadingStyle
    links: { colour?: string; hoverColour?: string; colourDark?: string; hoverColourDark?: string }
    // Optional - added after initial launch, so older stored rows may lack it.
    // Accent colours for the info/success/warning/error Callout boxes; read via
    // `ts?.status`, never assume presence.
    status?: Partial<Record<StatusKey, StatusColour>>
    headings: {
      h1: HeadingStyle; h2: HeadingStyle; h3: HeadingStyle
      h4: HeadingStyle; h5: HeadingStyle; h6: HeadingStyle
    }
    // Optional - added after initial launch, read via `ts?.headingsFont`.
    // Font family applied to every heading level (and Display); a per-level
    // family set below still wins over it.
    headingsFont?: string
    buttons: {
      typo: Typo
      // Styles the ButtonLink block's 'primary' variant.
      textColour?: string; bgColour?: string; borderColour?: string
      textColourDark?: string; bgColourDark?: string; borderColourDark?: string
      borderWidth?: string; borderRadius?: string; padding?: string
      hover: { textColour?: string; bgColour?: string; textColourDark?: string; bgColourDark?: string }
      // Optional - added after initial launch, read via `ts?.buttons.secondary`/
      // `.outline`. Style the ButtonLink block's other two variants
      // independently of 'primary'. Unset falls back to each variant's
      // original derived-from---color-primary look, so old rows are unaffected.
      secondary?: ButtonVariantStyle
      outline?: ButtonVariantStyle
    }
    images: { borderRadius?: string; borderColour?: string; borderColourDark?: string; borderWidth?: string }
    formFields: {
      typo: Typo
      textColour?: string; bgColour?: string; borderColour?: string; borderRadius?: string
      textColourDark?: string; bgColourDark?: string; borderColourDark?: string
      labelTypo: Typo; labelColour?: string; labelColourDark?: string
    }
    // Optional - added after initial launch, read via `ts?.badges`. Colours
    // for the Badge block's blue/yellow/red/gray options ('primary' already
    // reuses --color-primary-subtle so isn't listed here). Unset keys keep
    // the block's original hardcoded pastel hexes.
    badges?: Partial<Record<BadgeColourKey, BadgeStyle>>
    // Optional - corner radius for the Badge and Eyebrow blocks' pill shape.
    // Unset keeps the original hardcoded 9999px (fully round).
    pillRadius?: string
    spacing?: {
      // Default left/right gutter applied to content blocks on public pages, so
      // they don't run to the screen edges. Emitted as --block-padding.
      blockPadding?: string
      // Screen widths where Grid/Split blocks collapse to fewer columns. Media
      // queries can't read CSS custom properties, so these are baked into literal
      // @media rules in buildTokenStyles rather than emitted as vars. When unset,
      // buildTokenStyles falls back to the defaults below (see DEFAULT_DESIGN_TOKENS).
      tabletBreakpoint?: string
      mobileBreakpoint?: string
    }
  }
}

export const DEFAULT_DESIGN_TOKENS: DesignTokens = {
  version: 2,
  designSystem: {
    colours: [
      { id: 'primary',   name: 'Primary',   light: '#2c7558', dark: '#459578' },
      { id: 'secondary', name: 'Secondary', light: '#ffffff', dark: '#0f172a' },
    ],
    fonts: [
      { id: 'primary', name: 'Primary', family: 'system-ui, sans-serif', weight: '400' },
    ],
  },
  themeStyle: {
    background: {},
    body: { size: '1rem', lineHeight: '1.75' },
    display: { size: '3rem' },
    caption: { size: '0.75rem' },
    links: { colour: '#2c7558', hoverColour: '#22604a' },
    // Accents match the Callout block's original built-in hexes, with brighter
    // dark-mode siblings so the boxes read on a dark page background.
    status: {
      info:    { colour: '#3b82f6', colourDark: '#60a5fa' },
      success: { colour: '#16a34a', colourDark: '#4ade80' },
      warning: { colour: '#f59e0b', colourDark: '#fbbf24' },
      error:   { colour: '#ef4444', colourDark: '#f87171' },
    },
    headings: {
      h1: { size: '2.5rem' },
      h2: { size: '1.875rem' },
      h3: { size: '1.5rem' },
      h4: { size: '1.25rem' },
      h5: { size: '1.125rem' },
      h6: { size: '1rem' },
    },
    buttons: { typo: {}, hover: {} },
    images: {},
    formFields: { typo: {}, labelTypo: {} },
    spacing: { blockPadding: '1.5rem', tabletBreakpoint: '1024px', mobileBreakpoint: '640px' },
  },
}

// Resolve the site's responsive breakpoints (Styles > Spacing & Breakpoints),
// falling back to the single DEFAULT_DESIGN_TOKENS source when unset. The one
// place breakpoint widths are derived - shared by buildTokenStyles (core Grid/
// Split, nav, visibility utilities) and by modules that bake their own @media
// rules (e.g. the shop grids), so nothing hardcodes a breakpoint literal.
// Media queries can't read CSS custom properties, so the value has to be baked
// into the rule at generation time; callers interpolate these strings directly.
export function resolveBreakpoints(tokens: unknown): { tabletBp: string; mobileBp: string } {
  const t = (tokens && typeof tokens === 'object' ? tokens : {}) as Partial<DesignTokens>
  const sp = t.themeStyle?.spacing
  const def = DEFAULT_DESIGN_TOKENS.themeStyle.spacing!
  return {
    tabletBp: sp?.tabletBreakpoint || def.tabletBreakpoint!,
    mobileBp: sp?.mobileBreakpoint || def.mobileBreakpoint!,
  }
}

export type ColourPreset = {
  id: string
  name: string
  primary: { light: string; dark: string }
  linkColour: string
  linkHoverColour: string
  // Dark-mode link colours. Applying a preset seeds links.colourDark /
  // hoverColourDark too, so the scheme looks right in dark mode without the
  // owner hand-picking overrides. Brighter than the light pair to read on a
  // dark background (link ≈ primary.dark, hover a touch lighter again).
  linkColourDark: string
  linkHoverColourDark: string
}

export const COLOUR_PRESETS: ColourPreset[] = [
  {
    id: 'prickly',
    name: 'Prickly',
    primary: { light: '#2c7558', dark: '#459578' },
    linkColour: '#2c7558',
    linkHoverColour: '#22604a',
    linkColourDark: '#459578',
    linkHoverColourDark: '#67a890',
  },
  {
    id: 'bloom',
    name: 'Bloom',
    primary: { light: '#db2777', dark: '#f472b6' },
    linkColour: '#db2777',
    linkHoverColour: '#be185d',
    linkColourDark: '#f472b6',
    linkHoverColourDark: '#f68bc3',
  },
  {
    id: 'desert',
    name: 'Desert',
    primary: { light: '#c2410c', dark: '#fb923c' },
    linkColour: '#c2410c',
    linkHoverColour: '#9a3412',
    linkColourDark: '#fb923c',
    linkHoverColourDark: '#fca65f',
  },
  {
    id: 'dusk',
    name: 'Dusk',
    primary: { light: '#4f46e5', dark: '#818cf8' },
    linkColour: '#4f46e5',
    linkHoverColour: '#4338ca',
    linkColourDark: '#818cf8',
    linkHoverColourDark: '#98a1f9',
  },
  {
    id: 'spine',
    name: 'Spine',
    primary: { light: '#0d9488', dark: '#2dd4bf' },
    linkColour: '#0d9488',
    linkHoverColour: '#0f766e',
    linkColourDark: '#2dd4bf',
    linkHoverColourDark: '#53dccb',
  },
  {
    id: 'mirage',
    name: 'Mirage',
    primary: { light: '#7c3aed', dark: '#a78bfa' },
    linkColour: '#7c3aed',
    linkHoverColour: '#6d28d9',
    linkColourDark: '#a78bfa',
    linkHoverColourDark: '#b7a0fb',
  },
  {
    id: 'ember',
    name: 'Ember',
    primary: { light: '#dc2626', dark: '#f87171' },
    linkColour: '#dc2626',
    linkHoverColour: '#b91c1c',
    linkColourDark: '#f87171',
    linkHoverColourDark: '#f98b8b',
  },
  {
    id: 'mesa',
    name: 'Mesa',
    primary: { light: '#d97706', dark: '#fbbf24' },
    linkColour: '#d97706',
    linkHoverColour: '#b45309',
    linkColourDark: '#fbbf24',
    linkHoverColourDark: '#fccb4b',
  },
  {
    id: 'monsoon',
    name: 'Monsoon',
    primary: { light: '#0284c7', dark: '#38bdf8' },
    linkColour: '#0284c7',
    linkHoverColour: '#0369a1',
    linkColourDark: '#38bdf8',
    linkHoverColourDark: '#5cc9f9',
  },
  {
    id: 'sagebrush',
    name: 'Sagebrush',
    primary: { light: '#4d7c0f', dark: '#84cc16' },
    linkColour: '#4d7c0f',
    linkHoverColour: '#3f6212',
    linkColourDark: '#84cc16',
    linkHoverColourDark: '#9ad540',
  },
]

const SPACING_STEPS = [1, 2, 3, 4, 6, 8, 12, 16, 24]

// --- Colour helpers: derive a coherent primary palette from a single hex ---

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  let h = m[1] as string
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

// Mix a hex colour towards white (ratio>0 lightens) or black, by ratio 0..1.
function mixTowards(hex: string, target: 0 | 255, ratio: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  const [r, g, b] = rgb
  return toHex(r + (target - r) * ratio, g + (target - g) * ratio, b + (target - b) * ratio)
}

const darken  = (hex: string, ratio: number) => mixTowards(hex, 0, ratio)
const lighten = (hex: string, ratio: number) => mixTowards(hex, 255, ratio)

// Pick a legible foreground for a given background, using WCAG relative luminance.
function onColour(hex: string): string {
  const rgb = parseHex(hex)
  if (!rgb) return '#ffffff'
  const linear = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const luminance = 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2])
  return luminance > 0.4 ? '#111111' : '#ffffff'
}

// Emit the semantic --color-primary family the app actually consumes, derived
// from the primary design colour. Light mode darkens for hover/active; dark
// mode lightens. Falls back to just --color-primary if the value isn't hex.
function primaryVars(hex: string, mode: 'light' | 'dark'): string {
  const parts = [`--color-primary: ${hex};`]
  const rgb = parseHex(hex)
  if (!rgb) return parts.join(' ')
  if (mode === 'light') {
    parts.push(`--color-primary-hover: ${darken(hex, 0.12)};`)
    parts.push(`--color-primary-active: ${darken(hex, 0.22)};`)
    parts.push(`--color-primary-dark: ${darken(hex, 0.15)};`)
    parts.push(`--color-primary-subtle: ${lighten(hex, 0.9)};`)
    parts.push(`--color-primary-border: ${lighten(hex, 0.7)};`)
  } else {
    parts.push(`--color-primary-hover: ${lighten(hex, 0.12)};`)
    parts.push(`--color-primary-active: ${lighten(hex, 0.22)};`)
    parts.push(`--color-primary-dark: ${lighten(hex, 0.15)};`)
    parts.push(`--color-primary-subtle: ${darken(hex, 0.78)};`)
    parts.push(`--color-primary-border: ${darken(hex, 0.5)};`)
  }
  parts.push(`--color-on-primary: ${onColour(hex)};`)
  // Translucent primary, used for input focus rings.
  parts.push(`--color-primary-glow: rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.2);`)
  return parts.join(' ')
}

// Emit the --status-{key} family the Callout block consumes: the accent
// (border/icon colour), a soft tinted background, and a title colour with more
// contrast against that background. All derived from the one accent hex per
// status, per mode - light mode tints towards white, dark mode towards black.
// Non-hex values emit the accent alone; the Callout's var() fallbacks cover
// the derived pair.
function statusVars(key: string, hex: string, mode: 'light' | 'dark'): string {
  const parts = [`--status-${key}: ${hex};`]
  if (!parseHex(hex)) return parts.join(' ')
  if (mode === 'light') {
    parts.push(`--status-${key}-bg: ${lighten(hex, 0.92)};`)
    parts.push(`--status-${key}-title: ${darken(hex, 0.3)};`)
  } else {
    parts.push(`--status-${key}-bg: ${darken(hex, 0.8)};`)
    parts.push(`--status-${key}-title: ${lighten(hex, 0.25)};`)
  }
  return parts.join(' ')
}

export const STATUS_KEYS = ['info', 'success', 'warning', 'error'] as const

// Emit ONLY the semantic --color-primary family (light + dark) so the admin
// chrome white-labels to the site's primary colour and adopts the site's primary
// font (--font-sans, the admin UI typeface - the mono/code font is left alone).
// Deliberately excludes the spacing/radius/shadow and scoped `main …` rules from
// buildTokenStyles, which would clash with the admin design system (e.g. its own
// --radius-lg) and must not restyle admin content. Returns '' when there's
// neither a primary colour nor a primary font.
export function buildAdminThemeStyles(tokens: unknown): string {
  const t = (tokens && typeof tokens === 'object' ? tokens : {}) as Partial<DesignTokens>
  const colours = t.designSystem?.colours ?? []
  const primary = colours.find(c => c.id === 'primary') ?? colours[0]
  const fonts = t.designSystem?.fonts ?? []
  const primaryFont = fonts.find(f => f.id === 'primary') ?? fonts[0]
  // --font-sans lives on :root, so it applies in both light and dark.
  const fontVar = primaryFont?.family ? `--font-sans: ${primaryFont.family};` : ''
  if (!primary && !fontVar) return ''
  const light = (primary ? primaryVars(primary.light, 'light') : '') + fontVar
  const blocks = [`:root,[data-theme="light"]{${light}}`]
  if (primary) {
    const dark = primaryVars(primary.dark || primary.light, 'dark')
    blocks.push(`[data-theme="dark"]{${dark}}`)
    blocks.push(`@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){${dark}}}`)
  }
  return blocks.join('\n')
}

export function buildTokenStyles(tokens: unknown): string {
  const t = (tokens && typeof tokens === 'object' ? tokens : {}) as Partial<DesignTokens>

  const ds = t.designSystem ?? { colours: [], fonts: [] }
  const ts = t.themeStyle

  const colours = ds.colours ?? []
  const lightColours = colours.map((c, i) => `--color-${i + 1}: ${c.light};`).join(' ')
  const darkColours = colours.map((c, i) => `--color-${i + 1}: ${c.dark};`).join(' ')

  // Map the primary design colour onto the semantic --color-primary family that
  // buttons, links, richtext and Puck components consume. Without this, changing
  // the primary colour or applying a preset has no visible effect.
  const primary = colours.find(c => c.id === 'primary') ?? colours[0]
  const lightPrimary = primary ? primaryVars(primary.light, 'light') : ''
  const darkPrimary = primary ? primaryVars(primary.dark || primary.light, 'dark') : ''

  const spacing = SPACING_STEPS.map((m, i) => `--sp-${i + 1}: ${4 * m}px;`).join(' ')
  // Pill/full radius (Badge, Eyebrow) - the one radius step that's owner-
  // configurable, since it's the only one with a real per-site styling need
  // seen so far; the fixed sm/md/lg steps below are shared internal defaults.
  const pillRadius = ts?.pillRadius || '9999px'
  const fixed = `${spacing} --radius-sm: 2px; --radius-md: 6px; --radius-lg: 9999px; --radius-pill: ${pillRadius}; --shadow-subtle: 0 2px 8px rgba(0,0,0,0.08); --shadow-elevated: 0 4px 24px rgba(0,0,0,0.15);`

  const vars: string[] = []
  // Dark-mode overrides. Each colour is emitted as a CSS var in the light `:root`
  // block (via colourVar below) and the scoped `main …` rules reference that var,
  // so redefining the var in the dark blocks is all it takes to flip a colour for
  // dark mode. An override is only pushed here when the admin actually set one;
  // otherwise the var keeps its light value and dark mode inherits it unchanged.
  const darkVars: string[] = []
  function colourVar(name: string, light?: string, dark?: string) {
    if (light) vars.push(`${name}: ${light};`)
    if (dark) darkVars.push(`${name}: ${dark};`)
  }

  // The "primary" global font (or the first defined font) is the site default
  // typeface. Body text uses its own family when set, otherwise falls back to
  // this - so setting the primary font actually changes the site font and an
  // empty body-family box inherits it rather than the built-in Cactus face.
  const primaryFont = ds.fonts?.find(f => f.id === 'primary') ?? ds.fonts?.[0]
  const body = ts?.body ?? {}
  const bodyFamily = body.family || primaryFont?.family
  const bodyWeight = body.weight || primaryFont?.weight
  if (bodyFamily) {
    vars.push(`--font-body: ${bodyFamily};`)
    vars.push(`--font-heading: ${bodyFamily};`)
    // Override the base UI typeface too, so text outside <main> (header, footer)
    // and native form controls (which don't inherit font-family) use the site font.
    vars.push(`--font-sans: ${bodyFamily};`)
  }
  colourVar('--color-link', ts?.links?.colour, ts?.links?.colourDark)
  colourVar('--color-link-hover', ts?.links?.hoverColour, ts?.links?.hoverColourDark)
  colourVar('--color-page-bg', ts?.background?.colour, ts?.background?.colourDark)
  colourVar('--body-color', body.colour, body.colourDark)

  // Status box colours. Unlike colourVar, the dark emission is unconditional
  // (when a colour exists at all): the derived bg/title tints differ per mode,
  // so dark mode needs its own derivation even without an explicit override.
  for (const key of STATUS_KEYS) {
    const s = ts?.status?.[key]
    if (!s?.colour) continue
    vars.push(statusVars(key, s.colour, 'light'))
    darkVars.push(statusVars(key, s.colourDark || s.colour, 'dark'))
  }

  // Emit a Typo as CSS variables under a prefix, so components that render with
  // inline styles (Puck blocks) can read them with `var(--prefix-x, fallback)`
  // and reflect the theme without a scoped rule being able to reach them.
  function typoVars(prefix: string, v: Typo) {
    if (v.family)        vars.push(`--${prefix}-family: ${v.family};`)
    if (v.weight)        vars.push(`--${prefix}-weight: ${v.weight};`)
    if (v.size)          vars.push(`--${prefix}-size: ${v.size};`)
    if (v.lineHeight)    vars.push(`--${prefix}-line-height: ${v.lineHeight};`)
    if (v.letterSpacing) vars.push(`--${prefix}-letter-spacing: ${v.letterSpacing};`)
    if (v.transform)     vars.push(`--${prefix}-transform: ${v.transform};`)
    if (v.style)         vars.push(`--${prefix}-style: ${v.style};`)
    if (v.decoration)    vars.push(`--${prefix}-decoration: ${v.decoration};`)
  }

  // Site-wide headings font: every level (and Display) falls back to it when
  // no per-level family is set, mirroring how body falls back to the primary
  // global font above.
  const headingsFamily = ts?.headingsFont
  for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const) {
    const h = ts?.headings?.[tag] ?? {}
    typoVars(tag, { ...h, family: h.family || headingsFamily })
    colourVar(`--${tag}-color`, h.colour, h.colourDark)
  }

  // Display (hero/largest heading, above h1) and Caption (small label/footnote
  // text, usable anywhere - not just form-field labels) - both standalone,
  // read by class rather than tag since neither has one native HTML element.
  const display = { ...(ts?.display ?? {}) }
  display.family = display.family || headingsFamily
  typoVars('display', display)
  colourVar('--display-color', display.colour, display.colourDark)

  const caption = ts?.caption ?? {}
  typoVars('caption', caption)
  colourVar('--caption-color', caption.colour, caption.colourDark)

  const btns = ts?.buttons
  if (btns?.typo)               typoVars('btn', btns.typo)
  colourVar('--btn-text-color', btns?.textColour, btns?.textColourDark)
  colourVar('--btn-bg', btns?.bgColour, btns?.bgColourDark)
  colourVar('--btn-border', btns?.borderColour, btns?.borderColourDark)
  if (btns?.borderWidth)        vars.push(`--btn-border-width: ${btns.borderWidth};`)
  if (btns?.borderRadius)       vars.push(`--btn-radius: ${btns.borderRadius};`)
  if (btns?.padding)            vars.push(`--btn-padding: ${btns.padding};`)
  colourVar('--btn-hover-text', btns?.hover?.textColour, btns?.hover?.textColourDark)
  colourVar('--btn-hover-bg', btns?.hover?.bgColour, btns?.hover?.bgColourDark)

  // Secondary/outline variant colours - each field optional, so an unset one
  // leaves its CSS var unemitted and the ButtonLink block's own fallback
  // (deriving from --color-primary) takes over, unchanged from before these
  // existed.
  const sec = btns?.secondary
  colourVar('--btn-secondary-bg', sec?.bgColour, sec?.bgColourDark)
  colourVar('--btn-secondary-text', sec?.textColour, sec?.textColourDark)
  colourVar('--btn-secondary-border', sec?.borderColour, sec?.borderColourDark)
  colourVar('--btn-secondary-hover-text', sec?.hover?.textColour, sec?.hover?.textColourDark)
  colourVar('--btn-secondary-hover-bg', sec?.hover?.bgColour, sec?.hover?.bgColourDark)

  const outl = btns?.outline
  colourVar('--btn-outline-text', outl?.textColour, outl?.textColourDark)
  colourVar('--btn-outline-border', outl?.borderColour, outl?.borderColourDark)
  colourVar('--btn-outline-hover-text', outl?.hover?.textColour, outl?.hover?.textColourDark)
  colourVar('--btn-outline-hover-bg', outl?.hover?.bgColour, outl?.hover?.bgColourDark)
  // Outline's fill starts transparent; only emit a hover background var if one
  // was actually set; otherwise the variant just keeps its base transparency.

  // Badge block colours ('primary' key already reuses --color-primary-subtle
  // via the block's own inline fallback, so isn't handled here).
  for (const key of BADGE_COLOUR_KEYS) {
    const bd = ts?.badges?.[key]
    if (!bd) continue
    colourVar(`--badge-${key}-bg`, bd.bg, bd.bgDark)
    colourVar(`--badge-${key}-text`, bd.text, bd.textDark)
  }

  const imgs = ts?.images
  if (imgs?.borderRadius) vars.push(`--img-radius: ${imgs.borderRadius};`)
  colourVar('--img-border-color', imgs?.borderColour, imgs?.borderColourDark)
  if (imgs?.borderWidth)  vars.push(`--img-border-width: ${imgs.borderWidth};`)

  const fields = ts?.formFields
  if (fields?.typo)         typoVars('field', fields.typo)
  colourVar('--field-text', fields?.textColour, fields?.textColourDark)
  colourVar('--field-bg', fields?.bgColour, fields?.bgColourDark)
  colourVar('--field-border', fields?.borderColour, fields?.borderColourDark)
  if (fields?.borderRadius) vars.push(`--field-radius: ${fields.borderRadius};`)
  if (fields?.labelTypo)    typoVars('field-label', fields.labelTypo)
  colourVar('--field-label-color', fields?.labelColour, fields?.labelColourDark)

  // Default block gutter consumed by Puck blocks via var(--block-padding, 1.5rem).
  if (ts?.spacing?.blockPadding) vars.push(`--block-padding: ${ts.spacing.blockPadding};`)

  // Responsive breakpoints for every core surface (Grid/Split, nav collapse,
  // visibility utilities). Resolved from the site's Styles setting via the single
  // resolveBreakpoints source, baked into literal @media rules below since media
  // queries can't read CSS custom properties.
  const { tabletBp, mobileBp } = resolveBreakpoints(t)
  // Non-overlapping breakpoint ranges, shared semantics with lib/puck/
  // responsiveValue.ts: mobile owns widths up to AND INCLUDING the mobile
  // breakpoint, tablet runs from 0.02px above it (CSSWG-recommended offset)
  // up to and including the tablet breakpoint, desktop is everything above.
  // Without the offset a canvas/window sitting exactly on a breakpoint
  // matched two ranges at once (e.g. both .hide-mobile and .hide-tablet fired
  // at exactly the mobile width, and grids resolved a different device than
  // block-level responsive overrides did).
  const aboveMobileBp = `${(parseInt(mobileBp, 10) || 640) + 0.02}px`
  const aboveTabletBp = `${(parseInt(tabletBp, 10) || 1024) + 0.02}px`

  // Keep the per-block responsive system (lib/puck/responsiveValue.ts, used by
  // every block's own tablet/mobile media overrides) on the same breakpoints
  // as the rules below. Every surface that renders blocks - the public layout,
  // the preview routes, both Puck editors - calls buildTokenStyles with the
  // site's tokens before/as the blocks render, so this is the one chokepoint
  // where custom breakpoints reach the block-level media queries too.
  setResponsiveBreakpoints(parseInt(mobileBp, 10) || 640, parseInt(tabletBp, 10) || 1024)

  const darkOverrides = darkVars.length ? ' ' + darkVars.join(' ') : ''
  const rootBlock = `:root,[data-theme="light"]{${lightColours}${fixed}${lightPrimary} ${vars.join(' ')}}`
  const darkBlock = `[data-theme="dark"]{${darkColours}${darkPrimary}${darkOverrides}}`
  const mediaDark = `@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){${darkColours}${darkPrimary}${darkOverrides}}}`

  const scoped: string[] = []

  function typoProps(v: Typo): string[] {
    const p: string[] = []
    if (v.family)        p.push(`font-family: ${v.family};`)
    if (v.weight)        p.push(`font-weight: ${v.weight};`)
    if (v.size)          p.push(`font-size: ${v.size};`)
    if (v.lineHeight)    p.push(`line-height: ${v.lineHeight};`)
    if (v.letterSpacing) p.push(`letter-spacing: ${v.letterSpacing};`)
    if (v.transform)     p.push(`text-transform: ${v.transform};`)
    if (v.style)         p.push(`font-style: ${v.style};`)
    if (v.decoration)    p.push(`text-decoration: ${v.decoration};`)
    return p
  }

  // Apply body typography to `main` itself so it cascades to all content -
  // including rich text, whose `.puck-richtext p` rule out-specificities a
  // plain `main p` selector and would otherwise ignore the chosen body font.
  // typoProps only emits font-family when body.family is set; fall back to the
  // primary global font so an empty body-family box still uses the site font.
  // Colour props below reference the CSS vars emitted above (not the raw value),
  // so a dark-mode override redefined in the dark blocks flows through here. The
  // `if (…colour)` guards stay, so a var is only referenced when it was emitted.
  const bodyProps = [...typoProps({ ...body, family: bodyFamily, weight: bodyWeight })]
  if (body.colour) bodyProps.push(`color: var(--body-color);`)
  if (bodyProps.length) scoped.push(`main{${bodyProps.join('')}}`)

  for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const) {
    const h = (ts?.headings?.[tag] ?? {}) as HeadingStyle
    const hProps = [...typoProps({ ...h, family: h.family || headingsFamily })]
    if (h.colour) hProps.push(`color: var(--${tag}-color);`)
    if (hProps.length) scoped.push(`main ${tag}{${hProps.join('')}}`)
  }

  const displayProps = [...typoProps(display)]
  if (display.colour) displayProps.push(`color: var(--display-color);`)
  if (displayProps.length) scoped.push(`main .cactus-display{${displayProps.join('')}}`)

  const captionProps = [...typoProps(caption)]
  if (caption.colour) captionProps.push(`color: var(--caption-color);`)
  if (captionProps.length) scoped.push(`main .cactus-caption{${captionProps.join('')}}`)

  if (ts?.links?.colour) scoped.push(`main a{color: var(--color-link);}`)
  if (ts?.links?.hoverColour) scoped.push(`main a:hover{color: var(--color-link-hover);}`)

  if (btns) {
    const btnProps: string[] = [...typoProps(btns.typo ?? {})]
    if (btns.textColour)   btnProps.push(`color: var(--btn-text-color);`)
    if (btns.bgColour)     btnProps.push(`background: var(--btn-bg);`)
    if (btns.borderColour) btnProps.push(`border-color: var(--btn-border);`)
    if (btns.borderWidth)  btnProps.push(`border-width: ${btns.borderWidth};`)
    if (btns.borderRadius) btnProps.push(`border-radius: ${btns.borderRadius};`)
    if (btns.padding)      btnProps.push(`padding: ${btns.padding};`)
    if (btnProps.length) scoped.push(`main button{${btnProps.join('')}}`)

    // Hover: also target the Button block's <a class="cactus-btn">, scoped by
    // its data-variant attribute so a primary hover colour doesn't leak onto
    // secondary/outline instances. Base state is styled inline (Puck renders
    // inline), so !important is needed for the hover rule to win over it.
    const hoverProps: string[] = []
    if (btns.hover?.textColour) hoverProps.push(`color: var(--btn-hover-text) !important;`)
    if (btns.hover?.bgColour)   hoverProps.push(`background: var(--btn-hover-bg) !important;`)
    if (hoverProps.length) scoped.push(`main button:hover,main .cactus-btn[data-variant="primary"]:hover{${hoverProps.join('')}}`)

    const secHoverProps: string[] = []
    if (btns.secondary?.hover?.textColour) secHoverProps.push(`color: var(--btn-secondary-hover-text) !important;`)
    if (btns.secondary?.hover?.bgColour)   secHoverProps.push(`background: var(--btn-secondary-hover-bg) !important;`)
    if (secHoverProps.length) scoped.push(`main .cactus-btn[data-variant="secondary"]:hover{${secHoverProps.join('')}}`)

    const outlHoverProps: string[] = []
    if (btns.outline?.hover?.textColour) outlHoverProps.push(`color: var(--btn-outline-hover-text) !important;`)
    if (btns.outline?.hover?.bgColour)   outlHoverProps.push(`background: var(--btn-outline-hover-bg) !important;`)
    if (outlHoverProps.length) scoped.push(`main .cactus-btn[data-variant="outline"]:hover{${outlHoverProps.join('')}}`)
  }

  if (imgs) {
    const imgProps: string[] = []
    if (imgs.borderRadius) imgProps.push(`border-radius: ${imgs.borderRadius};`)
    if (imgs.borderColour) imgProps.push(`border-color: var(--img-border-color); border-style: solid;`)
    if (imgs.borderWidth)  imgProps.push(`border-width: ${imgs.borderWidth};`)
    if (imgProps.length) scoped.push(`main img{${imgProps.join('')}}`)
  }

  if (fields) {
    const fieldProps: string[] = [...typoProps(fields.typo ?? {})]
    if (fields.textColour)   fieldProps.push(`color: var(--field-text);`)
    if (fields.bgColour)     fieldProps.push(`background: var(--field-bg);`)
    if (fields.borderColour) fieldProps.push(`border-color: var(--field-border);`)
    if (fields.borderRadius) fieldProps.push(`border-radius: ${fields.borderRadius};`)
    if (fieldProps.length) scoped.push(`main input,main textarea,main select{${fieldProps.join('')}}`)

    const labelProps: string[] = [...typoProps(fields.labelTypo ?? {})]
    if (fields.labelColour) labelProps.push(`color: var(--field-label-color);`)
    if (labelProps.length) scoped.push(`main label{${labelProps.join('')}}`)
  }

  // Grid ("Columns") and Split blocks render fixed CSS grid templates inline;
  // these rules override them with !important below each breakpoint so they
  // stack instead of squeezing columns down to nothing on narrow screens.
  // Grid gets an extra step at the tablet breakpoint: 3/4-column layouts drop
  // to 2 columns before fully stacking at the mobile breakpoint (2-column
  // grids and Split are already narrow enough to skip that middle step).
  // Header grids (logo/nav/actions) are excluded from the generic drop:
  // shunting the actions column onto its own row breaks the header. Instead
  // the outer (logo/actions) columns shrink to content and the nav column
  // takes the remaining space, so nothing overflows into a neighbour.
  // Any grid with its own per-breakpoint column widths set (data-responsive-set,
  // from the Grid block's tablet/mobile column overrides) opts out of all of
  // this entirely - its own scoped <style> tag takes over instead.
  scoped.push(`@media(max-width:${mobileBp}){.puck-grid:not([data-responsive-set]),.puck-split{grid-template-columns:1fr !important;}}`)
  scoped.push(`@media(min-width:${aboveMobileBp}) and (max-width:${tabletBp}){.puck-grid[data-cols="3"]:not(header *):not([data-responsive-set]),.puck-grid[data-cols="4"]:not(header *):not([data-responsive-set]){grid-template-columns:repeat(2,1fr) !important;}header .puck-grid[data-cols="3"]:not([data-responsive-set]){grid-template-columns:auto 1fr auto !important;}}`)
  // Grids with "Stack on tablet" (config.tsx stackAtTablet) collapse to a single
  // column across the whole tablet band too, not just mobile - one rule up to
  // the tablet breakpoint covers both. Wins over the 3/4-col tablet rule above
  // for a grid that opts in.
  scoped.push(`@media(max-width:${tabletBp}){.puck-grid[data-stack-tablet]:not(header *){grid-template-columns:1fr !important;}}`)

  // Per-device horizontal padding utilities for the Puck blocks' shared
  // "Padding (left/right)" field (config.tsx getPaddingClasses). Three class
  // families - cactus-pad-d-* (base, all widths), cactus-pad-t-* (tablet band)
  // and cactus-pad-m-* (mobile) - with the tablet/mobile rules emitted after
  // the base ones so they win inside their media range at equal specificity.
  // The desktop→tablet→mobile inheritance cascade is resolved in JS when the
  // classes are assigned, so every element carries all three classes.
  const padSizes: Record<string, string> = {
    default: 'var(--block-padding, 1.5rem)', none: '0',
    sm: '0.5rem', md: '1rem', lg: '2rem', xl: '4rem',
  }
  for (const [k, v] of Object.entries(padSizes)) scoped.push(`.cactus-pad-d-${k}{padding-left:${v};padding-right:${v};}`)
  for (const [k, v] of Object.entries(padSizes)) scoped.push(`@media(min-width:${aboveMobileBp}) and (max-width:${tabletBp}){.cactus-pad-t-${k}{padding-left:${v};padding-right:${v};}}`)
  for (const [k, v] of Object.entries(padSizes)) scoped.push(`@media(max-width:${mobileBp}){.cactus-pad-m-${k}{padding-left:${v};padding-right:${v};}}`)

  // Responsive visibility utilities. Emitted here (rather than a static rule in
  // globals.css) so .hide-desktop/tablet/mobile honour the site's breakpoint
  // setting. "Desktop" is anything above the tablet width; "mobile" is <= the
  // mobile width; "tablet" is the band between - ranges don't overlap (see
  // aboveMobileBp/aboveTabletBp above), so an element hidden on tablet can't
  // also vanish at exactly the mobile width.
  scoped.push(`@media(min-width:${aboveTabletBp}){.hide-desktop{display:none !important;}}`)
  scoped.push(`@media(min-width:${aboveMobileBp}) and (max-width:${tabletBp}){.hide-tablet{display:none !important;}}`)
  scoped.push(`@media(max-width:${mobileBp}){.hide-mobile{display:none !important;}}`)

  // Menu nav collapse to a hamburger per-breakpoint, per the menu block's
  // "Nav behaviour" setting. The base .cactus-nav-menu/.cactus-nav-toggle
  // display rules stay inline in MenuBlockClient (they carry no breakpoint);
  // only these width-dependent rules live here so they track the settings.
  // The cactus-nav-collapse-mobile/-tablet/-desktop modifier classes only
  // exist on instances opted into collapsing at that tier, so emitting these
  // unconditionally is safe.
  scoped.push(`@media(max-width:${mobileBp}){.cactus-nav-menu.cactus-nav-collapse-mobile{display:none !important;}.cactus-nav-toggle.cactus-nav-collapse-mobile{display:flex !important;}}`)
  scoped.push(`@media(min-width:${aboveMobileBp}) and (max-width:${tabletBp}){.cactus-nav-menu.cactus-nav-collapse-tablet{display:none !important;}.cactus-nav-toggle.cactus-nav-collapse-tablet{display:flex !important;}}`)
  scoped.push(`@media(min-width:${aboveTabletBp}){.cactus-nav-menu.cactus-nav-collapse-desktop{display:none !important;}.cactus-nav-toggle.cactus-nav-collapse-desktop{display:flex !important;}}`)

  // "Dropdown" nav behaviour - a single current-page trigger replaces the menu
  // at the chosen breakpoints (the menu itself already hides via the collapse
  // rules above, since dropdown counts as "not always show"). The base
  // .cactus-nav-dropdown{display:none} stays inline in MenuBlockClient; only
  // these breakpoint reveals live here so they track the site's widths.
  scoped.push(`@media(max-width:${mobileBp}){.cactus-nav-dropdown.cactus-nav-dd-mobile{display:flex !important;}}`)
  scoped.push(`@media(min-width:${aboveMobileBp}) and (max-width:${tabletBp}){.cactus-nav-dropdown.cactus-nav-dd-tablet{display:flex !important;}}`)
  scoped.push(`@media(min-width:${aboveTabletBp}){.cactus-nav-dropdown.cactus-nav-dd-desktop{display:flex !important;}}`)

  return [rootBlock, darkBlock, mediaDark, ...scoped].join('\n')
}

const SYSTEM_KEYWORDS = ['system-ui', 'arial', 'georgia', 'helvetica', 'times', 'sans-serif', 'serif', 'monospace', '-apple-system']

function isSystemFont(family: string): boolean {
  const lower = family.toLowerCase()
  return SYSTEM_KEYWORDS.some(k => lower.includes(k))
}

// Google Fonts stylesheet URL for a single family value (as stored by a font
// picker - may be a bare name or a CSS list like "Inter, sans-serif"). Null for
// empty/system families, which need no stylesheet. Requests the 400-700 weights
// so per-block weight settings all render. Used by blocks whose font can be set
// outside the site-wide tokens (which buildFontHref below already covers).
export function googleFontHrefForFamily(family?: string): string | null {
  if (!family) return null
  const first = (family.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '')
  if (!first || isSystemFont(first)) return null
  return `https://fonts.googleapis.com/css2?family=${first.replace(/ /g, '+')}:wght@400;500;600;700&display=swap`
}

export function buildFontHref(tokens: unknown): string | null {
  const t = (tokens && typeof tokens === 'object' ? tokens : {}) as Partial<DesignTokens>
  const families = new Map<string, Set<string>>()

  function add(family?: string, weight?: string) {
    if (!family || isSystemFont(family)) return
    if (!families.has(family)) families.set(family, new Set())
    if (weight) families.get(family)!.add(weight)
  }

  for (const f of t.designSystem?.fonts ?? []) add(f.family, f.weight)

  const ts = t.themeStyle
  if (ts) {
    add(ts.body?.family, ts.body?.weight)
    add(ts.headingsFont)
    for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const) {
      const h = ts.headings?.[tag]
      add(h?.family, h?.weight)
      // Per-level weight on a level inheriting the site-wide headings font
      // needs that weight requested against the shared family too.
      if (!h?.family && ts.headingsFont) add(ts.headingsFont, h?.weight)
    }
    add(ts.display?.family, ts.display?.weight)
    add(ts.caption?.family, ts.caption?.weight)
    add(ts.buttons?.typo?.family, ts.buttons?.typo?.weight)
    add(ts.formFields?.typo?.family, ts.formFields?.typo?.weight)
    add(ts.formFields?.labelTypo?.family, ts.formFields?.labelTypo?.weight)
  }

  if (families.size === 0) return null

  const params = Array.from(families.entries()).map(([family, weights]) => {
    const name = family.trim().replace(/ /g, '+')
    if (weights.size === 0) return `family=${name}`
    return `family=${name}:wght@${Array.from(weights).sort().join(';')}`
  })

  return `https://fonts.googleapis.com/css2?${params.join('&')}&display=swap`
}
