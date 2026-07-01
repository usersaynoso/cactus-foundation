'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Puck } from '@puckeditor/core'
import type { Data } from '@puckeditor/core'
import '@puckeditor/core/no-external.css'
import puckConfig from '@/lib/puck/config'
import { OgImagePickerField, ImageUrlPickerField } from '@/lib/puck/MediaPickerField'
import { MenuCheckboxField } from '@/lib/puck/MenuCheckboxField'
import { MenuSelectField } from '@/lib/puck/MenuSelectField'
import MenuBlockEditorPreview from '@/lib/puck/MenuBlockEditorPreview'

type Props = {
  pageId: string
  initialData: Data
  canPublish: boolean
  canManageMenus: boolean
}

type HistoryVersion = {
  index: 'live' | number
  at: string | null
  title: string
  byName: string | null
  isLive: boolean
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

  // Current editor data — kept in a ref so restore can read it without stale closure
  const currentDataRef = useRef<Data>(initialData)

  // Version history panel state
  const [showHistory, setShowHistory] = useState(false)
  const [historyVersions, setHistoryVersions] = useState<HistoryVersion[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [restoringIndex, setRestoringIndex] = useState<'live' | number | null>(null)

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const res = await fetch(`/api/admin/pages/${pageId}/history`)
      const d = await res.json()
      if (!res.ok) {
        setHistoryError(d.error ?? 'Failed to load history')
      } else {
        setHistoryVersions(d.versions ?? [])
      }
    } catch {
      setHistoryError('Failed to load history')
    } finally {
      setHistoryLoading(false)
    }
  }, [pageId])

  useEffect(() => {
    if (showHistory) loadHistory()
  }, [showHistory, loadHistory])

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
      Card: {
        ...puckConfig.components.Card,
        fields: {
          ...puckConfig.components.Card.fields,
          mediaUrl: {
            type: 'custom' as const,
            label: 'Image',
            render: ImageUrlPickerField,
          },
        },
      },
      MenuBlock: {
        ...puckConfig.components.MenuBlock,
        fields: {
          ...puckConfig.components.MenuBlock.fields,
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
  }), [canManageMenus])

  const doAutosave = useCallback(async (data: Data) => {
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
  }, [pageId, canManageMenus])

  const handleChange = useCallback((data: Data) => {
    currentDataRef.current = data
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doAutosave(data), AUTOSAVE_DEBOUNCE_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doAutosave is stable; adding it would reset the timer unnecessarily
  }, [pageId])

  const handlePublish = useCallback(async (data: Data) => {
    // Cancel any pending autosave so it cannot race with the publish
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
        // Refresh history list if panel is open
        if (showHistory) loadHistory()
      }
    } catch {
      setPublishError('Publish failed — check your connection')
    } finally {
      setPublishing(false)
    }
  }, [pageId, showHistory, loadHistory])

  const handleRestore = useCallback(async (index: 'live' | number) => {
    setRestoringIndex(index)
    try {
      const res = await fetch(`/api/admin/pages/${pageId}/history?index=${index}`)
      const d = await res.json()
      if (!res.ok || !d.data) {
        setHistoryError(d.error ?? 'Failed to load version')
        setRestoringIndex(null)
        return
      }

      const restoredData = d.data as Data

      if (!confirm('Load this version into the editor? Your current unsaved changes will be replaced.')) {
        setRestoringIndex(null)
        return
      }

      // Cancel any pending debounced autosave
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }

      // Update the ref and trigger an immediate autosave so the restored content
      // is persisted even if the user navigates away before the debounce fires.
      currentDataRef.current = restoredData
      await doAutosave(restoredData)

      // Reload the page so Puck re-initialises with the restored data
      window.location.reload()
    } catch {
      setHistoryError('Failed to restore version')
    } finally {
      setRestoringIndex(null)
    }
  }, [pageId, doAutosave])

  function formatAt(at: string | null): string {
    if (!at) return 'Unknown date'
    try {
      return new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    } catch {
      return at
    }
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Status bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1rem',
        padding: '0.5rem 1rem',
        background: 'var(--color-bg-subtle)',
        borderBottom: '1px solid var(--color-border)',
        fontSize: '0.8125rem',
        color: 'var(--color-text-muted)',
        flexShrink: 0,
      }}>
        <span>
          {saving ? 'Saving draft…'
            : lastSaved ? `Draft saved ${lastSaved.toLocaleTimeString()}`
            : 'Unsaved'}
        </span>
        {saveError && <span style={{ color: 'var(--color-destructive)' }}>{saveError}</span>}
        {publishError && <span style={{ color: 'var(--color-destructive)' }}>{publishError}</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isPublished && (
            <span className="badge badge-success" style={{ padding: '0.125rem 0.5rem', borderRadius: 4, fontWeight: 500 }}>
              Published
            </span>
          )}
          <a
            href={`/page-preview/${pageId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '0.25rem 0.75rem',
              borderRadius: 4,
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
              textDecoration: 'none',
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Preview
          </a>
          <button
            onClick={() => setShowHistory((v) => !v)}
            style={{
              padding: '0.25rem 0.75rem',
              borderRadius: 4,
              background: showHistory ? 'var(--color-bg-inverted)' : 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              color: showHistory ? 'var(--color-bg)' : 'var(--color-text)',
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Version history
          </button>
        </span>
      </div>

      {/* Version history panel */}
      {showHistory && (
        <div style={{
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-bg)',
          maxHeight: '280px',
          overflowY: 'auto',
          flexShrink: 0,
        }}>
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: '0.8125rem' }}>
            Version history
          </div>
          {historyLoading && (
            <div style={{ padding: '1rem', color: 'var(--color-muted)', fontSize: '0.8125rem' }}>Loading…</div>
          )}
          {historyError && (
            <div style={{ padding: '1rem', color: 'var(--color-destructive)', fontSize: '0.8125rem' }}>{historyError}</div>
          )}
          {!historyLoading && !historyError && historyVersions.length === 0 && (
            <div style={{ padding: '1rem', color: 'var(--color-muted)', fontSize: '0.8125rem' }}>No published versions yet.</div>
          )}
          {historyVersions.map((v) => (
            <div
              key={String(v.index)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.6rem 1rem',
                borderBottom: '1px solid var(--color-border)',
                fontSize: '0.8125rem',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: v.isLive ? 600 : 400 }}>{v.title}</span>
                {v.isLive && (
                  <span style={{ marginLeft: '0.4rem', padding: '0.1rem 0.4rem', borderRadius: 3, background: 'var(--color-success-bg)', color: 'var(--color-success)', fontSize: '0.75rem', fontWeight: 600 }}>
                    Live
                  </span>
                )}
                <div style={{ color: 'var(--color-muted)', marginTop: '0.15rem', fontSize: '0.75rem' }}>
                  {formatAt(v.at)}{v.byName ? ` · ${v.byName}` : ''}
                </div>
              </div>
              <button
                onClick={() => handleRestore(v.index)}
                disabled={restoringIndex !== null}
                style={{
                  padding: '0.2rem 0.65rem',
                  borderRadius: 4,
                  background: 'var(--color-bg-subtle)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                  fontSize: '0.75rem',
                  cursor: restoringIndex !== null ? 'not-allowed' : 'pointer',
                  opacity: restoringIndex === v.index ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {restoringIndex === v.index ? 'Loading…' : 'Load into editor'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Puck editor — takes remaining height */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Puck

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
          fontSize: '1rem', fontWeight: 600, color: 'var(--color-text)',
        }}>
          Publishing…
        </div>
      )}
    </div>
  )
}
