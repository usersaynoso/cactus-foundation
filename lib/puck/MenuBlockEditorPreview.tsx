'use client'
import { useState, useEffect } from 'react'
import type { PublicMenuItem } from '@/lib/menu/resolve'
import MenuBlockClient from '@/lib/puck/components/MenuBlockClient'
import { normalizeResponsiveValue, pickResponsive, fluidClamp, type ResponsiveValue } from '@/lib/puck/responsiveValue'
import { googleFontHrefForFamily } from '@/lib/design/tokens'

type MinMaxPair = { min?: string; max?: string }

type Props = {
  menuId: string
  orientation: 'horizontal' | 'vertical'
  spacing: ResponsiveValue<string> | 'tight' | 'normal' | 'wide'
  alignment?: ResponsiveValue<string> | 'flex-start' | 'center' | 'space-between' | 'space-around'
  showDropdowns: string
  navToggle: ResponsiveValue<string> | string | undefined
  itemFontSize?: ResponsiveValue<string> | 'small' | 'medium' | 'large'
  itemFontWeight?: ResponsiveValue<string> | 'normal' | 'medium' | 'semibold' | 'bold'
  textTransform?: ResponsiveValue<string> | 'none' | 'uppercase' | 'capitalize' | 'lowercase'
  itemColor?: string
  itemFontFamily?: string
  hoverColor?: string
  hoverBackground?: string
  activeColor?: string
  activeFontWeight?: string
  activeUnderline?: string
  activeUnderlineColor?: string
  activeUnderlineThickness?: string
  activeUnderlineOffset?: string
  itemSpacingFluid?: MinMaxPair
  letterSpacingFluid?: MinMaxPair
  itemFontSizeFluid?: MinMaxPair
}

// Renders through MenuBlockClient - the exact component the live site uses -
// rather than a hand-rolled re-implementation, so editor and live can never
// visually diverge (alignment, spacing, whatever) by construction. This
// component only handles the states MenuBlockClient can't: no menu picked
// yet, or still fetching the picked menu's items.
export default function MenuBlockEditorPreview({ menuId, orientation, spacing, alignment = 'flex-start', showDropdowns = 'hover', navToggle, itemFontSize = 'medium', itemFontWeight = 'medium', textTransform = 'none', itemColor, itemFontFamily, hoverColor, hoverBackground, activeColor, activeFontWeight, activeUnderline, activeUnderlineColor, activeUnderlineThickness, activeUnderlineOffset, itemSpacingFluid, letterSpacingFluid, itemFontSizeFluid }: Props) {
  const [items, setItems] = useState<PublicMenuItem[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!menuId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag before async fetch is intentional
    setLoading(true)
    fetch(`/api/admin/menus/${menuId}/resolve`)
      .then((r) => r.ok ? r.json() : { items: [] })
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [menuId])

  if (!menuId) {
    return (
      <div style={{ padding: '0.75rem 1rem', background: 'var(--color-bg-subtle)', borderRadius: 6, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
        Select a menu in the panel →
      </div>
    )
  }

  if (loading || items === null) {
    return <div style={{ padding: '0.75rem 1rem', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Loading menu…</div>
  }

  if (orientation === 'vertical') {
    const verticalGaps: Record<string, string> = { tight: '0.25rem', normal: '0.5rem', wide: '1rem' }
    const fontSizeMap: Record<string, string> = { small: '0.8125rem', medium: '0.9375rem', large: '1.0625rem' }
    const fontWeightMap: Record<string, number> = { normal: 400, medium: 500, semibold: 600, bold: 700 }
    const fluidFontSize = fluidClamp(itemFontSizeFluid?.min, itemFontSizeFluid?.max, 'rem')
    const fluidLetterSpacing = fluidClamp(letterSpacingFluid?.min, letterSpacingFluid?.max, 'em')
    const fluidGap = fluidClamp(itemSpacingFluid?.min, itemSpacingFluid?.max, 'rem')
    // This hand-rolled vertical stand-in only shows the desktop base; the live
    // MenuBlock carries the tablet/mobile media rules.
    const spacingD = pickResponsive(normalizeResponsiveValue<string>(spacing), 'desktop') ?? 'normal'
    const fontSizeD = pickResponsive(normalizeResponsiveValue<string>(itemFontSize), 'desktop') ?? 'medium'
    const fontWeightD = pickResponsive(normalizeResponsiveValue<string>(itemFontWeight), 'desktop') ?? 'medium'
    const transformD = pickResponsive(normalizeResponsiveValue<string>(textTransform), 'desktop') ?? 'none'
    const linkStyle: React.CSSProperties = {
      color: itemColor || 'var(--color-text)',
      fontWeight: fontWeightMap[fontWeightD] ?? 500,
      fontSize: fluidFontSize ?? fontSizeMap[fontSizeD] ?? '0.9375rem',
      fontFamily: itemFontFamily || undefined,
      letterSpacing: fluidLetterSpacing ?? undefined,
      textTransform: (transformD !== 'none' ? transformD : undefined) as React.CSSProperties['textTransform'],
    }
    const fontHref = googleFontHrefForFamily(itemFontFamily)
    return (
      <nav>
        {fontHref && <link rel="stylesheet" href={fontHref} precedence="default" />}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: fluidGap ?? verticalGaps[spacingD] ?? '0.5rem' }}>
          {items.map((item) => (
            <li key={item.id}>
              <span style={linkStyle}>{item.label}</span>
              {item.children && item.children.length > 0 && (
                <ul style={{ listStyle: 'none', margin: '0.25rem 0 0', padding: '0 0 0 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {item.children.map((child) => (
                    <li key={child.id}><span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>{child.label}</span></li>
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
  // for an unset breakpoint - and MenuBlock's identical resolution in config.tsx.
  const nav = normalizeResponsiveValue<string>(navToggle)
  const showDesktopToggle = nav.desktop ?? 'show'
  const showTabletToggle = nav.tablet ?? showDesktopToggle
  const showMobileToggle = nav.mobile ?? showTabletToggle

  return (
    <MenuBlockClient
      resolvedItems={items}
      spacing={spacing}
      alignment={alignment}
      showDropdowns={showDropdowns}
      itemFontSize={itemFontSize}
      itemFontWeight={itemFontWeight}
      textTransform={textTransform}
      itemColor={itemColor}
      itemFontFamily={itemFontFamily}
      hoverColor={hoverColor}
      hoverBackground={hoverBackground}
      activeColor={activeColor}
      activeFontWeight={activeFontWeight}
      activeUnderline={activeUnderline}
      activeUnderlineColor={activeUnderlineColor}
      activeUnderlineThickness={activeUnderlineThickness}
      activeUnderlineOffset={activeUnderlineOffset}
      itemSpacingFluid={itemSpacingFluid}
      letterSpacingFluid={letterSpacingFluid}
      itemFontSizeFluid={itemFontSizeFluid}
      showDesktopToggle={showDesktopToggle}
      showTabletToggle={showTabletToggle}
      showMobileToggle={showMobileToggle}
    />
  )
}
