'use client'

import { useMemo, useRef } from 'react'
import { Puck } from '@puckeditor/core'
import type { Data } from '@puckeditor/core'
import '@puckeditor/core/no-external.css'
import { footerPuckConfig } from '@/lib/puck/config'
import { MenuSelectField } from '@/lib/puck/MenuSelectField'
import MenuBlockEditorPreview from '@/lib/puck/MenuBlockEditorPreview'

type Props = {
  mode: 'footer'
  initialData: Data
  onChange: (data: Data) => void
}

export default function AppearancePuckEditor({ initialData, onChange }: Props) {
  const hasChangedRef = useRef(false)

  const editorConfig = useMemo(() => ({
    ...footerPuckConfig,
    components: {
      ...footerPuckConfig.components,
      MenuBlock: {
        ...footerPuckConfig.components.MenuBlock,
        fields: {
          ...footerPuckConfig.components.MenuBlock.fields,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }), [])

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
