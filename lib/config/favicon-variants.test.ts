import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ICON_PATHS, ICON_VARIANTS, iconLinksFor, pickSlot, variantForRequest, type IconSlot } from './favicon-variants'

const png = { mimeType: 'image/png' }
const webp = { mimeType: 'image/webp' }
const svg = { mimeType: 'image/svg+xml' }

describe('variantForRequest', () => {
  it('takes the path segment the rewrite carries', () => {
    expect(variantForRequest('/api/branding/favicon/icon-16', new URLSearchParams(), ['icon-16']).name).toBe('icon-16')
    expect(variantForRequest('/api/branding/favicon/apple-touch', new URLSearchParams(), ['apple-touch']).name).toBe('apple-touch')
  })

  it('recognises the public address if the route ever sees the pre-rewrite path', () => {
    // The bug this file exists for: every sized PNG answered with the favicon.
    expect(variantForRequest('/favicon-16x16.png', new URLSearchParams(), undefined).name).toBe('icon-16')
    expect(variantForRequest('/web-app-manifest-512x512.png', new URLSearchParams(), undefined).name).toBe('icon-512')
  })

  it('still honours the older query forms', () => {
    expect(variantForRequest('/api/branding/favicon', new URLSearchParams('icon=icon-192'), []).name).toBe('icon-192')
    expect(variantForRequest('/favicon.ico', new URLSearchParams('scheme=dark'), undefined).name).toBe('favicon-dark')
  })

  it('ignores a segment that is not a variant', () => {
    expect(variantForRequest('/api/branding/favicon/nonsense', new URLSearchParams(), ['nonsense']).name).toBe('favicon')
  })
})

describe('ICON_PATHS', () => {
  it('maps every public address to a real variant', () => {
    for (const variant of Object.values(ICON_PATHS)) expect(ICON_VARIANTS[variant]).toBeDefined()
  })

  it('sends no address back to a file that the rewrite would catch', () => {
    for (const v of Object.values(ICON_VARIANTS)) expect(ICON_PATHS[v.fallback]).toBeUndefined()
  })

  it('has a bundled Cactus file behind every fallback', () => {
    for (const v of Object.values(ICON_VARIANTS)) {
      expect(() => readFileSync(join(process.cwd(), 'public', v.fallback))).not.toThrow()
    }
  })

  it('leaves no Cactus file sitting at a public icon address', () => {
    for (const address of Object.keys(ICON_PATHS)) {
      expect(() => readFileSync(join(process.cwd(), 'public', address))).toThrow()
    }
  })
})

describe('pickSlot', () => {
  it('draws every size from a single uploaded image', () => {
    const icons: Partial<Record<IconSlot, { mimeType: string }>> = { appIcon: webp }
    for (const v of Object.values(ICON_VARIANTS)) {
      if (v.format === 'svg') continue
      expect(pickSlot(v, icons)).toBe('appIcon')
    }
  })

  it('prefers a hand-picked rendition for its own size', () => {
    const icons = { favicon: png, icon16: png, appIcon: png }
    expect(pickSlot(ICON_VARIANTS['icon-16'], icons)).toBe('icon16')
    expect(pickSlot(ICON_VARIANTS['icon-32'], icons)).toBe('favicon')
    expect(pickSlot(ICON_VARIANTS['icon-512'], icons)).toBe('appIcon')
  })

  it('uses the dark favicon for the dark sizes', () => {
    const icons = { favicon: png, faviconDark: png, icon16: png }
    expect(pickSlot(ICON_VARIANTS['icon-16-dark'], icons)).toBe('faviconDark')
    expect(pickSlot(ICON_VARIANTS['favicon-dark'], icons)).toBe('faviconDark')
  })

  it('only answers svg with an actual SVG, and a raster favicon outranks an SVG app icon', () => {
    expect(pickSlot(ICON_VARIANTS.svg, { favicon: svg })).toBe('favicon')
    expect(pickSlot(ICON_VARIANTS.svg, { appIcon: svg })).toBe('appIcon')
    expect(pickSlot(ICON_VARIANTS.svg, { favicon: png, appIcon: svg })).toBeNull()
    expect(pickSlot(ICON_VARIANTS.svg, { favicon: png })).toBeNull()
  })
})

describe('iconLinksFor', () => {
  const urls = (set: ReturnType<typeof iconLinksFor>) => [
    ...set.icon.map((l) => l.url),
    set.shortcut,
    set.apple,
    ...set.manifest.map((m) => m.src),
  ]

  it('never links a Cactus file when the branding read failed', () => {
    // The bug: a database blip wrote the Cactus icon into a page the CDN and
    // Next then held on to for hours.
    const set = iconLinksFor({ known: false, icons: {}, version: null })
    for (const url of urls(set)) expect(url).not.toMatch(/cactus/)
    expect(set.icon.some((l) => l.type === 'image/svg+xml')).toBe(false)
  })

  it('never links a Cactus file on a branded site', () => {
    const set = iconLinksFor({ known: true, icons: { favicon: webp, faviconDark: png }, version: 'abc' })
    for (const url of urls(set)) expect(url).not.toMatch(/cactus/)
  })

  it('links Cactus only for a site that genuinely has no icons', () => {
    const set = iconLinksFor({ known: true, icons: {}, version: null })
    for (const url of urls(set)) expect(url).toMatch(/cactus/)
  })

  it('labels each address with the format the route draws, whatever was uploaded', () => {
    const set = iconLinksFor({ known: true, icons: { favicon: webp }, version: 'v1' })
    const ico = set.icon.find((l) => l.url.startsWith('/favicon.ico'))
    expect(ico?.type).toBe('image/x-icon')
    for (const l of set.icon.filter((l) => l.url.includes('.png'))) expect(l.type).toBe('image/png')
  })

  it('versions every branded address except the bare names browsers probe', () => {
    const set = iconLinksFor({ known: true, icons: { favicon: png }, version: 'v1' })
    for (const l of set.icon) expect(l.url).toMatch(/\?v=v1$/)
    expect(set.apple).toBe('/apple-touch-icon.png?v=v1')
    expect(set.shortcut).toBe('/favicon.ico')
  })

  it('offers an SVG only when there is one, and scopes the pair by colour scheme when dark exists', () => {
    expect(iconLinksFor({ known: true, icons: { favicon: png }, version: null }).icon.some((l) => l.type === 'image/svg+xml')).toBe(false)
    const both = iconLinksFor({ known: true, icons: { favicon: svg, faviconDark: svg }, version: null })
    expect(both.icon.find((l) => l.url === '/favicon.svg')?.media).toBe('(prefers-color-scheme: light)')
    expect(both.icon.find((l) => l.url === '/favicon-dark.svg')?.media).toBe('(prefers-color-scheme: dark)')
  })
})
