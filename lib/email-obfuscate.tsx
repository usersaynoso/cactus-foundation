import React from 'react'

// Email spam-protection helpers.
//
// Site owners put email addresses in two places, and both are protected from
// harvesters on the published site automatically - the editor sees the plain
// address, visitors don't:
//
//   - typed into ordinary copy (Heading, Text, Rich text, Quote, Caption)
//   - as the link on something they made clickable (a Button, a CTA, a Card, a
//     menu item, a footer link, a linked heading) - which is worse, because a
//     "mailto:" in an href is the easiest thing on the page for a harvester to
//     grep for, easier than the address itself. See emailSafeHref below.
//
// Two techniques are combined, deliberately:
//   1. HTML character encoding - the *visible* address is emitted as numeric
//      HTML entities (&#115;&#97;...), so a bulk harvester scanning raw HTML for
//      an "@" finds nothing to match. Humans (and no-JS visitors) still read the
//      real address, because the browser decodes the entities on render.
//   2. JavaScript reassembly - the clickable mailto: link is never in the served
//      HTML at all. The address is carried in a data attribute, base64 of the
//      reversed string (no literal "@", no "mailto:"), and the client
//      deobfuscator (components/EmailDeobfuscator, mounted once in the public
//      layout) decodes it and wires up the href after load.
//
// A determined scraper that runs JavaScript can still decode a data attribute -
// that is true of every obfuscation scheme and is an accepted trade-off. The
// target here is the bulk regex harvester, which this defeats cleanly.

// Conservative email matcher. Case-insensitive, global (callers reset lastIndex).
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

// Encode an address for the data attribute: reverse then base64. Emails are
// ASCII, so btoa (a global in both the browser and the Node/RSC runtime) is
// safe. The client mirror is atob(enc).split('').reverse().join('').
export function encodeEmail(addr: string): string {
  return btoa(addr.split('').reverse().join(''))
}

// Every character as a decimal HTML entity - keeps the literal address (and its
// "@") out of the served markup while still rendering as real text.
function entityEncode(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) out += `&#${s.charCodeAt(i)};`
  return out
}

// Shared attributes so the React path and the HTML-string path produce identical
// markup, and a single client deobfuscator hydrates both.
const EML_CLASS = 'cactus-eml'

// A single protected address as a React node (used inside plain-text blocks).
// Renders an inert anchor - the client deobfuscator adds the mailto href.
export function ObfuscatedEmail({ enc, display }: { enc: string; display: string }): React.ReactElement {
  return (
    <a className={EML_CLASS} data-eml={enc} rel="nofollow">
      <span dangerouslySetInnerHTML={{ __html: entityEncode(display) }} />
    </a>
  )
}

// Replace every email address in a plain string with an ObfuscatedEmail node,
// leaving the surrounding text untouched. Returns the input verbatim when there
// is nothing to do, so the common no-email path allocates nothing extra.
export function linkifyEmails(text: unknown): React.ReactNode {
  if (typeof text !== 'string' || text.indexOf('@') === -1) return text as React.ReactNode
  EMAIL_RE.lastIndex = 0
  const out: React.ReactNode[] = []
  let last = 0
  let i = 0
  let m: RegExpExecArray | null
  while ((m = EMAIL_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(<ObfuscatedEmail key={`eml-${i++}`} enc={encodeEmail(m[0])} display={m[0]} />)
    last = m.index + m[0].length
  }
  if (i === 0) return text
  if (last < text.length) out.push(text.slice(last))
  return out
}

// The HTML-string equivalent, for the Rich text block (which renders via
// dangerouslySetInnerHTML). Tokenising on tags keeps this a string operation (no
// DOM parse on the server) while still respecting element boundaries. Three
// contexts, because what an address needs depends on where it is sitting:
//
//   - ordinary text: wrapped in a protected anchor, as everywhere else.
//   - inside an <a>: the address is entity-encoded but NOT wrapped - an <a>
//     inside an <a> is invalid HTML and browsers unnest it. If the link itself
//     is a mailto:, the opening tag has already had its href swapped for
//     data-eml (see below), so it stays clickable.
//   - inside <code>/<pre>: left exactly as typed. An address in a code sample is
//     a code sample, not a contact detail, and mangling it would be a bug.
export function obfuscateEmailsInHtml(html: unknown): string {
  if (typeof html !== 'string' || html.indexOf('@') === -1) return typeof html === 'string' ? html : ''
  // Split into tag / text tokens, keeping the tags.
  const tokens = html.split(/(<[^>]+>)/)
  const context: Array<'mask' | 'verbatim'> = []
  for (let t = 0; t < tokens.length; t++) {
    const tok = tokens[t]
    if (!tok) continue
    if (tok.startsWith('<')) {
      const tag = /^<\s*(\/?)\s*(a|code|pre)\b/i.exec(tok)
      if (!tag) continue
      const closing = tag[1] === '/'
      const selfClosing = /\/\s*>$/.test(tok)
      if (closing) context.pop()
      else if (!selfClosing) {
        const isAnchor = tag[2]!.toLowerCase() === 'a'
        if (isAnchor) tokens[t] = protectMailtoAttr(tok)
        context.push(isAnchor ? 'mask' : 'verbatim')
      }
      continue
    }
    const ctx = context[context.length - 1]
    if (ctx === 'verbatim' || tok.indexOf('@') === -1) continue
    EMAIL_RE.lastIndex = 0
    tokens[t] = ctx === 'mask'
      ? tok.replace(EMAIL_RE, (addr) => entityEncode(addr))
      : tok.replace(EMAIL_RE, (addr) => buildEmailAnchorHtml(addr))
  }
  return tokens.join('')
}

// Hand-written <a href="mailto:…"> in a Rich text block was the last way to get
// a literal mailto: back into the served HTML - the one block where the owner
// writes their own markup. Same treatment as the Button block: the href goes,
// the address rides in data-eml. Requiring whitespace before "href" keeps this
// off attributes that merely end in it (data-href and friends).
const HREF_MAILTO_ATTR = /\shref\s*=\s*(?:"\s*mailto:([^"]*)"|'\s*mailto:([^']*)'|mailto:([^\s>]+))/i

