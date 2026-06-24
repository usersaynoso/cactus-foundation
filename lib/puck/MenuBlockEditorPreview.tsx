'use client'
import { useState, useEffect } from 'react'
import type { PublicMenuItem } from '@/lib/menu/resolve'

type Props = {
  menuId: string
  orientation: 'horizontal' | 'vertical'
  spacing: 'tight' | 'normal' | 'wide'
  showDropdowns: string
  showMobileToggle: string
}

export default function MenuBlockEditorPreview({ menuId, orientation, spacing }: Props) {
  const [items, setItems] = useState<PublicMenuItem[]>([])
  const [loading, setLoading] = useState(false)
  const [menuName, setMenuName] = useState('')

  useEffect(() => {
    if (!menuId) { setItems([]); return }
    setLoading(true)
    fetch(`/api/admin/menus/${menuId}/resolve`)
      .then((r) => r.ok ? r.json() : { items: [], name: '' })
      .then((d) => { setItems(d.items ?? []); setMenuName(d.name ?? '') })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [menuId])

  if (!menuId) {
    return (
      <div style={{ padding: '0.75rem 1rem', background: '#f3f4f6', borderRadius: 6, color: '#9ca3af', fontSize: '0.875rem' }}>
        Select a menu in the panel →
      </div>
    )
  }

  if (loading) {
    return <div style={{ padding: '0.75rem 1rem', color: '#9ca3af', fontSize: '0.875rem' }}>Loading menu…</div>
  }

  if (items.length === 0) {
    return (
      <div style={{ padding: '0.75rem 1rem', background: '#f3f4f6', borderRadius: 6, color: '#9ca3af', fontSize: '0.875rem' }}>
        {menuName || 'Menu'} — no published items
      </div>
    )
  }

  const gaps: Record<string, string> = { tight: '0.75rem', normal: '1.25rem', wide: '2rem' }
  const gap = gaps[spacing] ?? '1.25rem'

  if (orientation === 'vertical') {
    return (
      <nav>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap }}>
          {items.map((item) => (
            <li key={item.id}>
              <span style={{ color: '#374151', fontWeight: 500, fontSize: '0.9375rem' }}>{item.label}</span>
              {item.children && item.children.length > 0 && (
                <ul style={{ listStyle: 'none', margin: '0.25rem 0 0', padding: '0 0 0 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {item.children.map((child) => (
                    <li key={child.id}><span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{child.label}</span></li>
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
    <nav>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap }}>
        {items.map((item) => (
          <li key={item.id}><span style={{ color: '#374151', fontWeight: 500, fontSize: '0.9375rem' }}>{item.label}</span></li>
        ))}
      </ul>
    </nav>
  )
}
