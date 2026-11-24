// Link colour (and underline) for an email wrapper.
//
// Message bodies come from the email templates with bare <a href> links, so on
// a dark card they arrive in the mail client's default blue - about 1.3:1
// against a dark green, which is to say invisible. The wrapper's optional
// `linkColour` / `linkUnderline` root settings fix that in the two ways mail
// clients listen to:
//
//  * an inline `style="color:...;"` on every <a> on the card that does not
//    already set its own colour. Inline styles are the only thing Gmail and
//    Outlook reliably honour. A link that sets its colour - a template's button,
//    the shop's item links - is left exactly as it is, so a white button label
//    stays white.
//  * a matching rule in the document's <style>, scoped to the card, for the odd
//    client that rewrites inline styles but keeps the head. Inline still wins
//    wherever both survive, so the rule can never repaint a button.
//
// Unset means untouched: with neither setting chosen, every function here is
// the identity and the document is byte-for-byte what it was before this
// existed (lib/email/links.test.ts proves it over every registered template).
//
// No React and no Prisma here: lib/email/blocks.ts (shared with the editor
// canvas) imports this.

import { splitLightDark } from '@/lib/puck/lightDark'

export type EmailLinkStyle = {
  /** A validated hex colour, or '' for "leave links alone". */
  colour: string
  /** '' leaves each link's underline as the message has it. */
  decoration: '' | 'underline' | 'none'
}

/** Class on the card table that scopes the head rule. Only emitted when a link
 * style is set. */
export const EMAIL_LINKS_CLASS = 'cactus-email-links'

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** A hex, or a site colour (token id or the picker's `var(--color-N)`, given a
 * palette that maps it) that resolves to a hex, lower-cased. Anything else
 * - a named colour, rgb(), var(), or something trying to close the style
 * attribute - is refused as '' rather than passed into the markup. */
export function resolveEmailLinkColour(value: unknown, colours: Record<string, string>): string {
  if (typeof value !== 'string') return ''
  let raw = value.trim()
  // A picked site colour may carry a dark arm; email sends the light one.
  if (raw.startsWith('light-dark(')) raw = splitLightDark(raw).light
  if (!raw) return ''
  const resolved = raw.startsWith('#') ? raw : (colours[raw] ?? '').trim()
  return HEX.test(resolved) ? resolved.toLowerCase() : ''
}

export function emailLinkStyle(root: Record<string, unknown>, colours: Record<string, string>): EmailLinkStyle {
  const u = root.linkUnderline
  return {
    colour: resolveEmailLinkColour(root.linkColour, colours),
    decoration: u === 'underline' || u === 'none' ? u : '',
  }
}

export function hasEmailLinkStyle(style: EmailLinkStyle): boolean {
  return Boolean(style.colour || style.decoration)
}

/** The backup head rule, or '' when nothing is set. Values are already
 * validated, so nothing here can close the <style> block. */
export function emailLinkHeadCss(style: EmailLinkStyle): string {
  if (!hasEmailLinkStyle(style)) return ''
  const decls = `${style.colour ? `color:${style.colour};` : ''}${style.decoration ? `text-decoration:${style.decoration};` : ''}`
  return `<style>.${EMAIL_LINKS_CLASS} a{${decls}}</style>`
}

// An <a> start tag: `<a` followed by whitespace, `>` or `/`, so <abbr>, <area>
// and friends never match. Quoted attribute values may contain `>`.
const A_TAG = /<a(?=[\s>/])((?:[^>"']|"[^"]*"|'[^']*')*)>/gi
// One attribute: a name, then optionally `=` and a double-, single- or unquoted
// value. Walking attributes one at a time is what stops `title="style=..."` or
// `data-style=` passing for the real style attribute.
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

const SETS_COLOUR = /(?:^|;)\s*color\s*:/i
const SETS_DECORATION = /(?:^|;)\s*text-decoration(?:-line)?\s*:/i

function styleTag(tag: string, attrs: string, style: EmailLinkStyle): string {
  let found: { start: number; end: number; name: string; value: string; quote: string } | null = null
  for (const m of attrs.matchAll(ATTR)) {
    const name = m[1] ?? ''
    if (name.toLowerCase() !== 'style') continue
    const quote = m[2] !== undefined ? '"' : m[3] !== undefined ? "'" : ''
    found = { start: m.index, end: m.index + m[0].length, name, value: m[2] ?? m[3] ?? m[4] ?? '', quote }
    break
  }
  const existing = found?.value ?? ''
  const add =
    (style.colour && !SETS_COLOUR.test(existing) ? `color:${style.colour};` : '') +
    (style.decoration && !SETS_DECORATION.test(existing) ? `text-decoration:${style.decoration};` : '')
  if (!add) return tag
  const open = tag.slice(0, 2) // `<a` or `<A`, as written
  if (!found) return `${open} style="${add}"${attrs}>`
  // An unquoted value cannot contain a quote, so re-quoting it is safe.
  const q = found.quote || '"'
  const rebuilt = `${found.name}=${q}${add}${existing}${q}`
  return `${open}${attrs.slice(0, found.start)}${rebuilt}${attrs.slice(found.end)}>`
}

/** Adds the link style inline to every <a> that has not set its own. */
export function styleEmailLinks(html: string, style: EmailLinkStyle): string {
  if (!hasEmailLinkStyle(style) || !html) return html
  return html.replace(A_TAG, (tag: string, attrs: string) => styleTag(tag, attrs, style))
}
