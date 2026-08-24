import { describe, expect, it } from 'vitest'
import { emailLogoUrl } from '@/lib/email/logo'

const SITE = 'https://example.com'

describe('emailLogoUrl', () => {
  it('sends an SVG logo through the renderer, stamped with its media id', () => {
    const url = emailLogoUrl({ id: 'med_1', url: 'https://cdn.example.com/logo.svg', mimeType: 'image/svg+xml' }, SITE)
    expect(url).toBe('https://example.com/api/branding/email-logo?v=med_1')
  })

  it('sends a WebP logo there too - Outlook has never rendered one', () => {
    const url = emailLogoUrl({ id: 'med_2', url: 'https://cdn.example.com/logo.webp', mimeType: 'image/webp' }, SITE)
    expect(url).toBe('https://example.com/api/branding/email-logo?v=med_2')
  })

  it('leaves a PNG logo on its own CDN address', () => {
    const url = emailLogoUrl({ id: 'med_3', url: 'https://cdn.example.com/logo.png', mimeType: 'image/png' }, SITE)
    expect(url).toBe('https://cdn.example.com/logo.png')
  })

  it('absolutises a site-relative PNG, since an email is read elsewhere', () => {
    const url = emailLogoUrl({ id: 'med_4', url: '/media/logo.png', mimeType: 'image/png' }, SITE)
    expect(url).toBe('https://example.com/media/logo.png')
  })

  it('falls back to the media URL when the site has no address to build on', () => {
    const url = emailLogoUrl({ id: 'med_5', url: 'https://cdn.example.com/logo.svg', mimeType: 'image/svg+xml' }, '')
    expect(url).toBe('https://cdn.example.com/logo.svg')
  })

  it('has nothing to say when no logo is set', () => {
    expect(emailLogoUrl(null, SITE)).toBe('')
  })
})
