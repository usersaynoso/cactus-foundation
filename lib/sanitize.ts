import { marked } from 'marked'
import createDOMPurify from 'dompurify'
import { ALLOWED_TAGS, ALLOWED_ATTR } from '@/lib/sanitize-config'

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
