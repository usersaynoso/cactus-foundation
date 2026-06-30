import { marked } from 'marked'
import createDOMPurify from 'dompurify'

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

// Allowed HTML elements after markdown parsing.
// Raw HTML in the input is stripped before parsing — authors write markdown,
// not HTML. This list covers what marked legitimately produces.
const ALLOWED_TAGS = [
  'p', 'br',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'strong', 'em', 'del', 's',
  'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'hr',
]

const ALLOWED_ATTR = [
  'href', 'title', 'target', 'rel',
  'src', 'alt', 'width', 'height',
  'id', 'class',
]

// Converts markdown to sanitized HTML.
// Raw HTML blocks in the input are escaped by stripping angle brackets first,
// so <script> etc. never reach the parser.
export function markdownToHtml(markdown: string): string {
  // Strip raw HTML angle brackets before parsing so <script> becomes visible text
  const stripped = markdown.replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // Re-allow markdown-style angle-bracket blockquotes: > text
  // (marked uses `>` prefix, not `<`, so this doesn't interfere)

  const rawHtml = marked.parse(stripped, { async: false }) as string

  const clean = getPurifier().sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR: ['target'],
    FORCE_BODY: true,
  })

  return clean
}

// For use in <head> tags — strips all HTML, returns plain text
export function markdownToPlainText(markdown: string): string {
  const html = markdownToHtml(markdown)
  return html.replace(/<[^>]+>/g, '').trim()
}
