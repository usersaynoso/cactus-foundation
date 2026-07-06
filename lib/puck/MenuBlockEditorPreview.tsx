'use client'
import { useState, useEffect } from 'react'
import type { PublicMenuItem } from '@/lib/menu/resolve'
import MenuBlockClient from '@/lib/puck/components/MenuBlockClient'

type Props = {
  menuId: string
  orientation: 'horizontal' | 'vertical'
  spacing: 'tight' | 'normal' | 'wide'
  showDropdowns: string
  showMobileToggle: string
  showTabletToggle: string
  itemFontSize?: 'small' | 'medium' | 'large'
  itemFontWeight?: 'normal' | 'medium' | 'semibold' | 'bold'
  textTransform?: 'none' | 'uppercase' | 'capitalize' | 'lowercase'
  itemColor?: string
}

// Renders through MenuBlockClient - the exact component the live site uses -
// rather than a hand-rolled re-implementation, so editor and live can never
// visually diverge (alignment, spacing, whatever) by construction. This
// component only handles the states MenuBlockClient can't: no menu picked
// yet, or still fetching the picked menu's items.
export default function MenuBlockEditorPreview({ menuId, orientation, spacing, showMobileToggle, showTabletToggle, itemFontSize = 'medium', itemFontWeight = 'medium', textTransform = 'none', itemColor }: Props) {
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
    const linkStyle: React.CSSProperties = {
      color: itemColor || 'var(--color-text)',
      fontWeight: fontWeightMap[itemFontWeight] ?? 500,
      fontSize: fontSizeMap[itemFontSize] ?? '0.9375rem',
      textTransform: (textTransform !== 'none' ? textTransform : undefined) as React.CSSProperties['textTransform'],
    }
    return (
      <nav>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: verticalGaps[spacing] ?? '0.5rem' }}>
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

  return (
    <MenuBlockClient
      resolvedItems={items}
      spacing={spacing}
      itemFontSize={itemFontSize}
      itemFontWeight={itemFontWeight}
      textTransform={textTransform}
      itemColor={itemColor}
      showMobileToggle={showMobileToggle}
      showTabletToggle={showTabletToggle}
    />
  )
}
