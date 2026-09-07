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
// `b` and `i` are here and not in the richtext list above for a reason: nothing
// on a page emits them any more, but everything that writes an email does. A
// contentEditable box's own bold and italic are `<b>` and `<i>` in every browser
// there is, and so is half the world's pasted signature - so stripping them
// silently unbolds what somebody plainly bolded, which is the worst way for a
// sanitiser to be wrong.
export const EMAIL_HTML_ALLOWED_TAGS = [
  ...RICHTEXT_ALLOWED_TAGS,
  // `strike` for the same reason as `b` and `i` above, and it is the same
  // browsers doing it: a contentEditable box asked for strikethrough writes
  // `<strike>` rather than the `<s>` the list already carried, so a struck-out
  // line was quietly un-struck the first time the draft was saved.
  'b', 'i', 'strike',
  'tfoot', 'caption', 'colgroup', 'col', 'center', 'font', 'small', 'big', 'sub', 'sup',
]

export const EMAIL_HTML_ALLOWED_ATTR = [
  ...RICHTEXT_ALLOWED_ATTR,
  'cellpadding', 'cellspacing', 'border', 'align', 'valign', 'bgcolor',
  'background', 'face', 'color', 'size', 'span', 'dir', 'role', 'lang',
]
