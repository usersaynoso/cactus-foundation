'use client'

import { usePuck } from '@puckeditor/core'
import { MenuCheckboxField } from '@/lib/puck/MenuCheckboxField'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.375rem 0.5rem', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', fontFamily: 'inherit',
  background: 'var(--color-surface)', color: 'var(--color-text)', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.375rem',
}

export default function PageSettingsTab({ canManageMenus }: { canManageMenus: boolean }) {
  const { appState, dispatch } = usePuck()
  const props = (appState.data.root?.props ?? {}) as Record<string, unknown>

  function set(key: string, value: unknown) {
    dispatch({
      type: 'replaceRoot',
      root: { ...appState.data.root, props: { ...props, [key]: value } },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      <div style={{ fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.6875rem' }}>
        Page settings
      </div>

      <div>
        <label style={labelStyle}>Title</label>
        <input
          style={inputStyle}
          value={typeof props.title === 'string' ? props.title : ''}
          onChange={(e) => set('title', e.target.value)}
        />
      </div>

      <div>
        <label style={labelStyle}>Slug</label>
        <input
          style={inputStyle}
          value={typeof props.slug === 'string' ? props.slug : ''}
          onChange={(e) => set('slug', e.target.value)}
        />
      </div>

      <div>
        <label style={labelStyle}>Status</label>
        <select
          style={inputStyle}
          value={typeof props.status === 'string' ? props.status : 'draft'}
          onChange={(e) => set('status', e.target.value)}
        >
          <option value="draft">Draft</option>
          <option value="published">Published (use Publish button)</option>
        </select>
      </div>

      {canManageMenus && (
        <MenuCheckboxField
          value={Array.isArray(props.menuIds) ? (props.menuIds as string[]) : []}
          onChange={(v) => set('menuIds', v)}
          field={{ type: 'custom', label: 'Show in menus', render: () => <></> }}
          id="menuIds"
          name="menuIds"
          readOnly={false}
        />
      )}
    </div>
  )
}
