import type { ReactNode } from 'react'
import type { Viewports } from '@puckeditor/core'
import { resolveBreakpoints } from '@/lib/design/tokens'

// Puck's canvas preview widths are independent of the site's actual CSS breakpoints
// (resolveBreakpoints, Styles > Spacing & Breakpoints) - these buttons exist so editors
// can preview right at the edge of each breakpoint, so they're derived from the same
// tokens rather than a second hardcoded set of numbers.

// Small hand-drawn stand-ins for Puck's own Smartphone/Tablet/Monitor icons (lucide-react -
// not an installed dependency here, just bundled inside @puckeditor/core's own build) so the
// device class still reads as a familiar phone/tablet/monitor shape rather than a letter.
const DEVICE_ICON: Record<'S' | 'M' | 'L' | 'W', ReactNode> = {
  S: (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </svg>
  ),
  M: (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </svg>
  ),
  L: (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  W: (
    <svg width={15} height={11} viewBox="0 0 28 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2" width="26" height="12" rx="2" />
      <line x1="10" y1="18" x2="18" y2="18" />
      <line x1="14" y1="14" x2="14" y2="18" />
    </svg>
  ),
}

// A min/max pair sharing a device class would otherwise read as two identical buttons, so the
// icon pairs the device glyph with its exact pixel width. Laid out on a single line (glyph then
// width) so the badge stays the same height as the toolbar's other controls (zoom buttons) - the
// dropdown trigger renders this same node inline, and a two-line stack there sat taller than its
// neighbours and pushed itself up out of the row.
function sizeBadge(sizeClass: 'S' | 'M' | 'L' | 'W', px: number) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'row', alignItems: 'center', lineHeight: 1, gap: 3 }}>
      {DEVICE_ICON[sizeClass]}
      <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', opacity: 0.75 }}>{px}</span>
    </span>
  )
}

export function buildPuckViewports(designTokens: unknown): Viewports {
  const { mobileBp, tabletBp } = resolveBreakpoints(designTokens)
  const mobile = parseInt(mobileBp, 10) || 640
  const tablet = parseInt(tabletBp, 10) || 1024
  const minSmall = 360
  const maxSmall = mobile
  const minMedium = mobile + 1
  const maxMedium = tablet
  const minLarge = tablet + 1
  const maxLarge = 1280

  return [
    { width: minSmall, height: 'auto', icon: sizeBadge('S', minSmall), label: 'Small Mobile' },
    { width: maxSmall, height: 'auto', icon: sizeBadge('S', maxSmall), label: 'Large Mobile' },
    { width: minMedium, height: 'auto', icon: sizeBadge('M', minMedium), label: 'Small Tablet' },
    { width: maxMedium, height: 'auto', icon: sizeBadge('M', maxMedium), label: 'Large Tablet' },
    { width: minLarge, height: 'auto', icon: sizeBadge('L', minLarge), label: 'Small Desktop' },
    { width: maxLarge, height: 'auto', icon: sizeBadge('L', maxLarge), label: 'Large Desktop' },
    { width: 1920, height: 'auto', icon: sizeBadge('W', 1920), label: 'Widescreen 1920' },
    {
      width: '100%',
      height: 'auto',
      label: 'Full-width 100%',
      icon: (
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 3h6v6" />
          <path d="M9 21H3v-6" />
          <path d="M21 3 14 10" />
          <path d="M3 21l7-7" />
        </svg>
      ),
    },
  ]
}
