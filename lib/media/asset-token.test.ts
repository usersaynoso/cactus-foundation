import { describe, it, expect, beforeAll } from 'vitest'

// Set before the module under test is imported: the signing key is derived from
// SESSION_SECRET, and getSessionSecret throws without one.
beforeAll(() => {
  process.env.SESSION_SECRET ??= 'test-session-secret-for-asset-token-specs'
  process.env.CLOUDFLARE_WORKER_URL ??= 'https://media.example.com'
})

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

describe('asset read tokens', () => {
  it('accepts a token it just minted', async () => {
    const { signAssetToken, verifyAssetToken } = await import('./asset-token')
    const key = 'media/R2/Shop/Chairs/Ada/3d/abc123-ada.glb'
    expect(verifyAssetToken(key, signAssetToken(key))).toBe(true)
  })

  it('refuses a token minted for a different object', async () => {
    const { signAssetToken, verifyAssetToken } = await import('./asset-token')
    const token = signAssetToken('media/R2/one.glb')
    // The whole point: a token lifted off one model's url is no use against
    // another, so scraping one page does not unlock the catalogue.
    expect(verifyAssetToken('media/R2/two.glb', token)).toBe(false)
  })

  it('refuses a tampered signature and a tampered expiry', async () => {
    const { signAssetToken, verifyAssetToken } = await import('./asset-token')
    const key = 'media/R2/one.glb'
    const token = signAssetToken(key)
    const [exp, sig] = token.split('.') as [string, string]

    expect(verifyAssetToken(key, `${exp}.${sig.slice(0, -1)}x`)).toBe(false)
    // Pushing the expiry out without being able to re-sign it gets nowhere.
    expect(verifyAssetToken(key, `${Number(exp) + DAY}.${sig}`)).toBe(false)
  })

  it('refuses a token that has expired', async () => {
    const { signAssetToken, verifyAssetToken } = await import('./asset-token')
    const key = 'media/R2/one.glb'
    const now = Date.UTC(2026, 6, 19, 12, 0, 0)
    const token = signAssetToken(key, now)

    expect(verifyAssetToken(key, token, now)).toBe(true)
    // A url copied out of view-source stops working of its own accord.
    expect(verifyAssetToken(key, token, now + 3 * DAY)).toBe(false)
  })

  describe('expiry bucketing', () => {
    it('gives every render inside a bucket the identical expiry', async () => {
      const { assetTokenExpiry } = await import('./asset-token')
      const start = Date.UTC(2026, 6, 19, 0, 0, 0)
      // Two renders eleven hours apart must agree, or each visitor gets a unique
      // url, every url is a cache miss, and signing has quietly made the site
      // slower - the one outcome this design exists to avoid.
      expect(assetTokenExpiry(start + HOUR)).toBe(assetTokenExpiry(start + 12 * HOUR))
    })

    it('always leaves at least a day of life on a fresh token', async () => {
      const { assetTokenExpiry } = await import('./asset-token')
      // Sampled across a full bucket, including the boundary, because the failure
      // mode is a token minted moments before a rollover and dead on arrival.
      for (let minutes = 0; minutes <= 24 * 60; minutes += 7) {
        const now = Date.UTC(2026, 6, 19, 0, 0, 0) + minutes * 60 * 1000
        const life = assetTokenExpiry(now) - now
        expect(life).toBeGreaterThanOrEqual(DAY)
        expect(life).toBeLessThanOrEqual(2 * DAY)
      }
    })
  })

  describe('signAssetUrl', () => {
    it('stamps a token on a model url', async () => {
      const { signAssetUrl, verifyAssetToken, ASSET_TOKEN_PARAM } = await import('./asset-token')
      const key = 'media/R2/Shop/Chairs/Ada/3d/abc123-ada.glb'
      const signed = new URL(signAssetUrl(`https://media.example.com/${key}`))

      expect(signed.pathname.slice(1)).toBe(key)
      expect(verifyAssetToken(key, signed.searchParams.get(ASSET_TOKEN_PARAM) ?? '')).toBe(true)
    })

    it('leaves images alone', async () => {
      const { signAssetUrl } = await import('./asset-token')
      // Image urls are written into rich text, stored page props and emails, and
      // are built by the browser for srcsets. Signing one would strand every url
      // the site has already written down, so the Worker never gates them.
      const url = 'https://media.example.com/media/R2/Shop/Chairs/Ada/abc123-ada.jpg'
      expect(signAssetUrl(url)).toBe(url)
    })

    it('leaves a url that is not ours alone', async () => {
      const { signAssetUrl } = await import('./asset-token')
      const url = 'https://cdn.somewhere-else.example/models/thing.glb'
      expect(signAssetUrl(url)).toBe(url)
    })

    it('keeps an existing query string', async () => {
      const { signAssetUrl, ASSET_TOKEN_PARAM } = await import('./asset-token')
      const signed = new URL(signAssetUrl('https://media.example.com/media/R2/a.glb?v=2'))
      expect(signed.searchParams.get('v')).toBe('2')
      expect(signed.searchParams.get(ASSET_TOKEN_PARAM)).toBeTruthy()
    })

    it('signs every format the viewer can load', async () => {
      const { signAssetUrl, ASSET_TOKEN_PARAM } = await import('./asset-token')
      for (const ext of ['glb', 'gltf', 'obj', 'fbx', '3ds']) {
        const signed = new URL(signAssetUrl(`https://media.example.com/media/R2/a.${ext}`))
        expect(signed.searchParams.get(ASSET_TOKEN_PARAM), ext).toBeTruthy()
      }
    })
  })
})