function protectMailtoAttr(openingTag: string): string {
  const m = HREF_MAILTO_ATTR.exec(openingTag)
  if (!m) return openingTag
  const tail = m[1] ?? m[2] ?? m[3] ?? ''
  return openingTag.replace(HREF_MAILTO_ATTR, ` data-eml="${encodeEmail(tail)}"`)
}

// The string form of ObfuscatedEmail - identical class/attrs so the same
// deobfuscator handles it.
function buildEmailAnchorHtml(addr: string): string {
  return `<a class="${EML_CLASS}" data-eml="${encodeEmail(addr)}" rel="nofollow"><span>${entityEncode(addr)}</span></a>`
}

// ---------------------------------------------------------------------------
// Owner-typed links (Button, CTA banner, Hero, Card, footer links, menu items,
// linked headings, social links)
// ---------------------------------------------------------------------------
//
// Encoding the address inside a text block achieves nothing if the owner then
// drops a Button next to it whose href is "mailto:hi@example.com" - a literal
// mailto: is the easiest thing on the page for a harvester to grep for, easier
// than the address itself. So a "type your own link" block gets the same
// treatment: on the published site the mailto never reaches the served HTML at
// all. Everything after "mailto:" (the address, plus any ?subject=/?body= the
// owner appended) rides in the same data-eml attribute, and the same client
// deobfuscator wires up the real href after load. Links that aren't mailto:
// pass straight through untouched, as does the editor.

const MAILTO_RE = /^\s*mailto:/i

// Owner-typed "Link URL" fields are plain text: a content editor with only
// pages/appearance rights types whatever they like, and it lands in an href on
// the published site. A "javascript:" (or "data:"/"vbscript:") URL there runs
// in the site origin for every visitor who clicks it - stored XSS. The Rich
// text block is already protected (TipTap protocol lock + DOMPurify); these
// plain fields were not. Everything routes through sanitizeHref before an href
// is emitted.
//
// Only ever-safe schemes are allowed through. A URL with no scheme (relative
// path, "#fragment", "?query", protocol-relative "//host") has no protocol to
// abuse and passes untouched. Anything with a disallowed scheme has its href
// dropped entirely, so there is nothing to click.
const SAFE_SCHEME_RE = /^(?:https?|mailto|tel):/i
const HAS_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i

// Returns the href when safe to render, or undefined when it carries a
// disallowed (script-bearing) scheme. Control characters and whitespace are
// stripped before the scheme is read, because browsers ignore them inside a
// scheme - "java\tscript:" and " javascript:" both still execute.
export function sanitizeHref(href: unknown): string | undefined {
  if (typeof href !== 'string') return undefined
  const probe = href.replace(/[\u0000-\u0020]+/g, '').toLowerCase()
  if (!HAS_SCHEME_RE.test(probe)) return href // relative / fragment / query / protocol-relative
  return SAFE_SCHEME_RE.test(probe) ? href : undefined
}

// Spread onto the <a> in place of href={…}. Returns no href at all for a
// protected address, so there is nothing in the markup to harvest and nothing
// for a no-JS visitor to click (they still read the label, same as the text
// blocks). Non-string or unsafe-scheme hrefs give {} - React omitted an
// undefined href anyway.
export function emailSafeHref(href: unknown, obfuscate = true): { href?: string; 'data-eml'?: string } {
  if (typeof href !== 'string') return {}
  if (obfuscate && MAILTO_RE.test(href)) {
    return { 'data-eml': encodeEmail(href.replace(MAILTO_RE, '')) }
  }
  const safe = sanitizeHref(href)
  return safe === undefined ? {} : { href: safe }
}

// For label text that sits INSIDE an anchor ("Email hi@example.com" on the
// button itself). It can't go through linkifyEmails: that builds an <a>, and an
// <a> inside an <a> is invalid HTML that browsers silently unnest. Entity
// encoding is enough here - the label reads identically, but there is no
// literal "@" left in the markup for a regex to find, and the anchor wrapped
// around it is already carrying the clickable address in data-eml.
export function maskEmailText(text: unknown, obfuscate = true, key?: React.Key): React.ReactNode {
  if (!obfuscate || typeof text !== 'string' || text.indexOf('@') === -1) return text as React.ReactNode
  EMAIL_RE.lastIndex = 0
  if (!EMAIL_RE.test(text)) return text
  return <span key={key} dangerouslySetInnerHTML={{ __html: entityEncode(text) }} />
}
