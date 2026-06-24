'use client'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Puck } from '@puckeditor/core'
import type { Data } from '@puckeditor/core'
import '@puckeditor/core/no-external.css'
import { puckTemplateConfig } from '@/lib/puck/config'
import { ImageUrlPickerField } from '@/lib/puck/MediaPickerField'
import { MenuSelectField } from '@/lib/puck/MenuSelectField'
import MenuBlockEditorPreview from '@/lib/puck/MenuBlockEditorPreview'

type Props = {
  templateId: string
  templateName: string
  initialData: Data
  initialStatus: 'draft' | 'published'
}

const AUTOSAVE_DEBOUNCE_MS = 1500

export default function TemplateEditor({ templateId, initialData, initialStatus }: Props) {
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [publishError, setPublishError] = useState('')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [isPublished, setIsPublished] = useState(initialStatus === 'published')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editorConfig = useMemo(() => ({
    ...puckTemplateConfig,
    components: {
      ...puckTemplateConfig.components,
      ImageBlock: {
        ...puckTemplateConfig.components.ImageBlock,
        fields: {
          ...puckTemplateConfig.components.ImageBlock.fields,
          mediaUrl: { type: 'custom' as const, label: 'Image', render: ImageUrlPickerField },
        },
      },
      Card: {
        ...puckTemplateConfig.components.Card,
        fields: {
          ...puckTemplateConfig.components.Card.fields,
          mediaUrl: { type: 'custom' as const, label: 'Image', render: ImageUrlPickerField },
        },
      },
      MenuBlock: {
        ...puckTemplateConfig.components.MenuBlock,
        fields: {
          ...puckTemplateConfig.components.MenuBlock.fields,
          menuId: { type: 'custom' as const, label: 'Menu', render: MenuSelectField },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  }), [])

  const handleChange = useCallback((data: Data) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSaveError('')
      setSaving(true)
      try {
        const res = await fetch(`/api/admin/templates/${templateId}/autosave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data }),
        })
        if (!res.ok) {
          const d = await res.json()
          setSaveError(d.error ?? 'Autosave failed')
        } else {
          setLastSaved(new Date())
        }
      } catch {
        setSaveError('Autosave failed — check your connection')
      } finally {
        setSaving(false)
      }
    }, AUTOSAVE_DEBOUNCE_MS)
  }, [templateId])

  const handlePublish = useCallback(async (data: Data) => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    setPublishError('')
    setPublishing(true)
    try {
      const res = await fetch(`/api/admin/templates/${templateId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      })
      const d = await res.json()
      if (!res.ok) {
        setPublishError(d.error ?? 'Publish failed')
      } else {
        setIsPublished(true)
        setLastSaved(new Date())
      }
    } catch {
      setPublishError('Publish failed — check your connection')
    } finally {
      setPublishing(false)
    }
  }, [templateId])

  return (
    <div style={{ height: 'calc(100vh - 53px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1rem',
        padding: '0.5rem 1rem',
        background: '#f9fafb',
        borderBottom: '1px solid #e5e7eb',
        fontSize: '0.8125rem',
        color: '#6b7280',
        flexShrink: 0,
      }}>
        <span>
          {saving ? 'Saving draft…'
            : lastSaved ? `Draft saved ${lastSaved.toLocaleTimeString()}`
            : 'Unsaved'}
        </span>
        {saveError && <span style={{ color: '#dc2626' }}>{saveError}</span>}
        {publishError && <span style={{ color: '#dc2626' }}>{publishError}</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isPublished && (
            <span style={{ background: '#dcfce7', color: '#15803d', padding: '0.125rem 0.5rem', borderRadius: 4, fontWeight: 500 }}>
              Published
            </span>
          )}
        </span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Puck
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          config={editorConfig as any}
          data={initialData}
          onChange={handleChange}
          onPublish={handlePublish}
        />
      </div>
      {publishing && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(255,255,255,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1rem', fontWeight: 600, color: '#374151',
        }}>
          Publishing…
        </div>
      )}
    </div>
  )
}
