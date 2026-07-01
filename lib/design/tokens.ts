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
      { id: 'primary',   name: 'Primary',   light: '#16a34a', dark: '#4ade80' },
      { id: 'secondary', name: 'Secondary', light: '#ffffff', dark: '#0f172a' },
    ],
    fonts: [
      { id: 'primary', name: 'Primary', family: 'system-ui, sans-serif', weight: '400' },
    ],
  },
  themeStyle: {
    background: {},
    body: { family: 'system-ui, sans-serif', size: '1rem', lineHeight: '1.75' },
    links: { colour: '#16a34a' },
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

const SPACING_STEPS = [1, 2, 3, 4, 6, 8, 12, 16, 24]

export function buildTokenStyles(tokens: unknown): string {
  const t = (tokens && typeof tokens === 'object' ? tokens : {}) as Partial<DesignTokens>

  const ds = t.designSystem ?? { colours: [], fonts: [] }
  const ts = t.themeStyle

  const colours = ds.colours ?? []
  const lightColours = colours.map((c, i) => `--color-${i + 1}: ${c.light};`).join(' ')
  const darkColours = colours.map((c, i) => `--color-${i + 1}: ${c.dark};`).join(' ')

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

  const rootBlock = `:root,[data-theme="light"]{${lightColours}${fixed}${vars.join(' ')}}`
  const darkBlock = `[data-theme="dark"]{${darkColours}}`
  const mediaDark = `@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){${darkColours}}}`

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

  const bodyProps = [...typoProps(body)]
  if (body.colour) bodyProps.push(`color: ${body.colour};`)
  if (bodyProps.length) scoped.push(`main p{${bodyProps.join('')}}`)

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
