'use client'

import { createUsePuck } from '@puckeditor/core'
import { OgImagePickerField } from '@/lib/puck/MediaPickerField'

const usePuck = createUsePuck()

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.375rem 0.5rem', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', fontFamily: 'inherit',
  background: 'var(--color-surface)', color: 'var(--color-text)', boxSizing: 'border-box',
  minHeight: 80, resize: 'vertical',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.375rem',
}

export default function SeoTab() {
  const appState = usePuck(s => s.appState)
  const dispatch = usePuck(s => s.dispatch)
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
        SEO
      </div>

      <div>
        <label style={labelStyle}>Meta description</label>
        <textarea
          style={inputStyle}
          value={typeof props.metaDescription === 'string' ? props.metaDescription : ''}
          onChange={(e) => set('metaDescription', e.target.value)}
        />
      </div>

      <OgImagePickerField
        value={typeof props.ogImageId === 'string' ? props.ogImageId : ''}
        onChange={(v) => set('ogImageId', v)}
        field={{ type: 'custom', label: 'OG image', render: () => <></> }}
        id="ogImageId"
        name="ogImageId"
        readOnly={false}
      />
    </div>
  )
}
