'use client'
import { useState, useEffect } from 'react'
import type { CustomFieldRender } from '@puckeditor/core'

type MenuOption = { id: string; name: string }

export const MenuSelectField: CustomFieldRender<string> = ({ value, onChange, field }) => {
  const [menus, setMenus] = useState<MenuOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/menus')
      .then((r) => r.ok ? r.json() : { menus: [] })
      .then((d) => setMenus((d as { menus?: MenuOption[] }).menus ?? []))
      .catch(() => setMenus([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>
        {(field as { label?: string }).label ?? 'Menu'}
      </label>
      {loading
        ? <p style={{ fontSize: '0.8125rem', color: '#9ca3af', margin: 0 }}>Loading…</p>
        : (
          <select
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            style={{ width: '100%', padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.8125rem', fontFamily: 'inherit' }}
          >
            <option value="">— Select a menu —</option>
            {menus.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )
      }
    </div>
  )
}
