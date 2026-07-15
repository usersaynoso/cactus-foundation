// Per-block dark-mode colour overrides are encoded straight into the stored
// colour value as CSS `light-dark(<light>, <dark>)`. The site sets
// `color-scheme: light|dark` alongside its theme (globals.css, loaded by the
// root layout across the whole public site), so the browser resolves the right
// arm with no render-side change - any block that already paints a raw colour
// value (backgroundColor, color, borderColor, ...) adapts for free. When there
// is no dark override the value stays the plain light colour, so legacy data
// and every other consumer are untouched.

export function splitLightDark(color: string): { light: string; dark: string } {
  const m = color.match(/^light-dark\(\s*([\s\S]*)\)\s*$/)
  if (!m || !m[1]) return { light: color, dark: '' }
  const inner = m[1]
  // Split on the top-level comma only - each arm may itself be a color-mix() or
  // rgba() that contains commas, so track parenthesis depth.
  let depth = 0
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      return { light: inner.slice(0, i).trim(), dark: inner.slice(i + 1).trim() }
    }
  }
  return { light: inner.trim(), dark: '' }
}

export function composeLightDark(light: string, dark: string): string {
  if (!dark) return light
  if (!light) return ''
  return `light-dark(${light}, ${dark})`
}
