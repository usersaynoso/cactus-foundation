import { describe, it, expect } from 'vitest'
import { resizedImageSrc, resizedSrcSet } from './resize-url'

// The failure this guards against is not subtle in effect but is completely silent
// in review: rewrite a url that Cloudflare cannot transform and every picture on the
// page 404s. `tsc` and eslint are perfectly happy either way, and the only place it
// shows up is a visitor's screen.

const ORIGIN = 'https://media.example.com'
const ON = { origin: ORIGIN }
const OFF = { origin: null }
const SRC = `${ORIGIN}/media/shop/chair.webp`

describe('resizedImageSrc', () => {
  it('asks for the width, and lets Cloudflare pick the format', () => {
    const out = resizedImageSrc(SRC, 460, ON)
    expect(out).toContain('/cdn-cgi/image/')
    expect(out).toContain('width=460')
    // The re-encode is usually the bigger saving of the two - AVIF where the
    // browser takes it - so it must not be dropped as "just the resize".
    expect(out).toContain('format=auto')
    // Never enlarge: asking for more than the source has should cost nothing.
    expect(out).toContain('fit=scale-down')
    expect(out.endsWith(SRC)).toBe(true)
  })

  it('hands back the original when the owner has not switched resizing on', () => {
    expect(resizedImageSrc(SRC, 460, OFF)).toBe(SRC)
    expect(resizedImageSrc(SRC, 460)).toBe(SRC)
  })

  it('leaves pictures on any other host completely alone', () => {
    // A direct Cloudinary or ImageKit url does its own resizing, and an external
    // hotlink is not ours to transform. Sending either through our own
    // /cdn-cgi/image/ would be a 404 at best.
    for (const other of [
      'https://res.cloudinary.com/demo/image/upload/a.jpg',
      'https://ik.imagekit.io/demo/a.jpg',
      'https://someone-else.example/a.jpg',
    ]) {
      expect(resizedImageSrc(other, 460, ON)).toBe(other)
    }
  })

  it('leaves anything that is not an absolute http url alone', () => {
    for (const odd of ['/local/a.webp', 'data:image/png;base64,AAA', '', 'not a url']) {
      expect(resizedImageSrc(odd, 460, ON)).toBe(odd)
    }
  })

  it('will not touch a vector or an animation', () => {
    // Rasterising an SVG is a downgrade; format=auto on a GIF hands back one frame.
    expect(resizedImageSrc(`${ORIGIN}/media/logo.svg`, 460, ON)).toBe(`${ORIGIN}/media/logo.svg`)
    expect(resizedImageSrc(`${ORIGIN}/media/spin.gif`, 460, ON)).toBe(`${ORIGIN}/media/spin.gif`)
  })

  it('refuses to wrap a url it has already transformed', () => {
    const once = resizedImageSrc(SRC, 460, ON)
    expect(resizedImageSrc(once, 900, ON)).toBe(once)
  })

  it('ignores a nonsense width rather than asking for one', () => {
    for (const w of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resizedImageSrc(SRC, w, ON)).toBe(SRC)
    }
  })
})

describe('resizedSrcSet', () => {
  it('offers each width with its descriptor', () => {
    const set = resizedSrcSet(SRC, [400, 800], ON)
    expect(set).toContain('width=400')
    expect(set).toContain(' 400w')
    expect(set).toContain('width=800')
    expect(set).toContain(' 800w')
    expect(set?.split(', ')).toHaveLength(2)
  })

  it('is null when nothing can be transformed, so no srcset is emitted at all', () => {
    // An empty or single-entry srcset of the original is worse than none: it says
    // nothing and costs bytes in the markup.
    expect(resizedSrcSet(SRC, [400], OFF)).toBeNull()
    expect(resizedSrcSet(`${ORIGIN}/media/logo.svg`, [400], ON)).toBeNull()
    expect(resizedSrcSet('https://elsewhere.example/a.jpg', [400], ON)).toBeNull()
    expect(resizedSrcSet(SRC, [], ON)).toBeNull()
  })
})
