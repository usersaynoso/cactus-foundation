'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { Puck } from '@puckeditor/core'
import type { Data } from '@puckeditor/core'
import '@puckeditor/core/no-external.css'
import puckConfig from '@/lib/puck/config'
import { OgImagePickerField, ImageUrlPickerField } from '@/lib/puck/MediaPickerField'
import { MenuCheckboxField } from '@/lib/puck/MenuCheckboxField'

type Props = {
  pageId: string
  initialData: Data
  canPublish: boolean
  canManageMenus: boolean
}

const AUTOSAVE_DEBOUNCE_MS = 1500

export default function PuckEditor({ pageId, initialData, canPublish, canManageMenus }: Props) {
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [publishError, setPublishError] = useState('')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const rootProps = initialData.root?.props as Record<string, unknown> | undefined
  const [isPublished, setIsPublished] = useState(rootProps?.status === 'published')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Build editor config inside the component so canManageMenus can gate menuIds field
  const editorConfig = useMemo(() => ({
    ...puckConfig,
    root: {
      ...puckConfig.root,
      fields: {
        title:           { type: 'text' as const,     label: 'Title' },
        slug:            { type: 'text' as const,     label: 'Slug' },
        status:          {
          type: 'select' as const,
          label: 'Status',
          options: [
            { value: 'draft',     label: 'Draft' },
            { value: 'published', label: 'Published (use Publish button)' },
          ],
        },
        metaDescription: { type: 'textarea' as const, label: 'Meta description' },
        ogImageId: {
          type: 'custom' as const,
          label: 'OG image',
          render: OgImagePickerField,
        },
        ...(canManageMenus ? {
          menuIds: {
            type: 'custom' as const,
            label: 'Show in menus',
            render: MenuCheckboxField,
          },
        } : {}),
      },
    },
    components: {
      ...puckConfig.components,
      ImageBlock: {
        ...puckConfig.components.ImageBlock,
        fields: {
          ...puckConfig.components.ImageBlock.fields,
          mediaUrl: {
            type: 'custom' as const,
            label: 'Image',
            render: ImageUrlPickerField,
          },
        },
      },
    },
  }), [canManageMenus])

  const handleChange = useCallback((data: Data) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSaveError('')
      setSaving(true)
      try {
        const rootProps = data.root?.props as Record<string, unknown> | undefined
        const menuIds = canManageMenus && Array.isArray(rootProps?.menuIds)
          ? (rootProps.menuIds as string[])
          : undefined

        const res = await fetch(`/api/admin/pages/${pageId}/autosave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, ...(menuIds !== undefined ? { menuIds } : {}) }),
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
  }, [pageId])

  const handlePublish = useCallback(async (data: Data) => {
    // Cancel any pending autosave so it cannot overwrite published status after we set it
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    setPublishError('')
    setPublishing(true)
    try {
      const res = await fetch(`/api/admin/pages/${pageId}/publish`, {
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
  }, [pageId])

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Status bar */}
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

      {/* Puck editor — takes remaining height */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Puck
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          config={editorConfig as any}
          data={initialData}
          onChange={handleChange}
          onPublish={canPublish ? handlePublish : undefined}
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
