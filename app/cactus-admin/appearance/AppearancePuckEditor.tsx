'use client'

import { useMemo, useRef } from 'react'
import { Puck } from '@puckeditor/core'
import type { Data } from '@puckeditor/core'
import '@puckeditor/core/no-external.css'
import { headerPuckConfig, footerPuckConfig } from '@/lib/puck/config'
import { ImageUrlPickerField } from '@/lib/puck/MediaPickerField'
import { MenuSelectField } from '@/lib/puck/MenuSelectField'
import MenuBlockEditorPreview from '@/lib/puck/MenuBlockEditorPreview'

type Props = {
  mode: 'header' | 'footer'
  initialData: Data
  onChange: (data: Data) => void
}

export default function AppearancePuckEditor({ mode, initialData, onChange }: Props) {
  const baseConfig = mode === 'header' ? headerPuckConfig : footerPuckConfig
  const hasChangedRef = useRef(false)

  const editorConfig = useMemo(() => ({
    ...baseConfig,
    components: {
      ...baseConfig.components,
      ImageBlock: {
        ...(baseConfig.components as any).ImageBlock,
        fields: {
          ...(baseConfig.components as any).ImageBlock?.fields,
          mediaUrl: { type: 'custom' as const, label: 'Image', render: ImageUrlPickerField },
        },
      },
      MenuBlock: {
        ...(baseConfig.components as any).MenuBlock,
        fields: {
          ...(baseConfig.components as any).MenuBlock.fields,
          menuId: { type: 'custom' as const, label: 'Menu', render: MenuSelectField },
        },
        render: (props: any) => (
          <MenuBlockEditorPreview
            menuId={props.menuId ?? ''}
            orientation={props.orientation ?? 'horizontal'}
            spacing={props.spacing ?? 'normal'}
            showDropdowns={props.showDropdowns ?? 'hover'}
            showMobileToggle={props.showMobileToggle ?? 'collapse'}
          />
        ),
      },
    },
  }), [baseConfig])

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Puck
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config={editorConfig as any}
        data={initialData}
        onChange={(data) => {
          if (!hasChangedRef.current) { hasChangedRef.current = true; return }
          onChange(data)
        }}
      />
    </div>
  )
}
