'use client'

import { marked } from 'marked'
import createDOMPurify from 'dompurify'
import { ALLOWED_TAGS, ALLOWED_ATTR } from '@/lib/sanitize-config'

// Browser-only markdown renderer for client components.
//
// Unlike lib/sanitize.ts (which lazy-requires jsdom for DOMPurify on the
// server), this module uses the native browser `window` and never touches
// jsdom - so importing it into a client component can never drag jsdom into
// the client bundle. Output matches markdownToHtml in lib/sanitize.ts via the
// shared allow-list in lib/sanitize-config.ts.
//
// Only call markdownToHtml in the browser (e.g. from an event handler or while
// rendering a "preview" branch that is gated behind a mounted/loading flag).
// It reads `window`, so it must not run during server-side rendering.
let _purifier: ReturnType<typeof createDOMPurify> | null = null

function getPurifier(): ReturnType<typeof createDOMPurify> {
  if (_purifier) return _purifier
  _purifier = createDOMPurify(window)
  return _purifier
}

// Converts markdown to sanitized HTML.
// Raw HTML blocks in the input are escaped by stripping angle brackets first,
// so <script> etc. never reach the parser.
export function markdownToHtml(markdown: string): string {
  const stripped = markdown.replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const rawHtml = marked.parse(stripped, { async: false }) as string

  return getPurifier().sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR: ['target'],
    FORCE_BODY: true,
  })
}
