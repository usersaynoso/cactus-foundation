'use client'
import { useState, useEffect } from 'react'
import type { PublicMenuItem } from '@/lib/menu/resolve'

type Props = {
  menuId: string
  orientation: 'horizontal' | 'vertical'
  spacing: 'tight' | 'normal' | 'wide'
  showDropdowns: string
  showMobileToggle: string
  itemFontSize?: 'small' | 'medium' | 'large'
  itemFontWeight?: 'normal' | 'medium' | 'semibold' | 'bold'
  textTransform?: 'none' | 'uppercase' | 'capitalize' | 'lowercase'
  itemColor?: string
}

export default function MenuBlockEditorPreview({ menuId, orientation, spacing, itemFontSize = 'medium', itemFontWeight = 'medium', textTransform = 'none', itemColor }: Props) {
  const [items, setItems] = useState<PublicMenuItem[]>([])
  const [loading, setLoading] = useState(false)
  const [menuName, setMenuName] = useState('')

  useEffect(() => {
    if (!menuId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag before async fetch is intentional
    setLoading(true)
    fetch(`/api/admin/menus/${menuId}/resolve`)
      .then((r) => r.ok ? r.json() : { items: [], name: '' })
      .then((d) => { setItems(d.items ?? []); setMenuName(d.name ?? '') })
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

  if (loading) {
    return <div style={{ padding: '0.75rem 1rem', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Loading menu…</div>
  }

  if (items.length === 0) {
    return (
      <div style={{ padding: '0.75rem 1rem', background: 'var(--color-bg-subtle)', borderRadius: 6, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
        {menuName || 'Menu'} — no published items
      </div>
    )
  }

  const verticalGaps: Record<string, string> = { tight: '0.25rem', normal: '0.5rem', wide: '1rem' }
  const fontSizeMap: Record<string, string> = { small: '0.8125rem', medium: '0.9375rem', large: '1.0625rem' }
  const fontWeightMap: Record<string, number> = { normal: 400, medium: 500, semibold: 600, bold: 700 }

  const linkStyle: React.CSSProperties = {
    color: itemColor || 'var(--color-text)',
    fontWeight: fontWeightMap[itemFontWeight] ?? 500,
    fontSize: fontSizeMap[itemFontSize] ?? '0.9375rem',
    textTransform: (textTransform !== 'none' ? textTransform : undefined) as React.CSSProperties['textTransform'],
  }

  if (orientation === 'vertical') {
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

  // Horizontal — inline styles matching the header design (no prickly.css dependency)
  const hItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.5rem 0.875rem',
    fontSize: fontSizeMap[itemFontSize] ?? '0.9375rem',
    fontWeight: fontWeightMap[itemFontWeight] ?? 500,
    color: itemColor || 'var(--color-text)',
    textDecoration: 'none',
    borderRadius: 6,
    textTransform: (textTransform !== 'none' ? textTransform : undefined) as React.CSSProperties['textTransform'],
  }

  return (
    <ul style={{ display: 'flex', alignItems: 'center', listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map((item) => (
        <li key={item.id} style={{ position: 'relative' }}>
          <span style={hItemStyle}>
            {item.label}
            {item.children && item.children.length > 0 && (
              <span style={{ fontSize: '0.625rem', opacity: 0.6 }} aria-hidden>▾</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}
