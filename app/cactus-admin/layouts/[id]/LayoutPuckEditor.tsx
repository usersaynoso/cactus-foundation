'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import type React from 'react'
import { Puck } from '@puckeditor/core'
import type { Data } from '@puckeditor/core'
import '@puckeditor/core/no-external.css'
import '@/lib/puck/tabs/sidebarOverrides.css'
import { layoutPuckConfig, headerPuckConfig, footerPuckConfig, fullPagePuckConfig, getModuleLayoutPuckConfig } from '@/lib/puck/config'
import { moduleLayoutTypeToGroup } from '@/lib/layout/module-layout-types'
import { ImageUrlPickerField } from '@/lib/puck/MediaPickerField'
import { MenuSelectField } from '@/lib/puck/MenuSelectField'
import MenuBlockEditorPreview from '@/lib/puck/MenuBlockEditorPreview'
import SiteLogoEditorPreview from '@/lib/puck/SiteLogoEditorPreview'
import { createPanelPlugin, settingsTabIcon, conditionsTabIcon, historyTabIcon, savedBlocksTabIcon } from '@/lib/puck/tabs/createPanelPlugin'
import { hideRootFieldsOverride } from '@/lib/puck/tabs/rootFieldsOverride'
import SavedBlocksTab from '@/lib/puck/tabs/SavedBlocksTab'

type Props = {
  initialData: Data
  onChange: (data: Data) => void
  onPublish: (data: Data) => void
  isPublishing: boolean
  layoutType?: string
  conditionsPanel?: React.ReactNode
  settingsTab?: React.ReactNode
  historyTab?: React.ReactNode
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

export default function LayoutPuckEditor({ initialData, onChange, onPublish, isPublishing, layoutType, conditionsPanel, settingsTab, historyTab }: Props) {
  const hasChangedRef = useRef(false)
  const latestDataRef = useRef<Data>(initialData)

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

  const baseConfig = getConfig(layoutType)
  // Header/footer configs define real root-level fields (background, height, etc.) that
  // must stay visible with nothing selected. Every other config here leaves root.fields
  // undefined, so Puck falls back to a redundant default Title field — hide that case only.
  const puckOverrides = useMemo(
    () => ((baseConfig as { root?: { fields?: unknown } }).root?.fields ? undefined : { fields: hideRootFieldsOverride }),
    [baseConfig],
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
          render: (props: any) => <SiteLogoEditorPreview {...props} />,
        },
      } : {}),
      ...(('MenuBlock' in (baseConfig.components ?? {})) ? {
        MenuBlock: {
          ...(baseConfig.components as any).MenuBlock,
          fields: {
            ...(baseConfig.components as any).MenuBlock?.fields,
            menuId: { type: 'custom' as const, label: 'Menu', render: MenuSelectField },
          },
          render: (props: any) => (
            <MenuBlockEditorPreview
              menuId={props.menuId ?? ''}
              orientation={props.orientation ?? 'horizontal'}
              spacing={props.spacing ?? 'normal'}
              showDropdowns={props.showDropdowns ?? 'hover'}
              showMobileToggle={props.showMobileToggle ?? 'collapse'}
              itemFontSize={props.itemFontSize}
              itemFontWeight={props.itemFontWeight}
              textTransform={props.textTransform}
              itemColor={props.itemColor}
            />
          ),
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
    ...(settingsTab ? [createPanelPlugin({ name: 'settings', label: 'Settings', icon: settingsTabIcon, content: settingsTab })] : []),
    ...(conditionsPanel ? [createPanelPlugin({ name: 'conditions', label: 'Conditions', icon: conditionsTabIcon, content: conditionsPanel })] : []),
    ...(historyTab ? [createPanelPlugin({ name: 'history', label: 'History', icon: historyTabIcon, content: historyTab })] : []),
    createPanelPlugin({ name: 'saved-blocks', label: 'Saved Blocks', icon: savedBlocksTabIcon, content: <SavedBlocksTab /> }),
  ], [settingsTab, conditionsPanel, historyTab])

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Puck
          config={editorConfig as any}
          data={initialData}
          onChange={handleChange}
          overrides={puckOverrides}
          onPublish={() => onPublish(latestDataRef.current)}
          plugins={plugins}
        />
      </div>
    </div>
  )
}
