import { marked } from 'marked'
import createDOMPurify from 'dompurify'
import { obfuscateEmailsInHtml } from '@/lib/email-obfuscate'
import {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  RICHTEXT_ALLOWED_TAGS,
  RICHTEXT_ALLOWED_ATTR,
} from '@/lib/sanitize-config'

// DOMPurify needs a DOM environment.
// Browser: use the native window. Node.js: lazy-require jsdom so it never
// lands in the client bundle (Turbopack tree-shakes the server branch).
let _purifier: ReturnType<typeof createDOMPurify> | null = null

function getPurifier(): ReturnType<typeof createDOMPurify> {
  if (_purifier) return _purifier
  if (typeof window !== 'undefined') {
    _purifier = createDOMPurify(window)
  } else {
    const { JSDOM } = require('jsdom') as typeof import('jsdom')
    const dom = new JSDOM('<!DOCTYPE html>')
    _purifier = createDOMPurify(dom.window as unknown as Parameters<typeof createDOMPurify>[0])
  }
  return _purifier
}

// Allow-list lives in lib/sanitize-config.ts so the client renderer
// (lib/markdown-client.ts) produces identical output without importing jsdom.

// Converts markdown to sanitized HTML.
// Raw HTML blocks in the input are escaped by stripping angle brackets first,
// so <script> etc. never reach the parser.
export function markdownToHtml(markdown: string, opts?: { breaks?: boolean }): string {
  // Strip raw HTML angle brackets before parsing so <script> becomes visible text
  const stripped = markdown.replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // Re-allow markdown-style angle-bracket blockquotes: > text
  // (marked uses `>` prefix, not `<`, so this doesn't interfere)

  const rawHtml = marked.parse(stripped, { async: false, breaks: opts?.breaks ?? false }) as string

  const clean = getPurifier().sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR: ['target'],
    FORCE_BODY: true,
  })

  return clean
}

// For use in <head> tags — strips all HTML, returns plain text
export function markdownToPlainText(markdown: string, opts?: { breaks?: boolean }): string {
  const html = markdownToHtml(markdown, opts)
  return html.replace(/<[^>]+>/g, '').trim()
}

// Cleans the HTML a RichText block renders on a published page.
//
// The markdown path above is safe because raw HTML is escaped before parsing.
// The Puck RichText block has no such step: its content is either TipTap JSON
// (converted back to HTML for the RSC render) or a raw HTML string, and both go
// straight into dangerouslySetInnerHTML. TipTap's Link extension carries no
// protocol allow-list on that path either, so a stored `javascript:` href
// survived the round trip. Run it through the same allow-list as everything else.
export function sanitizeRichText(html: string): string {
  if (!html) return ''
  return getPurifier().sanitize(html, {
    ALLOWED_TAGS: RICHTEXT_ALLOWED_TAGS,
    ALLOWED_ATTR: RICHTEXT_ALLOWED_ATTR,
    ADD_ATTR: ['target'],
    FORCE_BODY: true,
  })
}

// Published RichText: sanitise FIRST, obfuscate emails AFTER. The order is the
// whole point - DOMPurify parses and re-serialises the markup, which decodes
// the numeric entities the obfuscator emits, putting the plain address straight
// back into the served HTML (this is exactly what happened when the RSC render
// obfuscated before sanitising). The obfuscator's own output (data-eml + entity
// text) is generated markup, not owner input, so it needs no second pass.
export function sanitizeAndObfuscateRichText(html: string): string {
  return obfuscateEmailsInHtml(sanitizeRichText(html))
}

// Strips <script>, event handlers, and other executable content from an
// uploaded SVG before it's stored - an unsanitised SVG served back with an
// image/svg+xml content type can run script when opened directly (as opposed
// to <img>, where the browser won't execute it), so this closes that off
// regardless of how the file ends up being viewed.
export function sanitizeSvg(svg: string): string {
  return getPurifier().sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['use'],
  })
}
