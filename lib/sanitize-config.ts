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

// Allow-list for the Puck RichText block, which is TipTap output rather than
// markdown. Same base, plus what the editor's own extension set legitimately
// emits: <u> (Underline), <s> (Strike), and a style attribute (TextAlign renders
// `style="text-align: center"`). DOMPurify drops a javascript: href regardless
// of this list, which is the one that mattered - TipTap's Link extension has no
// protocol allow-list of its own on the render path.
export const RICHTEXT_ALLOWED_TAGS = [...ALLOWED_TAGS, 'u', 'span', 'div']

export const RICHTEXT_ALLOWED_ATTR = [...ALLOWED_ATTR, 'style', 'colspan', 'rowspan']

// Allow-list for hand-written email HTML - a pasted corporate signature, most
// often. Email markup is a different dialect to page markup: layout is nested
// <table> with presentational attributes (cellpadding, cellspacing, border,
// align, valign, bgcolor), because half the world's inboxes still ignore CSS
// layout entirely. Stripping those attributes doesn't harden the HTML, it just
// collapses the design.
//
// What is NOT here is the part that matters: no script, no iframe, no object,
// no on* handler, no style element. DOMPurify drops an attribute that isn't on
// this list, so `onerror=` and friends go regardless of how they were written,
// and its own URI check still refuses a javascript: href.
export const EMAIL_HTML_ALLOWED_TAGS = [
  ...RICHTEXT_ALLOWED_TAGS,
  'tfoot', 'caption', 'colgroup', 'col', 'center', 'font', 'small', 'big', 'sub', 'sup',
]

export const EMAIL_HTML_ALLOWED_ATTR = [
  ...RICHTEXT_ALLOWED_ATTR,
  'cellpadding', 'cellspacing', 'border', 'align', 'valign', 'bgcolor',
  'background', 'face', 'color', 'size', 'span', 'dir', 'role', 'lang',
]
