// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { resizeFallbackScript, RESCUE_ATTR, RESCUE_TIMEOUT_MS } from './resize-fallback'

const ORIGINAL = 'https://media.example.com/media/shop/a/itl0820_1.webp'
const wrapped = (w: number) =>
  `https://media.example.com/cdn-cgi/image/width=${w},quality=80,format=auto,fit=scale-down/${ORIGINAL}`

// jsdom does not load images, so currentSrc is empty; the script falls back to src.
// To exercise the srcset path the test sets currentSrc by hand.
function fail(img: HTMLImageElement, currentSrc?: string) {
  if (currentSrc) Object.defineProperty(img, 'currentSrc', { value: currentSrc, configurable: true })
  img.dispatchEvent(new Event('error'))
}

describe('resizeFallbackScript', () => {
  beforeAll(() => {
    new Function(resizeFallbackScript)()
  })

  it('drops srcset and sizes so the browser loads the original src', () => {
    document.body.innerHTML = ''
    const img = document.createElement('img')
    img.setAttribute('src', ORIGINAL)
    img.setAttribute('srcset', `${wrapped(360)} 360w, ${wrapped(560)} 560w`)
    img.setAttribute('sizes', '100vw')
    document.body.appendChild(img)
    fail(img, wrapped(560))
    expect(img.hasAttribute('srcset')).toBe(false)
    expect(img.hasAttribute('sizes')).toBe(false)
    expect(img.getAttribute('src')).toBe(ORIGINAL)
  })

  it('swaps a transformed src for the original url', () => {
    document.body.innerHTML = ''
    const img = document.createElement('img')
    img.setAttribute('src', wrapped(48))
    document.body.appendChild(img)
    fail(img)
    expect(img.getAttribute('src')).toBe(ORIGINAL)
  })

  it('leaves an image that was never transformed alone', () => {
    document.body.innerHTML = ''
    const img = document.createElement('img')
    img.setAttribute('src', ORIGINAL)
    img.setAttribute('srcset', `${ORIGINAL} 1x`)
    document.body.appendChild(img)
    fail(img, ORIGINAL)
    expect(img.getAttribute('srcset')).toBe(`${ORIGINAL} 1x`)
  })

  it('rescues the same <img> again when a gallery hands it the next photo', () => {
    // A product gallery reuses one <img> for every variation: React swaps srcset
    // on the existing element. The first version rescued an element once and left
    // every later variation broken.
    document.body.innerHTML = ''
    const img = document.createElement('img')
    img.setAttribute('src', ORIGINAL)
    img.setAttribute('srcset', `${wrapped(560)} 560w`)
    document.body.appendChild(img)
    fail(img, wrapped(560))
    expect(img.hasAttribute('srcset')).toBe(false)

    const NEXT = 'https://media.example.com/media/shop/a/itl0820_2.webp'
    const next = `https://media.example.com/cdn-cgi/image/width=560,quality=80,format=auto,fit=scale-down/${NEXT}`
    img.setAttribute('src', NEXT)
    img.setAttribute('srcset', `${next} 560w`)
    fail(img, next)
    expect(img.hasAttribute('srcset')).toBe(false)
    expect(img.getAttribute('src')).toBe(NEXT)
  })

  it('leaves a rescued image alone when the original fails too, so it cannot loop', () => {
    document.body.innerHTML = ''
    const img = document.createElement('img')
    img.setAttribute('src', ORIGINAL)
    img.setAttribute('srcset', `${wrapped(560)} 560w`)
    document.body.appendChild(img)
    fail(img, wrapped(560))
    let writes = 0
    new MutationObserver((m) => { writes += m.length }).observe(img, { attributes: true, attributeFilter: ['src', 'srcset', 'sizes'] })
    fail(img, ORIGINAL)
    return Promise.resolve().then(() => {
      expect(writes).toBe(0)
      expect(img.getAttribute('src')).toBe(ORIGINAL)
    })
  })

  it('hides a rescued image until the original has loaded', () => {
    document.body.innerHTML = ''
    const img = document.createElement('img')
    img.setAttribute('src', ORIGINAL)
    img.setAttribute('srcset', `${wrapped(560)} 560w`)
    document.body.appendChild(img)
    fail(img, wrapped(560))
    expect(img.hasAttribute(RESCUE_ATTR)).toBe(true)
    img.dispatchEvent(new Event('load'))
    expect(img.hasAttribute(RESCUE_ATTR)).toBe(false)
  })

  it('shows the honest broken state when the original fails too', () => {
    document.body.innerHTML = ''
    const img = document.createElement('img')
    img.setAttribute('src', wrapped(48))
    document.body.appendChild(img)
    fail(img)
    expect(img.hasAttribute(RESCUE_ATTR)).toBe(true)
    fail(img, ORIGINAL)
    expect(img.hasAttribute(RESCUE_ATTR)).toBe(false)
  })

  it('never hides an image that was not transformed', () => {
    document.body.innerHTML = ''
    const img = document.createElement('img')
    img.setAttribute('src', ORIGINAL)
    document.body.appendChild(img)
    fail(img, ORIGINAL)
    expect(img.hasAttribute(RESCUE_ATTR)).toBe(false)
  })

  it('takes the mark off after the timeout even if no load event comes', () => {
    vi.useFakeTimers()
    try {
      document.body.innerHTML = ''
      const img = document.createElement('img')
      img.setAttribute('src', wrapped(48))
      document.body.appendChild(img)
      fail(img)
      expect(img.hasAttribute(RESCUE_ATTR)).toBe(true)
      vi.advanceTimersByTime(RESCUE_TIMEOUT_MS)
      expect(img.hasAttribute(RESCUE_ATTR)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
