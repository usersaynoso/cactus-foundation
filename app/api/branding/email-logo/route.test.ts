import { beforeEach, describe, expect, it, vi } from 'vitest'

// "Replace file" keeps a media item's id and swaps its bytes, so an email logo
// address versioned on the id alone went on serving the old logo - immutably, for
// a year. The version has to follow the file as well as the item.

type Logo = { id: string; key: string; url: string; provider: string; mimeType: string; sizeBytes: number }
let logo: Logo

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    siteConfig: { findUnique: async () => ({ logoMediaId: 'm1' }) },
    media: { findUnique: async () => logo },
  },
}))
vi.mock('@/lib/media/upload', () => ({ downloadMedia: vi.fn() }))
vi.mock('@/lib/security/public-origin', () => ({
  publicUrl: (request: Request, target?: string) => new URL(target ?? request.url, request.url),
}))

import { GET } from './route'

const BASE = 'https://example.com/api/branding/email-logo'

async function canonical(v: string | null): Promise<string | null> {
  const res = await GET(new Request(v === null ? BASE : `${BASE}?v=${encodeURIComponent(v)}`))
  if (res.status !== 307) return null
  return new URL(res.headers.get('location') ?? '').searchParams.get('v')
}

beforeEach(() => {
  logo = { id: 'm1', key: 'media/R2/logo.svg', url: 'https://w.example/media/R2/logo.svg', provider: 'R2', mimeType: 'image/svg+xml', sizeBytes: 1200 }
})

describe('email logo address', () => {
  it('sends the bare id an email carries on to a versioned address', async () => {
    const v = await canonical('m1')
    expect(v).toMatch(/^m1\.[0-9a-f]{12}$/)
  })

  it('moves to a new address when the file behind the same item is replaced', async () => {
    const before = await canonical('m1')
    logo = { ...logo, sizeBytes: 2400 }
    const after = await canonical('m1')
    expect(after).not.toBe(before)
    // And the old versioned address no longer counts as current.
    expect(await canonical(before)).toBe(after)
  })
})
