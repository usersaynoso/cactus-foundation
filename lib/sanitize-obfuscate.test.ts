import { describe, it, expect } from 'vitest'
import { sanitizeAndObfuscateRichText, sanitizeRichText } from './sanitize'
import { obfuscateEmailsInHtml } from './email-obfuscate'

// Guards the ORDER of the published RichText pipeline: sanitise first, then
// obfuscate. DOMPurify parses and re-serialises its input, which decodes the
// numeric entities the obfuscator emits - so running the sanitiser after the
// obfuscator quietly puts the plain address back into the served HTML. That
// exact regression shipped once (found live: the visible address on a contact
// page was greppable in view-source) and nothing else in the toolchain can
// catch it: it type-checks, lints and renders identically.

const ADDR = 'hi@dwoffice.furniture'

function decode(enc: string): string {
  return atob(enc).split('').reverse().join('')
}

describe('sanitizeAndObfuscateRichText', () => {
  it('serves no plain address and no mailto: for an address typed into copy', () => {
    const out = sanitizeAndObfuscateRichText(`<p>Write to ${ADDR} today</p>`)
    expect(out).not.toContain('@')
    expect(out).not.toContain(ADDR)
    expect(out).not.toContain('mailto')
    expect(out).toContain('data-eml')
  })

  it('protects a hand-written mailto link (TipTap link markup)', () => {
    const out = sanitizeAndObfuscateRichText(
      `<p><a target="_blank" rel="noopener noreferrer nofollow" href="mailto:${ADDR}">${ADDR}</a></p>`,
    )
    expect(out).not.toContain('@')
    expect(out).not.toContain('mailto')
    const enc = /data-eml="([^"]+)"/.exec(out)
    expect(enc).not.toBeNull()
    expect(decode(enc![1]!)).toBe(ADDR)
  })

  it('still strips script and javascript: hrefs (sanitising is not skipped)', () => {
    const out = sanitizeAndObfuscateRichText(
      `<p><script>alert(1)</script><a href="javascript:alert(1)">x</a> ${ADDR}</p>`,
    )
    expect(out).not.toContain('script')
    expect(out).not.toContain('@')
  })

  it('documents the regression: sanitising AFTER obfuscating leaks the address', () => {
    // Not the pipeline - the proof of why the order matters. DOMPurify decodes
    // the obfuscator's entity-encoded text back to a plain address.
    const wrongOrder = sanitizeRichText(obfuscateEmailsInHtml(`<p>Write to ${ADDR}</p>`))
    expect(wrongOrder).toContain(ADDR)
  })
})
