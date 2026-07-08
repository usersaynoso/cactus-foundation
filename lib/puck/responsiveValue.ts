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

// Fixed breakpoints, matching GridBlock's existing inline media queries and the
// token defaults (Appearance → Spacing: 1024px tablet, 640px mobile). Block
// renders emit their responsive overrides at these widths; a site that
// customises its breakpoints won't see these move - exactly the same limitation
// GridBlock's own column overrides already have. Kept here so every responsive
// block stays consistent with that one precedent.
const MOBILE_BP = 640
const TABLET_BP = 1024

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
  if (tablet !== desktop) rules.push(`@media(min-width:${MOBILE_BP}px) and (max-width:${TABLET_BP}px){${selector}{${important(tablet)}}}`)
  if (mobile !== desktop) rules.push(`@media(max-width:${MOBILE_BP}px){${selector}{${important(mobile)}}}`)
  return rules.join('\n')
}
