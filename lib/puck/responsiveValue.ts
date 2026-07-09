// Plain types/helpers shared between the client-only field UI
// (ResponsiveValueField.tsx) and server-renderable blocks (GridBlock in
// config.tsx). No 'use client' here deliberately: GridBlock runs on both the
// client editor and the server RSC render path, and a 'use client' export
// can only be *referenced*, never *called*, from server code.
export type Device = 'desktop' | 'tablet' | 'mobile'
export type ResponsiveValue<T> = { desktop?: T; tablet?: T; mobile?: T }

// Pre-existing data (and any prop the caller hasn't migrated) stores this as
// a plain string, desktop-only. Normalising here means the field self-heals
// to the object shape the moment it's touched, with no data migration.
export function normalizeResponsiveValue<T>(value: ResponsiveValue<T> | T | undefined): ResponsiveValue<T> {
  if (value && typeof value === 'object') return value as ResponsiveValue<T>
  return value === undefined || value === '' ? {} : { desktop: value as T }
}

// Cascade: desktop wins; tablet falls back to desktop; mobile falls back to
// tablet then desktop. Same rule ResponsiveValueField's placeholder text and
// GridBlock's column pick() already use.
export function pickResponsive<T>(rv: ResponsiveValue<T>, device: Device): T | undefined {
  if (device === 'desktop') return rv.desktop
  if (device === 'tablet') return rv.tablet ?? rv.desktop
  return rv.mobile ?? rv.tablet ?? rv.desktop
}

// Breakpoints default to the token defaults (Appearance → Spacing: 1024px
// tablet, 640px mobile) and are overridden at render time via
// setResponsiveBreakpoints from wherever the site's design tokens are resolved
// (the public layout on the live site, the two Puck editors after their
// appearance fetch). Module-level mutable state is safe here: this is a
// single-site platform, so every request/render shares one set of breakpoints.
let MOBILE_BP = 640
let TABLET_BP = 1024

export function setResponsiveBreakpoints(mobilePx: number, tabletPx: number): void {
  if (Number.isFinite(mobilePx) && mobilePx > 0) MOBILE_BP = mobilePx
  if (Number.isFinite(tabletPx) && tabletPx > MOBILE_BP) TABLET_BP = tabletPx
}

export function getResponsiveBreakpoints(): { mobile: number; tablet: number } {
  return { mobile: MOBILE_BP, tablet: TABLET_BP }
}

// Builds a fluid `clamp(min, preferred, max)` that hits `min` at the site's
// mobile breakpoint and `max` at its tablet breakpoint, interpolating by
// viewport width in between - lets a block shed spacing/font-size/
// letter-spacing continuously as the screen narrows instead of jumping
// between fixed presets. Returns null when either side of the pair is
// blank/unparseable, so leaving both empty falls back to the caller's
// existing fixed value untouched.
export function fluidClamp(min: string | undefined, max: string | undefined, unit: string): string | null {
  const lo = parseFloat(min ?? '')
  const hi = parseFloat(max ?? '')
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null
  const { mobile, tablet } = getResponsiveBreakpoints()
  const minV = Math.min(lo, hi)
  const maxV = Math.max(lo, hi)
  if (tablet <= mobile || lo === hi) return `${hi}${unit}`
  const slope = (hi - lo) / (tablet - mobile)
  const intercept = lo - slope * mobile
  const preferred = `calc(${intercept.toFixed(4)}${unit} + ${(slope * 100).toFixed(4)}vw)`
  return `clamp(${minV}${unit}, ${preferred}, ${maxV}${unit})`
}

// Shared media-query prefixes so every hand-rolled rule (GridBlock's column
// overrides, module grids) uses byte-identical ranges. Mobile owns widths up
// to and including the mobile breakpoint; tablet starts 0.02px above it (the
// CSSWG-recommended offset for non-overlapping ranges), so a canvas or window
// sitting exactly on the breakpoint resolves to ONE device everywhere instead
// of matching both rules at once.
export function mobileMediaQuery(): string {
  return `@media(max-width:${MOBILE_BP}px)`
}
export function tabletMediaQuery(): string {
  return `@media(min-width:${MOBILE_BP + 0.02}px) and (max-width:${TABLET_BP}px)`
}

// Builds the media-query CSS that makes a block's tablet/mobile breakpoints
// override its desktop base. `declFor(device)` returns the full CSS declaration
// string that applies at that breakpoint (e.g. `text-align:center;`); a rule is
// only emitted for a breakpoint whose declarations differ from desktop's, so a
// block whose data is plain desktop-only emits nothing and renders
// byte-identically to before. Taking a whole-declaration function (rather than
// one value) lets a block fold several interacting responsive fields into one
// rule - e.g. text alignment and max-width both feeding the auto side-margins.
// The caller applies the desktop declarations as the element's own base style
// and gives each instance a stable selector (a data-attribute keyed on Puck's
// `id`).
//
// Each declaration is emitted with !important: the desktop base lives in the
// element's inline `style`, and an inline style beats any stylesheet selector,
// so a plain media rule would never win. This is the same reason GridBlock's
// existing column/gap breakpoint overrides carry !important.
export function responsiveMediaCssFor(
  selector: string,
  declFor: (device: Device) => string,
): string {
  const desktop = declFor('desktop')
  const tablet = declFor('tablet')
  const mobile = declFor('mobile')
  const important = (decls: string) => decls.split(';').map((d) => d.trim()).filter(Boolean).map((d) => `${d} !important`).join(';')
  const rules: string[] = []
  if (tablet !== desktop) rules.push(`${tabletMediaQuery()}{${selector}{${important(tablet)}}}`)
  if (mobile !== desktop) rules.push(`${mobileMediaQuery()}{${selector}{${important(mobile)}}}`)
  return rules.join('\n')
}
