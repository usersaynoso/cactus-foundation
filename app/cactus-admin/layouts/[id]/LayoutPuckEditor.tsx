'use client'

import { useCallback, useMemo, useRef } from 'react'
import { Puck } from '@puckeditor/core'
import type { Data } from '@puckeditor/core'
import '@puckeditor/core/no-external.css'
import { layoutPuckConfig } from '@/lib/puck/config'
import { ImageUrlPickerField } from '@/lib/puck/MediaPickerField'

type Props = {
  initialData: Data
  onChange: (data: Data) => void
  onPublish: (data: Data) => void
  isPublishing: boolean
}

export default function LayoutPuckEditor({ initialData, onChange, onPublish, isPublishing }: Props) {
  const hasChangedRef = useRef(false)
  const latestDataRef = useRef<Data>(initialData)

  const editorConfig = useMemo(() => ({
    ...layoutPuckConfig,
    components: {
      ...layoutPuckConfig.components,
      ImageBlock: {
        ...(layoutPuckConfig.components as any).ImageBlock,
        fields: {
          ...(layoutPuckConfig.components as any).ImageBlock?.fields,
          mediaUrl: { type: 'custom' as const, label: 'Image', render: ImageUrlPickerField },
        },
      },
    },
  }), [])

  const handleChange = useCallback((data: Data) => {
    latestDataRef.current = data
    if (!hasChangedRef.current) { hasChangedRef.current = true; return }
    onChange(data)
  }, [onChange])

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Puck
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config={editorConfig as any}
        data={initialData}
        onChange={handleChange}
        overrides={{
          actionBar: ({ label, children }) => (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {children}
              <button
                onClick={() => onPublish(latestDataRef.current)}
                disabled={isPublishing}
                style={{ padding: '0.375rem 0.875rem', background: '#16a34a', color: '#ffffff', border: 'none', borderRadius: 4, fontWeight: 600, fontSize: '0.8125rem', cursor: isPublishing ? 'default' : 'pointer', fontFamily: 'inherit', opacity: isPublishing ? 0.7 : 1 }}
              >
                {isPublishing ? 'Publishing…' : 'Publish'}
              </button>
            </div>
          ),
        }}
      />
    </div>
  )
}
