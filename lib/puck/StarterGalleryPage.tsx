import React from 'react'
import { Render } from '@puckeditor/core/rsc'
import {
  headerPuckRscConfig,
  footerPuckRscConfig,
  layoutPuckRscConfig,
  fullPagePuckRscConfig,
} from '@/lib/puck/config'
import type { Data } from '@puckeditor/core'

/* eslint-disable @typescript-eslint/no-explicit-any */

export type StarterLayout = {
  id: string
  name: string
  type: string
  description: string | null
  builderData: unknown
}

const TYPE_ORDER = ['header', 'footer', 'infoPage', 'notFound', 'statusPage'] as const

const TYPE_LABELS: Record<string, string> = {
  header: 'Headers',
  footer: 'Footers',
  infoPage: 'Page Layouts',
  notFound: '404 Pages',
  statusPage: 'Status Pages',
}

// Different scales suit different layout categories.
// Headers and footers are narrow vertically; full-page layouts need more height.
const TYPE_PREVIEW: Record<string, { scale: number; height: string }> = {
  header:     { scale: 0.65, height: '70px' },
  footer:     { scale: 0.55, height: '120px' },
  infoPage:   { scale: 0.28, height: '260px' },
  notFound:   { scale: 0.22, height: '280px' },
  statusPage: { scale: 0.22, height: '280px' },
}

function getConfigForType(type: string) {
  switch (type) {
    case 'header':     return headerPuckRscConfig
    case 'footer':     return footerPuckRscConfig
    case 'infoPage':   return layoutPuckRscConfig
    default:           return fullPagePuckRscConfig
  }
}

interface Props {
  layouts: StarterLayout[]
  draftBanner?: React.ReactNode
}

export function StarterGalleryPage({ layouts, draftBanner }: Props) {
  const grouped: Record<string, StarterLayout[]> = {}
  for (const t of TYPE_ORDER) {
    grouped[t] = layouts.filter((l) => l.type === t)
  }

  return (
    <>
      {draftBanner}
      <div style={{ padding: '2.5rem 2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: '0 0 0.5rem', lineHeight: 1.2 }}>Layouts</h1>
        <p style={{ color: 'var(--color-muted)', fontSize: '0.9375rem', margin: '0 0 3rem', lineHeight: 1.65 }}>
          All starter layout templates as live previews. Edit any in the{' '}
          <a href="layouts" style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 500 }}>
            Layout editor
          </a>{' '}
          and the preview here updates automatically.
        </p>

        {TYPE_ORDER.map((type) => {
          const group = grouped[type] ?? []
          if (!group.length) return null
          const preview = TYPE_PREVIEW[type] ?? { scale: 0.33, height: '260px' }
          return (
            <section key={type} style={{ marginBottom: '4rem' }}>
              <h2 style={{
                fontSize: '1.125rem', fontWeight: 700, margin: '0 0 1.25rem',
                paddingBottom: '0.625rem', borderBottom: '1px solid var(--color-border)',
                color: 'var(--color-fg)',
              }}>
                {TYPE_LABELS[type]}
              </h2>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(460px, 1fr))',
                gap: '1.25rem',
              }}>
                {group.map((layout) => (
                  <div key={layout.id} style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: '0.5rem',
                    overflow: 'hidden',
                    background: 'var(--color-bg)',
                  }}>
                    {/* Card header bar */}
                    <div style={{
                      padding: '0.5rem 0.875rem',
                      borderBottom: '1px solid var(--color-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--color-bg-subtle)',
                      minHeight: '36px',
                    }}>
                      <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--color-fg)' }}>
                        {layout.name}
                      </span>
                      {layout.description && (
                        <span style={{
                          fontSize: '0.75rem',
                          color: 'var(--color-muted)',
                          marginLeft: '0.75rem',
                          flexShrink: 0,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '55%',
                        }}>
                          {layout.description}
                        </span>
                      )}
                    </div>

                    {/* Scaled live preview */}
                    {layout.builderData ? (
                      <div style={{
                        position: 'relative',
                        height: preview.height,
                        overflow: 'hidden',
                        background: 'white',
                      }}>
                        <div style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '1440px',
                          transform: `scale(${preview.scale})`,
                          transformOrigin: 'top left',
                          pointerEvents: 'none',
                        }}>
                          <Render
                            config={getConfigForType(layout.type) as any}
                            data={layout.builderData as Data}
                          />
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        height: preview.height,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--color-muted)',
                        fontSize: '0.875rem',
                      }}>
                        No preview available
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </>
  )
}
