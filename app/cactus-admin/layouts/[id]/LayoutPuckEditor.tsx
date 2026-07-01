'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import type React from 'react'
import { Puck } from '@puckeditor/core'
import type { Data } from '@puckeditor/core'
import '@puckeditor/core/no-external.css'
import { layoutPuckConfig, headerPuckConfig, footerPuckConfig, fullPagePuckConfig } from '@/lib/puck/config'
import { ImageUrlPickerField } from '@/lib/puck/MediaPickerField'

type Props = {
  initialData: Data
  onChange: (data: Data) => void
  onPublish: (data: Data) => void
  isPublishing: boolean
  layoutType?: string
  conditionsPanel?: React.ReactNode
}

function getConfig(type: string | undefined) {
  switch (type) {
    case 'header': return headerPuckConfig
    case 'footer': return footerPuckConfig
    case 'notFound':
    case 'statusPage': return fullPagePuckConfig
    default: return layoutPuckConfig
  }
}

export default function LayoutPuckEditor({ initialData, onChange, onPublish, isPublishing, layoutType, conditionsPanel }: Props) {
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
    },
  }), [baseConfig])

  const handleChange = useCallback((data: Data) => {
    latestDataRef.current = data
    if (!hasChangedRef.current) { hasChangedRef.current = true; return }
    onChange(data)
  }, [onChange])

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Puck

        config={editorConfig as any}
        data={initialData}
        onChange={handleChange}
        onPublish={() => onPublish(latestDataRef.current)}
        overrides={{
          actionBar: ({ children }) => (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {children}
            </div>
          ),
          fields: ({ children }) => (
            <>
              {children}
              {conditionsPanel}
            </>
          ),
        }}
      />
    </div>
  )
}
