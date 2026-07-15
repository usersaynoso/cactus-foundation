import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import {
  encodeEmail,
  emailSafeHref,
  sanitizeHref,
  maskEmailText,
  linkifyEmails,
  obfuscateEmailsInHtml,
} from './email-obfuscate'

// The whole point of this module is that a bulk harvester scanning the served
// HTML finds nothing to match. Nothing else in the toolchain can tell us it
// still holds: a regression here type-checks, lints and renders perfectly, and
// the only symptom is a quiet rise in the site owner's spam. So the load-bearing
// assertion in most of these is simply "no '@' and no 'mailto:' in the markup".

const ADDR = 'hi@dwoffice.furniture'

// What the client deobfuscator does, mirrored: atob, then reverse.
function decode(enc: string): string {
  return atob(enc).split('').reverse().join('')
}

function markup(node: React.ReactNode): string {
  return renderToStaticMarkup(node as React.ReactElement)
}

describe('encodeEmail', () => {
  it('round-trips through the client-side decode', () => {
    expect(decode(encodeEmail(ADDR))).toBe(ADDR)
  })

  it('leaves no literal address or "@" in the encoded form', () => {
    const enc = encodeEmail(ADDR)
    expect(enc).not.toContain('@')
    expect(enc).not.toContain(ADDR)
  })
})

describe('emailSafeHref', () => {
  it('strips a mailto: href and carries the address in data-eml instead', () => {
    const props = emailSafeHref(`mailto:${ADDR}`)
    expect(props.href).toBeUndefined()
    expect(decode(props['data-eml']!)).toBe(ADDR)
  })

  it('keeps any query the owner appended to the mailto:', () => {
    const props = emailSafeHref(`mailto:${ADDR}?subject=Hello%20there`)
    expect(props.href).toBeUndefined()
    expect(decode(props['data-eml']!)).toBe(`${ADDR}?subject=Hello%20there`)
  })

  it('matches mailto: whatever the case, and through leading space', () => {
    expect(emailSafeHref(`  MailTo:${ADDR}`).href).toBeUndefined()
    expect(emailSafeHref(`  MailTo:${ADDR}`)['data-eml']).toBeTruthy()
  })

  it('passes ordinary links straight through', () => {
    expect(emailSafeHref('/contact')).toEqual({ href: '/contact' })
    expect(emailSafeHref('https://example.com')).toEqual({ href: 'https://example.com' })
    expect(emailSafeHref('tel:+441234567890')).toEqual({ href: 'tel:+441234567890' })
  })

  it('leaves the address alone in the editor', () => {
    expect(emailSafeHref(`mailto:${ADDR}`, false)).toEqual({ href: `mailto:${ADDR}` })
  })

  it('yields no href at all for a missing link', () => {
    expect(emailSafeHref(undefined)).toEqual({})
    expect(emailSafeHref(null)).toEqual({})
  })

  it('drops the href for a script-bearing scheme (stored XSS guard)', () => {
    // A content editor with only pages/appearance rights could otherwise plant
    // a javascript: URL that runs in the site origin for every visitor.
    expect(emailSafeHref('javascript:alert(1)')).toEqual({})
    expect(emailSafeHref('JavaScript:alert(1)')).toEqual({})
    expect(emailSafeHref('  javascript:alert(1)')).toEqual({})
    // Browsers ignore control chars/whitespace inside the scheme, so we must too.
    expect(emailSafeHref('java\tscript:alert(1)')).toEqual({})
    expect(emailSafeHref('java\nscript:alert(1)')).toEqual({})
    expect(emailSafeHref('data:text/html,<script>alert(1)</script>')).toEqual({})
    expect(emailSafeHref('vbscript:msgbox(1)')).toEqual({})
  })
})

describe('sanitizeHref', () => {
  it('passes safe schemes and scheme-less URLs through unchanged', () => {
    expect(sanitizeHref('https://example.com')).toBe('https://example.com')
    expect(sanitizeHref('http://example.com')).toBe('http://example.com')
    expect(sanitizeHref('mailto:hi@example.com')).toBe('mailto:hi@example.com')
    expect(sanitizeHref('tel:+441234567890')).toBe('tel:+441234567890')
    expect(sanitizeHref('/contact')).toBe('/contact')
    expect(sanitizeHref('#section')).toBe('#section')
    expect(sanitizeHref('?q=1')).toBe('?q=1')
    expect(sanitizeHref('//cdn.example.com/x')).toBe('//cdn.example.com/x')
  })

  it('returns undefined for dangerous schemes, however disguised', () => {
    expect(sanitizeHref('javascript:alert(1)')).toBeUndefined()
    expect(sanitizeHref('  JAVASCRIPT:alert(1)')).toBeUndefined()
    expect(sanitizeHref('java\tscript:alert(1)')).toBeUndefined()
    expect(sanitizeHref('data:text/html;base64,PHNjcmlwdD4=')).toBeUndefined()
    expect(sanitizeHref('vbscript:x')).toBeUndefined()
    expect(sanitizeHref(undefined)).toBeUndefined()
    expect(sanitizeHref(null)).toBeUndefined()
  })
})

