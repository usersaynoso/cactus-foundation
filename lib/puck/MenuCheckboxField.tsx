'use client'

import { useState, useEffect } from 'react'
import type { CustomFieldRender } from '@puckeditor/core'

type MenuOption = { id: string; name: string }

export const MenuCheckboxField: CustomFieldRender<string[]> = ({ value, onChange, field }) => {
  const [menus, setMenus] = useState<MenuOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/menus')
      .then((r) => r.ok ? r.json() : { menus: [] })
      .then((d) => setMenus((d as { menus?: MenuOption[] }).menus ?? []))
      .catch(() => setMenus([]))
      .finally(() => setLoading(false))
  }, [])

  const checked = Array.isArray(value) ? value : []

  function toggle(menuId: string) {
    if (checked.includes(menuId)) {
      onChange(checked.filter((id) => id !== menuId))
    } else {
      onChange([...checked, menuId])
    }
  }

  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>
        {(field as { label?: string }).label ?? 'Show in menus'}
      </label>
      {loading && <p style={{ fontSize: '0.8125rem', color: '#9ca3af', margin: 0 }}>Loading menus…</p>}
      {!loading && menus.length === 0 && (
        <p style={{ fontSize: '0.8125rem', color: '#9ca3af', margin: 0 }}>No menus created yet.</p>
      )}
      {menus.map((menu) => (
        <label
          key={menu.id}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}
        >
          <input
            type="checkbox"
            checked={checked.includes(menu.id)}
            onChange={() => toggle(menu.id)}
          />
          {menu.name}
        </label>
      ))}
    </div>
  )
}
