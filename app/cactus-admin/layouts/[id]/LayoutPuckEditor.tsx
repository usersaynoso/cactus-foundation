'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Puck } from '@puckeditor/core'
import type { Data } from '@puckeditor/core'
import '@puckeditor/core/no-external.css'
import '@/lib/puck/tabs/sidebarOverrides.css'
import { layoutPuckConfig, headerPuckConfig, footerPuckConfig, fullPagePuckConfig, getModuleLayoutPuckConfig, wrapResponsiveRender } from '@/lib/puck/config'
import { buildPuckViewports } from '@/lib/puck/viewportSizes'
import { moduleLayoutTypeToGroup } from '@/lib/layout/module-layout-types'
import { getLayoutTypeLabel } from '@/lib/layout/layout-type-labels'
import { ImageUrlPickerField } from '@/lib/puck/MediaPickerField'
import { MenuSelectField } from '@/lib/puck/MenuSelectField'
import MenuBlockEditorPreview from '@/lib/puck/MenuBlockEditorPreview'
import SiteLogoEditorPreview from '@/lib/puck/SiteLogoEditorPreview'
import { createPanelPlugin, settingsTabIcon, conditionsTabIcon, historyTabIcon, savedBlocksTabIcon } from '@/lib/puck/tabs/createPanelPlugin'
import { hideRootFieldsOverride } from '@/lib/puck/tabs/rootFieldsOverride'
import { createBackLinkOverride } from '@/lib/puck/tabs/headerBackLinkOverride'
import { createViewportDropdownOverride } from '@/lib/puck/tabs/ViewportDropdownOverride'
import { createHeaderActionsOverride } from '@/lib/puck/tabs/headerActionsOverride'
import SavedBlocksTab from '@/lib/puck/tabs/SavedBlocksTab'
import LayoutSettingsTab from '@/lib/puck/tabs/LayoutSettingsTab'
import PageHistoryTab from '@/lib/puck/tabs/PageHistoryTab'
import DisplayConditionsPanel from './DisplayConditionsPanel'

type HistoryVersion = {
  index: 'live' | number
  at: string | null
  title: string
  byName: string | null
  isLive: boolean
}

type DisplayConditions = { include: unknown[]; exclude: unknown[] }

type Props = {
  initialData: Data
  onChange: (data: Data) => void
  onPublish: (data: Data) => void
  isPublishing: boolean
  layoutType?: string
  backHref: string
  layoutId: string
  onDeleteClick: () => void
  deleting: boolean
  canDelete: boolean
  // Settings tab
  name: string
  description: string | null
  priority: number
  status: string
  onSettingsSave: (patch: { name: string; description: string | null; priority: number }) => void
  onStatusChange: (status: string) => void
  saving: boolean
  saved: boolean
  error: string
  // Conditions tab
  displayConditions: unknown
  onConditionsSave: (conditions: DisplayConditions) => void
  // History tab
  historyVersions: HistoryVersion[]
  historyLoading: boolean
  historyError: string
  restoringIndex: 'live' | number | null
  onRestore: (index: 'live' | number) => void
}

function getConfig(type: string | undefined) {
  switch (type) {
    case 'header': return headerPuckConfig
    case 'footer': return footerPuckConfig
    case 'notFound':
    case 'statusPage': return fullPagePuckConfig
    case 'infoPage': return layoutPuckConfig
    default:
      if (type && moduleLayoutTypeToGroup[type]) return getModuleLayoutPuckConfig(type)
      return layoutPuckConfig
  }
}

