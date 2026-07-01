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

type HeadingStyle = Typo & { colour?: string }

export type DesignTokens = {
  version: 2
  designSystem: {
    colours: GlobalColour[]
    fonts: GlobalFont[]
  }
  themeStyle: {
    background: { colour?: string }
    body: Typo & { colour?: string }
    links: { colour?: string; hoverColour?: string }
    headings: {
      h1: HeadingStyle; h2: HeadingStyle; h3: HeadingStyle
      h4: HeadingStyle; h5: HeadingStyle; h6: HeadingStyle
    }
    buttons: {
      typo: Typo
      textColour?: string; bgColour?: string; borderColour?: string
      borderWidth?: string; borderRadius?: string; padding?: string
      hover: { textColour?: string; bgColour?: string }
    }
    images: { borderRadius?: string; borderColour?: string; borderWidth?: string }
    formFields: {
      typo: Typo
      textColour?: string; bgColour?: string; borderColour?: string; borderRadius?: string
      labelTypo: Typo; labelColour?: string
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
    links: { colour: '#2c7558', hoverColour: '#22604a' },
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
  },
}

export type ColourPreset = {
  id: string
  name: string
  primary: { light: string; dark: string }
  linkColour: string
  linkHoverColour: string
}

export const COLOUR_PRESETS: ColourPreset[] = [
  {
    id: 'prickly',
    name: 'Prickly',
    primary: { light: '#2c7558', dark: '#459578' },
    linkColour: '#2c7558',
    linkHoverColour: '#22604a',
  },
  {
    id: 'bloom',
    name: 'Bloom',
    primary: { light: '#db2777', dark: '#f472b6' },
    linkColour: '#db2777',
    linkHoverColour: '#be185d',
  },
  {
    id: 'desert',
    name: 'Desert',
    primary: { light: '#c2410c', dark: '#fb923c' },
    linkColour: '#c2410c',
    linkHoverColour: '#9a3412',
  },
  {
    id: 'dusk',
    name: 'Dusk',
    primary: { light: '#4f46e5', dark: '#818cf8' },
    linkColour: '#4f46e5',
    linkHoverColour: '#4338ca',
  },
  {
    id: 'spine',
    name: 'Spine',
    primary: { light: '#0d9488', dark: '#2dd4bf' },
    linkColour: '#0d9488',
    linkHoverColour: '#0f766e',
  },
  {
    id: 'mirage',
    name: 'Mirage',
    primary: { light: '#7c3aed', dark: '#a78bfa' },
    linkColour: '#7c3aed',
    linkHoverColour: '#6d28d9',
  },
  {
    id: 'ember',
    name: 'Ember',
    primary: { light: '#dc2626', dark: '#f87171' },
    linkColour: '#dc2626',
    linkHoverColour: '#b91c1c',
  },
  {
    id: 'mesa',
    name: 'Mesa',
    primary: { light: '#d97706', dark: '#fbbf24' },
    linkColour: '#d97706',
    linkHoverColour: '#b45309',
  },
  {
    id: 'monsoon',
    name: 'Monsoon',
    primary: { light: '#0284c7', dark: '#38bdf8' },
    linkColour: '#0284c7',
    linkHoverColour: '#0369a1',
  },
  {
    id: 'sagebrush',
    name: 'Sagebrush',
    primary: { light: '#4d7c0f', dark: '#84cc16' },
    linkColour: '#4d7c0f',
    linkHoverColour: '#3f6212',
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
  if (!parseHex(hex)) return parts.join(' ')
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
  return parts.join(' ')
}

// Emit ONLY the semantic --color-primary family (light + dark) so the admin
// chrome white-labels to the site's primary colour. Deliberately excludes the
// spacing/radius/shadow and scoped `main …` rules from buildTokenStyles, which
// would clash with the admin design system (e.g. its own --radius-lg) and must
// not restyle admin content. Returns '' when there's no primary colour.
export function buildAdminThemeStyles(tokens: unknown): string {
  const t = (tokens && typeof tokens === 'object' ? tokens : {}) as Partial<DesignTokens>
  const colours = t.designSystem?.colours ?? []
  const primary = colours.find(c => c.id === 'primary') ?? colours[0]
  if (!primary) return ''
  const light = primaryVars(primary.light, 'light')
  const dark = primaryVars(primary.dark || primary.light, 'dark')
  return [
    `:root,[data-theme="light"]{${light}}`,
    `[data-theme="dark"]{${dark}}`,
    `@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){${dark}}}`,
  ].join('\n')
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
  const fixed = `${spacing} --radius-sm: 2px; --radius-md: 6px; --radius-lg: 9999px; --shadow-subtle: 0 2px 8px rgba(0,0,0,0.08); --shadow-elevated: 0 4px 24px rgba(0,0,0,0.15);`

  const vars: string[] = []

  const body = ts?.body ?? {}
  if (body.family) {
    vars.push(`--font-body: ${body.family};`)
    vars.push(`--font-heading: ${body.family};`)
  }
  if (ts?.links?.colour) vars.push(`--color-link: ${ts.links.colour};`)
  if (ts?.links?.hoverColour) vars.push(`--color-link-hover: ${ts.links.hoverColour};`)
  if (ts?.background?.colour) vars.push(`--color-page-bg: ${ts.background.colour};`)

  for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const) {
    const h = ts?.headings?.[tag] ?? {}
    if (h.size)   vars.push(`--${tag}-size: ${h.size};`)
    if (h.colour) vars.push(`--${tag}-color: ${h.colour};`)
  }

  const btns = ts?.buttons
  if (btns?.textColour)         vars.push(`--btn-text-color: ${btns.textColour};`)
  if (btns?.bgColour)           vars.push(`--btn-bg: ${btns.bgColour};`)
  if (btns?.borderColour)       vars.push(`--btn-border: ${btns.borderColour};`)
  if (btns?.borderWidth)        vars.push(`--btn-border-width: ${btns.borderWidth};`)
  if (btns?.borderRadius)       vars.push(`--btn-radius: ${btns.borderRadius};`)
  if (btns?.padding)            vars.push(`--btn-padding: ${btns.padding};`)
  if (btns?.hover?.textColour)  vars.push(`--btn-hover-text: ${btns.hover.textColour};`)
  if (btns?.hover?.bgColour)    vars.push(`--btn-hover-bg: ${btns.hover.bgColour};`)

  const imgs = ts?.images
  if (imgs?.borderRadius) vars.push(`--img-radius: ${imgs.borderRadius};`)
  if (imgs?.borderColour) vars.push(`--img-border-color: ${imgs.borderColour};`)
  if (imgs?.borderWidth)  vars.push(`--img-border-width: ${imgs.borderWidth};`)

  const fields = ts?.formFields
  if (fields?.textColour)   vars.push(`--field-text: ${fields.textColour};`)
  if (fields?.bgColour)     vars.push(`--field-bg: ${fields.bgColour};`)
  if (fields?.borderColour) vars.push(`--field-border: ${fields.borderColour};`)
  if (fields?.borderRadius) vars.push(`--field-radius: ${fields.borderRadius};`)
  if (fields?.labelColour)  vars.push(`--field-label-color: ${fields.labelColour};`)

  const rootBlock = `:root,[data-theme="light"]{${lightColours}${fixed}${lightPrimary} ${vars.join(' ')}}`
  const darkBlock = `[data-theme="dark"]{${darkColours}${darkPrimary}}`
  const mediaDark = `@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){${darkColours}${darkPrimary}}}`

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
  const bodyProps = [...typoProps(body)]
  if (body.colour) bodyProps.push(`color: ${body.colour};`)
  if (bodyProps.length) scoped.push(`main{${bodyProps.join('')}}`)

  for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const) {
    const h = (ts?.headings?.[tag] ?? {}) as HeadingStyle
    const hProps = [...typoProps(h)]
    if (h.colour) hProps.push(`color: ${h.colour};`)
    if (hProps.length) scoped.push(`main ${tag}{${hProps.join('')}}`)
  }

  if (ts?.links?.colour) scoped.push(`main a{color: ${ts.links.colour};}`)
  if (ts?.links?.hoverColour) scoped.push(`main a:hover{color: ${ts.links.hoverColour};}`)

  if (btns) {
    const btnProps: string[] = [...typoProps(btns.typo ?? {})]
    if (btns.textColour)   btnProps.push(`color: ${btns.textColour};`)
    if (btns.bgColour)     btnProps.push(`background: ${btns.bgColour};`)
    if (btns.borderColour) btnProps.push(`border-color: ${btns.borderColour};`)
    if (btns.borderWidth)  btnProps.push(`border-width: ${btns.borderWidth};`)
    if (btns.borderRadius) btnProps.push(`border-radius: ${btns.borderRadius};`)
    if (btns.padding)      btnProps.push(`padding: ${btns.padding};`)
    if (btnProps.length) scoped.push(`main button{${btnProps.join('')}}`)

    const hoverProps: string[] = []
    if (btns.hover?.textColour) hoverProps.push(`color: ${btns.hover.textColour};`)
    if (btns.hover?.bgColour)   hoverProps.push(`background: ${btns.hover.bgColour};`)
    if (hoverProps.length) scoped.push(`main button:hover{${hoverProps.join('')}}`)
  }

  if (imgs) {
    const imgProps: string[] = []
    if (imgs.borderRadius) imgProps.push(`border-radius: ${imgs.borderRadius};`)
    if (imgs.borderColour) imgProps.push(`border-color: ${imgs.borderColour}; border-style: solid;`)
    if (imgs.borderWidth)  imgProps.push(`border-width: ${imgs.borderWidth};`)
    if (imgProps.length) scoped.push(`main img{${imgProps.join('')}}`)
  }

  if (fields) {
    const fieldProps: string[] = [...typoProps(fields.typo ?? {})]
    if (fields.textColour)   fieldProps.push(`color: ${fields.textColour};`)
    if (fields.bgColour)     fieldProps.push(`background: ${fields.bgColour};`)
    if (fields.borderColour) fieldProps.push(`border-color: ${fields.borderColour};`)
    if (fields.borderRadius) fieldProps.push(`border-radius: ${fields.borderRadius};`)
    if (fieldProps.length) scoped.push(`main input,main textarea,main select{${fieldProps.join('')}}`)

    const labelProps: string[] = [...typoProps(fields.labelTypo ?? {})]
    if (fields.labelColour) labelProps.push(`color: ${fields.labelColour};`)
    if (labelProps.length) scoped.push(`main label{${labelProps.join('')}}`)
  }

  return [rootBlock, darkBlock, mediaDark, ...scoped].join('\n')
}

const SYSTEM_KEYWORDS = ['system-ui', 'arial', 'georgia', 'helvetica', 'times', 'sans-serif', 'serif', 'monospace', '-apple-system']

function isSystemFont(family: string): boolean {
  const lower = family.toLowerCase()
  return SYSTEM_KEYWORDS.some(k => lower.includes(k))
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
    for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const) {
      const h = ts.headings?.[tag]
      add(h?.family, h?.weight)
    }
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
