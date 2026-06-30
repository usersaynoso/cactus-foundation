// Shared allow-list for the markdown sanitisers.
//
// Imported by both the server renderer (lib/sanitize.ts, jsdom-backed) and the
// client renderer (lib/markdown-client.ts, window-backed) so the two produce
// identical output. This module is plain constants only - no jsdom, no window -
// so it is safe to import from a server or a client component.

// Allowed HTML elements after markdown parsing.
// Raw HTML in the input is stripped before parsing - authors write markdown,
// not HTML. This list covers what marked legitimately produces.
export const ALLOWED_TAGS = [
  'p', 'br',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'strong', 'em', 'del', 's',
  'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'hr',
]

export const ALLOWED_ATTR = [
  'href', 'title', 'target', 'rel',
  'src', 'alt', 'width', 'height',
  'id', 'class',
]
