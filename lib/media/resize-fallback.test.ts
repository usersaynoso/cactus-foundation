// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest'
import { resizeFallbackScript } from './resize-fallback'

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

  it('rescues an image once only, so a dead original cannot loop', () => {
    document.body.innerHTML = ''
    const img = document.createElement('img')
    img.setAttribute('src', wrapped(48))
    document.body.appendChild(img)
    fail(img)
    img.setAttribute('src', wrapped(48))
    fail(img)
    expect(img.getAttribute('src')).toBe(wrapped(48))
  })
})
