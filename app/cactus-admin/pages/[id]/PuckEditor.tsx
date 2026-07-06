'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Puck } from '@puckeditor/core'
import type { Data } from '@puckeditor/core'
import '@puckeditor/core/no-external.css'
import '@/lib/puck/tabs/sidebarOverrides.css'
import puckConfig from '@/lib/puck/config'
import { ImageUrlPickerField } from '@/lib/puck/MediaPickerField'
import { MenuSelectField } from '@/lib/puck/MenuSelectField'
import MenuBlockEditorPreview from '@/lib/puck/MenuBlockEditorPreview'
import SiteLogoEditorPreview from '@/lib/puck/SiteLogoEditorPreview'
import { createPanelPlugin, tabIcon } from '@/lib/puck/tabs/createPanelPlugin'
import PageSettingsTab from '@/lib/puck/tabs/PageSettingsTab'
import SeoTab from '@/lib/puck/tabs/SeoTab'
import PageHistoryTab from '@/lib/puck/tabs/PageHistoryTab'
import SavedBlocksTab from '@/lib/puck/tabs/SavedBlocksTab'

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
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null)
  const rootProps = initialData.root?.props as Record<string, unknown> | undefined
  const [isPublished, setIsPublished] = useState(rootProps?.status === 'published')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Current editor data — kept in a ref so restore can read it without stale closure
  const currentDataRef = useRef<Data>(initialData)

  // The admin shell only carries its own --color-primary family (buildAdminThemeStyles).
  // Blocks read the site's actual design tokens (--btn-bg, --h2-family, --caption-*,
  // --img-radius, etc.), so without this the canvas renders buttons/headings/images in
  // the admin's own look rather than the site's — mirrors LayoutPuckEditor's injection.
  useEffect(() => {
    let mounted = true
    let styleEl: HTMLStyleElement | null = null
    let linkEl: HTMLLinkElement | null = null

    fetch('/api/admin/appearance')
      .then(r => r.json())
      .then(async d => {
        if (!mounted || !d.designTokens) return
        const { buildTokenStyles, buildFontHref } = await import('@/lib/design/tokens')
        const css = buildTokenStyles(d.designTokens)
        const href = buildFontHref(d.designTokens)
        if (!mounted) return

        styleEl = document.createElement('style')
        styleEl.id = 'cactus-token-styles'
        styleEl.textContent = css
        document.head.appendChild(styleEl)

        if (href && !document.getElementById('cactus-token-fonts')) {
          linkEl = document.createElement('link')
          linkEl.rel = 'stylesheet'
          linkEl.href = href
          linkEl.id = 'cactus-token-fonts'
          document.head.appendChild(linkEl)
        }
      })
      .catch(() => {})

    return () => {
      mounted = false
      styleEl?.remove()
      linkEl?.remove()
    }
  }, [])

  // Version history tab state
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async history load on mount; setLoading(false) only fires after awaits
    loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount, loadHistory is stable for a given pageId
  }, [])

  const editorConfig = useMemo(() => ({
    ...puckConfig,
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
      ImageChipPanel: {
        ...puckConfig.components.ImageChipPanel,
        fields: {
          ...puckConfig.components.ImageChipPanel.fields,
          mediaUrl: {
            type: 'custom' as const,
            label: 'Image',
            render: ImageUrlPickerField,
          },
        },
      },
      SiteLogo: {
        ...puckConfig.components.SiteLogo,
        render: (props: any) => <SiteLogoEditorPreview {...props} />,
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
  }), [])

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
        if (d.slug) setPublishedSlug(d.slug)
        loadHistory()
      }
    } catch {
      setPublishError('Publish failed — check your connection')
    } finally {
      setPublishing(false)
    }
  }, [pageId, loadHistory])

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

  const plugins = useMemo(() => [
    createPanelPlugin({
      name: 'settings',
      label: 'Settings',
      icon: tabIcon('⚙'),
      content: <PageSettingsTab canManageMenus={canManageMenus} />,
    }),
    createPanelPlugin({
      name: 'seo',
      label: 'SEO',
      icon: tabIcon('◈'),
      content: <SeoTab />,
    }),
    createPanelPlugin({
      name: 'history',
      label: 'History',
      icon: tabIcon('↺'),
      content: (
        <PageHistoryTab
          versions={historyVersions}
          loading={historyLoading}
          error={historyError}
          restoringIndex={restoringIndex}
          onRestore={handleRestore}
        />
      ),
    }),
    createPanelPlugin({
      name: 'saved-blocks',
      label: 'Saved Blocks',
      icon: tabIcon('▤'),
      content: <SavedBlocksTab />,
    }),
  ], [canManageMenus, historyVersions, historyLoading, historyError, restoringIndex, handleRestore])

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
          {publishedSlug && (
            <a
              href={`/${publishedSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '0.25rem 0.75rem',
                borderRadius: 4,
                background: 'var(--color-success-bg)',
                border: '1px solid var(--color-success)',
                color: 'var(--color-success)',
                textDecoration: 'none',
                fontSize: '0.8125rem',
                fontWeight: 500,
              }}
            >
              View live page →
            </a>
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
        </span>
      </div>

      {/* Puck editor — takes remaining height */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Puck
          config={editorConfig as any}
          data={initialData}
          onChange={handleChange}
          onPublish={canPublish ? handlePublish : undefined}
          plugins={plugins}
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