describe('maskEmailText', () => {
  it('hides the address in a button label without nesting an anchor', () => {
    const html = markup(maskEmailText(`Email ${ADDR}`))
    expect(html).not.toContain('@')
    expect(html).not.toContain(ADDR)
    expect(html).not.toContain('<a')
    // Still reads as the real label once the browser decodes the entities.
    expect(html).toContain('&#69;&#109;&#97;&#105;&#108;') // "Email"
  })

  it('leaves a label with no address untouched', () => {
    expect(maskEmailText('Get in touch')).toBe('Get in touch')
    expect(maskEmailText('50% off @ checkout')).toBe('50% off @ checkout') // "@" but no address
  })

  it('leaves the label alone in the editor', () => {
    expect(maskEmailText(`Email ${ADDR}`, false)).toBe(`Email ${ADDR}`)
  })
})

describe('a protected button', () => {
  it('serves no address, no "@" and no mailto: anywhere in its markup', () => {
    const label = `Email ${ADDR}`
    const html = markup(
      React.createElement('a', { ...emailSafeHref(`mailto:${ADDR}`), className: 'cactus-btn' }, maskEmailText(label)),
    )
    expect(html).not.toContain('@')
    expect(html).not.toContain('mailto')
    expect(html).not.toContain(ADDR)
    expect(html).toContain('data-eml=')
  })
})

describe('linkifyEmails', () => {
  it('keeps the address out of the markup of a plain text block', () => {
    const html = markup(React.createElement('p', null, linkifyEmails(`Write to ${ADDR} today`)))
    expect(html).not.toContain('@')
    expect(html).not.toContain(ADDR)
    expect(html).toContain('data-eml=')
    expect(html).toContain('Write to ')
  })

  it('returns text with no address verbatim', () => {
    expect(linkifyEmails('No address here')).toBe('No address here')
  })

  // The free-text props on non-text blocks (a Card's body, a CTA's subtext) all
  // funnel through linkifyEmails via config.tsx's protectText gate. This is what
  // that produces: a real address in the copy comes out protected, and it stays
  // a clickable mailto: (unlike a button label, which is masked because it sits
  // inside an anchor already).
  it('turns an address in body copy into a protected clickable link', () => {
    const html = markup(React.createElement('p', null, linkifyEmails(`Reach us at ${ADDR} anytime`)))
    expect(html).not.toContain('@')
    expect(html).not.toContain(ADDR)
    expect(html).not.toContain('mailto') // href arrives client-side, from data-eml
    expect(html).toContain('data-eml=')
    expect(html).toContain('class="cactus-eml"')
  })
})

describe('obfuscateEmailsInHtml', () => {
  it('protects an address sitting in rich text', () => {
    const out = obfuscateEmailsInHtml(`<p>Write to ${ADDR}</p>`)
    expect(out).not.toContain('@')
    expect(out).not.toContain(ADDR)
    expect(out).toContain('data-eml=')
  })

  it('protects an anchor the author hand-wrote, href and link text alike', () => {
    const out = obfuscateEmailsInHtml(`<p><a href="mailto:${ADDR}">Email ${ADDR}</a></p>`)
    expect(out).not.toContain('@')
    expect(out).not.toContain('mailto')
    expect(out).not.toContain(ADDR)
    expect(out).toContain('data-eml=')
    // Masked, not wrapped: an <a> inside an <a> would be invalid HTML.
    expect(out.match(/<a\b/g)).toHaveLength(1)
  })

  it('protects an address in the text of an ordinary (non-mailto) link', () => {
    const out = obfuscateEmailsInHtml(`<p><a href="/contact">Write to ${ADDR}</a></p>`)
    expect(out).not.toContain('@')
    expect(out).not.toContain(ADDR)
    expect(out).toContain('href="/contact"')
    expect(out.match(/<a\b/g)).toHaveLength(1)
  })

  it('leaves an address in a code sample exactly as the author typed it', () => {
    const code = `<pre><code>${ADDR}</code></pre>`
    expect(obfuscateEmailsInHtml(code)).toBe(code)
  })
})
