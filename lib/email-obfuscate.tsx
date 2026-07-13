import React from 'react'

// Email spam-protection helpers.
//
// Site owners type email addresses straight into ordinary text blocks (Heading,
// Text, Rich text, Quote, Caption) and we protect them from harvesters on the
// published site automatically - the editor sees the plain address, visitors
// don't.
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
// dangerouslySetInnerHTML). We only rewrite addresses sitting in *text*, never
// inside a tag's attributes, and skip anything already inside an <a>, <code> or
// <pre> - an author who hand-linked an address, or wrote one in a code sample,
// is left alone. Tokenising on tags keeps this a string operation (no DOM parse
// on the server) while still respecting element boundaries.
export function obfuscateEmailsInHtml(html: unknown): string {
  if (typeof html !== 'string' || html.indexOf('@') === -1) return typeof html === 'string' ? html : ''
  // Split into tag / text tokens, keeping the tags.
  const tokens = html.split(/(<[^>]+>)/)
  let skipDepth = 0
  for (let t = 0; t < tokens.length; t++) {
    const tok = tokens[t]
    if (!tok) continue
    if (tok.startsWith('<')) {
      const tag = /^<\s*(\/?)\s*(a|code|pre)\b/i.exec(tok)
      if (tag) {
        const closing = tag[1] === '/'
        const selfClosing = /\/\s*>$/.test(tok)
        if (closing) skipDepth = Math.max(0, skipDepth - 1)
        else if (!selfClosing) skipDepth++
      }
      continue
    }
    if (skipDepth > 0 || tok.indexOf('@') === -1) continue
    EMAIL_RE.lastIndex = 0
    tokens[t] = tok.replace(EMAIL_RE, (addr) => buildEmailAnchorHtml(addr))
  }
  return tokens.join('')
}

// The string form of ObfuscatedEmail - identical class/attrs so the same
// deobfuscator handles it.
function buildEmailAnchorHtml(addr: string): string {
  return `<a class="${EML_CLASS}" data-eml="${encodeEmail(addr)}" rel="nofollow"><span>${entityEncode(addr)}</span></a>`
}
