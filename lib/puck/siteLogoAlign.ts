// Shared by the SiteLogo block's two render halves - SiteLogoClient (the editor)
// and SiteLogoRsc (the published page). Those are deliberately separate
// implementations of the same markup ("Mirrors SiteLogoClient exactly", says the
// comment on the RSC one), which makes them a standing drift hazard, so anything
// that would otherwise be written twice lives here instead. Plain module, no
// 'use client': the RSC half imports it from the server.
import { normalizeResponsiveValue, pickResponsive, responsiveMediaCssFor, type Device, type ResponsiveValue } from '@/lib/puck/responsiveValue'

export const LOGO_ALIGN_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
]

const JUSTIFY_MAP: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' }

// The logo's <a> is already a block-level flex container, so it spans whatever
// width it is given and justify-content moves the logo within it. No wrapper
// element is needed, which is the point: the markup is unchanged for anyone who
// never touches the field. Unset resolves to flex-start - what the <a> already
// did - so every logo saved before this field existed renders identically.
//
// Inside a header column the <a> is a flex *item*, sized to its content, so
// there is no free space to distribute and this is a no-op there: alignment in
// the header stays the column's job, exactly as before.
export function siteLogoAlign(
  id: string | undefined,
  align: ResponsiveValue<string> | string | undefined,
): { justifyContent: string; css: string } {
  const rv = normalizeResponsiveValue<string>(align)
  const at = (d: Device) => JUSTIFY_MAP[pickResponsive(rv, d) ?? 'left'] ?? 'flex-start'
  return {
    justifyContent: at('desktop'),
    css: id ? responsiveMediaCssFor(`a[data-sitelogo-id="${id}"]`, (d) => `justify-content:${at(d)};`) : '',
  }
}