export default function LayoutPuckEditor({ initialData, onChange, onPublish, isPublishing, layoutType, backHref, layoutId, onDeleteClick, deleting, canDelete, name, description, priority, status, onSettingsSave, onStatusChange, saving, saved, error, displayConditions, onConditionsSave, historyVersions, historyLoading, historyError, restoringIndex, onRestore }: Props) {
  const hasChangedRef = useRef(false)
  const latestDataRef = useRef<Data>(initialData)
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

  // getConfig() allocates a brand-new config object on every call for module-contributed
  // layout types (getModuleLayoutPuckConfig doesn't cache), so without this useMemo the
  // components list handed to Puck's left sidebar got a new object identity on every
  // render - Puck reinitialises that panel each time, which reads as constant flashing.
  const baseConfig = useMemo(() => getConfig(layoutType), [layoutType])
  // Header/footer configs define real root-level fields (background, height, etc.) that
  // must stay visible with nothing selected. Every other config here leaves root.fields
  // undefined, so Puck falls back to a redundant default Title field — hide that case only.
  const puckViewports = useMemo(() => buildPuckViewports(designTokens), [designTokens])

  const puckOverrides = useMemo(
    () => ({
      header: createBackLinkOverride(backHref, 'Back to Layouts'),
      headerActions: createHeaderActionsOverride({
        previewHref: `/layout-preview/${layoutId}`,
        onDeleteClick,
        deleting,
        canDelete,
      }),
      ...((baseConfig as { root?: { fields?: unknown } }).root?.fields ? {} : { fields: hideRootFieldsOverride }),
      puck: createViewportDropdownOverride(puckViewports),
    }),
    [baseConfig, backHref, layoutId, onDeleteClick, deleting, canDelete, puckViewports],
  )

  const editorConfig = useMemo(() => ({
    ...baseConfig,
    components: {
      ...baseConfig.components,
      ...(('ImageBlock' in (baseConfig.components ?? {})) ? {
        ImageBlock: {

          ...(baseConfig.components as any).ImageBlock,
          fields: {

            ...(baseConfig.components as any).ImageBlock?.fields,
            mediaUrl: { type: 'custom' as const, label: 'Image', render: ImageUrlPickerField },
          },
        },
      } : {}),
      ...(('ImageChipPanel' in (baseConfig.components ?? {})) ? {
        ImageChipPanel: {
          ...(baseConfig.components as any).ImageChipPanel,
          fields: {
            ...(baseConfig.components as any).ImageChipPanel?.fields,
            mediaUrl: { type: 'custom' as const, label: 'Image', render: ImageUrlPickerField },
          },
        },
      } : {}),
      ...(('SiteLogo' in (baseConfig.components ?? {})) ? {
        SiteLogo: {
          ...(baseConfig.components as any).SiteLogo,
          render: wrapResponsiveRender((props: any) => <SiteLogoEditorPreview {...props} />),
        },
      } : {}),
      ...(('MenuBlock' in (baseConfig.components ?? {})) ? {
        MenuBlock: {
          ...(baseConfig.components as any).MenuBlock,
          fields: {
            ...(baseConfig.components as any).MenuBlock?.fields,
            menuId: { type: 'custom' as const, label: 'Menu', render: MenuSelectField },
          },
          render: wrapResponsiveRender((props: any) => (
            <MenuBlockEditorPreview
              menuId={props.menuId ?? ''}
              orientation={props.orientation ?? 'horizontal'}
              spacing={props.spacing ?? 'normal'}
              showDropdowns={props.showDropdowns ?? 'hover'}
              navToggle={props.navToggle}
              itemFontSize={props.itemFontSize}
              itemFontWeight={props.itemFontWeight}
              textTransform={props.textTransform}
              itemColor={props.itemColor}
            />
          )),
        },
      } : {}),
    },
  }), [baseConfig])

  const handleChange = useCallback((data: Data) => {
    latestDataRef.current = data
    if (!hasChangedRef.current) { hasChangedRef.current = true; return }
    onChange(data)
  }, [onChange])

  const plugins = useMemo(() => [
    createPanelPlugin({
      name: 'settings', label: 'Settings', icon: settingsTabIcon,
      content: (
        <LayoutSettingsTab
          name={name}
          description={description}
          priority={priority}
          status={status}
          onSave={onSettingsSave}
          onStatusChange={onStatusChange}
          saving={saving}
          saved={saved}
          error={error}
        />
      ),
    }),
    createPanelPlugin({
      name: 'conditions', label: 'Conditions', icon: conditionsTabIcon,
      content: (
        <DisplayConditionsPanel
          key={JSON.stringify(displayConditions)}
          layoutType={layoutType ?? ''}
          existing={displayConditions}
          onSave={onConditionsSave}
        />
      ),
    }),
    createPanelPlugin({
      name: 'history', label: 'History', icon: historyTabIcon,
      content: (
        <PageHistoryTab
          versions={historyVersions}
          loading={historyLoading}
          error={historyError}
          restoringIndex={restoringIndex}
          onRestore={onRestore}
        />
      ),
    }),
    createPanelPlugin({ name: 'saved-blocks', label: 'Saved Blocks', icon: savedBlocksTabIcon, content: <SavedBlocksTab /> }),
  ], [name, description, priority, status, onSettingsSave, onStatusChange, saving, saved, error, displayConditions, layoutType, onConditionsSave, historyVersions, historyLoading, historyError, restoringIndex, onRestore])

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div ref={canvasWrapRef} style={{ flex: 1, overflow: 'hidden' }}>
        {canvasReady && (
          <Puck
            config={editorConfig as any}
            data={initialData}
            onChange={handleChange}
            overrides={puckOverrides}
            onPublish={() => onPublish(latestDataRef.current)}
            plugins={plugins}
            viewports={puckViewports}
            headerTitle={getLayoutTypeLabel(layoutType)}
          />
        )}
      </div>
    </div>
  )
}
