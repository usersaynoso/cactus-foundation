'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Puck } from '@puckeditor/core'
import type { Data } from '@puckeditor/core'
import '@puckeditor/core/no-external.css'
import '@/lib/puck/tabs/sidebarOverrides.css'
import puckConfig, { wrapResponsiveRender } from '@/lib/puck/config'
import { buildPuckViewports } from '@/lib/puck/viewportSizes'
import { ImageUrlPickerField } from '@/lib/puck/MediaPickerField'
import { MenuSelectField } from '@/lib/puck/MenuSelectField'
import MenuBlockEditorPreview from '@/lib/puck/MenuBlockEditorPreview'
import SiteLogoEditorPreview from '@/lib/puck/SiteLogoEditorPreview'
import { createPanelPlugin, settingsTabIcon, conditionsTabIcon, historyTabIcon, savedBlocksTabIcon } from '@/lib/puck/tabs/createPanelPlugin'
import { createBackLinkOverride } from '@/lib/puck/tabs/headerBackLinkOverride'
import { createViewportDropdownOverride } from '@/lib/puck/tabs/ViewportDropdownOverride'
import { createHeaderActionsOverride } from '@/lib/puck/tabs/headerActionsOverride'
import PageSettingsTab from '@/lib/puck/tabs/PageSettingsTab'
import SeoTab from '@/lib/puck/tabs/SeoTab'
import PageHistoryTab from '@/lib/puck/tabs/PageHistoryTab'
import SavedBlocksTab from '@/lib/puck/tabs/SavedBlocksTab'

type Props = {
  pageId: string
  initialData: Data
  canPublish: boolean
  canManageMenus: boolean
  backHref: string
  onDeleteClick: () => void
  deleting: boolean
}

type HistoryVersion = {
  index: 'live' | number
  at: string | null
  title: string
  byName: string | null
  isLive: boolean
}

const AUTOSAVE_DEBOUNCE_MS = 1500

export default function PuckEditor({ pageId, initialData, canPublish, canManageMenus, backHref, onDeleteClick, deleting }: Props) {
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
  const canvasWrapRef = useRef<HTMLDivElement>(null)
  const [canvasReady, setCanvasReady] = useState(false)

  // Puck measures this wrapper on mount to size its zoomed canvas. If it mounts while
  // the wrapper is still 0x0 (flex layout not yet settled), Puck's height/width === 0
  // divide-by-zero produces a transient `NaN` height console error. Wait for a real
  // measured size before mounting <Puck> so its first measurement is already correct.
  useEffect(() => {
    const el = canvasWrapRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) { setCanvasReady(true); observer.disconnect() }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // The admin shell only carries its own --color-primary family (buildAdminThemeStyles).
  // Blocks read the site's actual design tokens (--btn-bg, --h2-family, --caption-*,
  // --img-radius, etc.), so without this the canvas renders buttons/headings/images in
  // the admin's own look rather than the site's — mirrors LayoutPuckEditor's injection.
  const [designTokens, setDesignTokens] = useState<unknown>(null)

  useEffect(() => {
    let mounted = true
    let styleEl: HTMLStyleElement | null = null
    let linkEl: HTMLLinkElement | null = null

    fetch('/api/admin/appearance')
      .then(r => r.json())
      .then(async d => {
        if (!mounted || !d.designTokens) return
        setDesignTokens(d.designTokens)
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
        render: wrapResponsiveRender((props: any) => <SiteLogoEditorPreview {...props} />),
      },
      MenuBlock: {
        ...puckConfig.components.MenuBlock,
        fields: {
          ...puckConfig.components.MenuBlock.fields,
          menuId: { type: 'custom' as const, label: 'Menu', render: MenuSelectField },
        },

        render: wrapResponsiveRender((props: any) => (
          <MenuBlockEditorPreview
            menuId={props.menuId ?? ''}
            orientation={props.orientation ?? 'horizontal'}
            spacing={props.spacing ?? 'normal'}
            showDropdowns={props.showDropdowns ?? 'hover'}
            navToggle={props.navToggle}
          />
        )),
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
    // Cancel any pending autosave so it cannot race with this action
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    const rootProps = (data.root?.props ?? {}) as Record<string, unknown>
    const wantsDraft = rootProps.status === 'draft'

    setPublishError('')
    setPublishing(true)
    try {
      if (wantsDraft) {
        // Settings tab has this set to Draft — honour it: unpublish (if currently live)
        // and just save the content, never call the publish endpoint.
        if (isPublished) {
          const patchRes = await fetch(`/api/admin/pages/${pageId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'draft' }),
          })
          if (!patchRes.ok) {
            const d = await patchRes.json()
            setPublishError(d.error ?? 'Failed to unpublish')
            return
          }
          setIsPublished(false)
          setPublishedSlug(null)
        }
        await doAutosave(data)
      } else {
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
      }
    } catch {
      setPublishError('Update failed — check your connection')
    } finally {
      setPublishing(false)
    }
  }, [pageId, loadHistory, isPublished, doAutosave])

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

  const puckViewports = useMemo(() => buildPuckViewports(designTokens), [designTokens])

  const puckOverrides = useMemo(() => ({
    header: createBackLinkOverride(backHref, 'Back to Pages'),
    headerActions: createHeaderActionsOverride({
      previewHref: `/page-preview/${pageId}`,
      onDeleteClick,
      deleting,
    }),
    puck: createViewportDropdownOverride(puckViewports),
  }), [backHref, pageId, onDeleteClick, deleting, puckViewports])

  const plugins = useMemo(() => [
    createPanelPlugin({
      name: 'settings',
      label: 'Settings',
      icon: settingsTabIcon,
      content: (
        <PageSettingsTab
          canManageMenus={canManageMenus}
          saving={saving}
          lastSaved={lastSaved}
          saveError={saveError}
          publishError={publishError}
          isPublished={isPublished}
          publishedSlug={publishedSlug}
        />
      ),
    }),
    createPanelPlugin({
      name: 'seo',
      label: 'SEO',
      icon: conditionsTabIcon,
      content: <SeoTab />,
    }),
    createPanelPlugin({
      name: 'history',
      label: 'History',
      icon: historyTabIcon,
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
      icon: savedBlocksTabIcon,
      content: <SavedBlocksTab />,
    }),
  ], [canManageMenus, saving, lastSaved, saveError, publishError, isPublished, publishedSlug, historyVersions, historyLoading, historyError, restoringIndex, handleRestore])

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Puck editor — takes remaining height */}
      <div ref={canvasWrapRef} style={{ flex: 1, overflow: 'hidden' }}>
        {canvasReady && (
          <Puck
            config={editorConfig as any}
            data={initialData}
            onChange={handleChange}
            onPublish={canPublish ? handlePublish : undefined}
            plugins={plugins}
            overrides={puckOverrides}
            viewports={puckViewports}
          />
        )}
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
