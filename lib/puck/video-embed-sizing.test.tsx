import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { puckConfig } from '@/lib/puck/config.core'

// The Video block takes portrait (9:16) videos, plus a max width and alignment
// per device - a portrait video at full column width is taller than the screen.
type BlockDef = {
  fields: Record<string, { options?: { value: string }[] } | undefined>
  render: (props: Record<string, unknown>) => React.ReactElement
  resolveFields: (data: { props: Record<string, unknown> }, ctx: { fields: Record<string, unknown> }) => Record<string, unknown>
}
const video = (puckConfig.components as unknown as Record<string, BlockDef>).VideoEmbed!
const base = { id: 'v1', source: 'library', videoFile: '/media/clip.mp4', padding: 'default' }
const html = (props: Record<string, unknown>) => renderToStaticMarkup(video.render({ ...base, ...props }))

describe('Video block sizing', () => {
  it('offers a 9:16 aspect ratio that renders a portrait box', () => {
    expect(video.fields.aspectRatio?.options?.map((o) => o.value)).toContain('9:16')
    expect(html({ aspectRatio: '9:16' })).toContain('padding-bottom:177.78%')
  })

  it('caps the width per device and centres by default', () => {
    const out = html({ aspectRatio: '9:16', maxWidth: { desktop: '400px', tablet: '360px', mobile: '80%' } })
    expect(out).toContain('max-width:400px')
    expect(out).toContain('margin:0 auto 1.5rem auto')
    expect(out).toMatch(/\[data-video-wrap-id="v1"\]\{max-width:360px[^}]*margin-left:auto/)
    expect(out).toMatch(/\[data-video-wrap-id="v1"\]\{max-width:80%[^}]*margin-left:auto/)
  })

  it('leaves existing videos full width', () => {
    const out = html({ aspectRatio: '16:9' })
    expect(out).not.toContain('max-width')
    expect(out).toContain('margin:0 0 1.5rem 0')
  })

  it('hides alignment until a max width is set', () => {
    const fields = Object.fromEntries(Object.keys(video.fields).map((k) => [k, video.fields[k]]))
    expect(video.resolveFields({ props: base }, { fields })).not.toHaveProperty('align')
    expect(video.resolveFields({ props: { ...base, maxWidth: { mobile: '300px' } } }, { fields })).toHaveProperty('align')
  })
})
