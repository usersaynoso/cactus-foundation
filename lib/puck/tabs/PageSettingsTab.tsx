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

type Props = {
  canManageMenus: boolean
  saving: boolean
  lastSaved: Date | null
  saveError: string
  publishError: string
  isPublished: boolean
  publishedSlug: string | null
}

export default function PageSettingsTab({ canManageMenus, saving, lastSaved, saveError, publishError, isPublished, publishedSlug }: Props) {
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

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          {saving ? 'Saving draft…' : lastSaved ? `Draft saved ${lastSaved.toLocaleTimeString()}` : 'Unsaved'}
        </span>
        {isPublished && (
          <span className="badge badge-success" style={{ padding: '0.125rem 0.5rem', borderRadius: 4, fontWeight: 500 }}>
            Published
          </span>
        )}
        {publishedSlug && (
          <a
            href={`/${publishedSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '0.75rem', color: 'var(--color-success)' }}
          >
            View live page →
          </a>
        )}
      </div>
      {saveError && <p style={{ fontSize: '0.75rem', margin: 0, color: 'var(--color-destructive)' }}>{saveError}</p>}
      {publishError && <p style={{ fontSize: '0.75rem', margin: 0, color: 'var(--color-destructive)' }}>{publishError}</p>}

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
          <option value="published">Published</option>
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
