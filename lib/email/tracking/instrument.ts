import { isOwnClickWrapper, isOwnOpenBeacon } from './paths'

// ---------------------------------------------------------------------------
// Putting the site's own tracking into one outgoing message.
//
// Two changes to the HTML body and nothing else. An invisible picture goes on
// the end, so fetching it says the message was opened. Every ordinary web link
// is pointed at the site's own redirect first, so following it says which link
// was followed before sending the reader on to exactly where it was going.
//
// Pure: given the HTML and two functions that know how to build the addresses,
// it hands back new HTML. Nothing here signs, reads a setting or writes a row,
// which is what makes the fiddly part - deciding which links to leave alone -
// testable on its own.
//
// Left exactly as they are:
//
//   - anything that is not an http or https address: mailto:, tel:, #anchors,
//     cid: pictures, relative paths. There is nowhere to redirect them to, and
//     a mailto that went through a web page first would not open a mail app.
//   - unsubscribe and preference links. A link somebody follows to stop
//     hearing from us is the last link that should be counted as interest, and
//     some mail providers check that it goes where it says, unwrapped.
//   - links already tracked, ours or the sending service's. Wrapping a wrapper
//     makes an address nobody can read and counts one click twice. This is also
//     what leaves the links in a quoted earlier message alone.
//   - a link marked `data-cactus-untracked`, for a template that needs one
//     address left exactly as written.
//   - absurdly long addresses. The destination rides inside the token, and an
//     address two thousand characters long is past what some mail programs
//     will carry intact.
//
// And one thing is taken OUT: any open picture of ours already in the body.
// That is a quoted earlier message coming round again, and leaving its picture
// in means every time this new message is opened, the old one is recorded as
// opened as well - by the recipient reading something else entirely.
// ---------------------------------------------------------------------------

export type InstrumentOptions = {
  /** The address of the open picture for this message. */
  openUrl: string
  /** The tracked address for one link, or null to leave that link alone (the
   *  signer refused it). Handed the real destination, entities decoded. */
  linkUrl: (destination: string) => string | null
}

export type InstrumentedHtml = {
  html: string
  /** How many links were rewritten. */
  links: number
}

/** The longest destination that will be carried inside a token. */
export const MAX_TRACKED_URL_LENGTH = 1500

const ANCHOR_RE = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi
const HREF_RE = /(\bhref\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i
const IMG_RE = /<img\b[^>]*>/gi
const SRC_RE = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i

const UNSUBSCRIBE_RE = /unsubscribe|opt[\s-]?out|manage\s+(?:your\s+)?(?:email\s+)?preferences|email\s+preferences/i
/** The sending service's own click counters (Brevo's transactional and
 *  marketing halves). Matched on the path because the host keeps moving. */
const FOREIGN_WRAPPER_RE = /^https?:\/\/[^/]+\/(?:tr|mk)\/cl\//i

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&#0*38;/g, '&')
    .replace(/&#x0*26;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/** Whether one link is ours to track. Exported for the test. */
export function isTrackableLink(destination: string, attributes = '', text = ''): boolean {
  const href = destination.trim()
  if (!/^https?:\/\//i.test(href)) return false
  if (href.length > MAX_TRACKED_URL_LENGTH) return false
  // A template placeholder that was never filled in. Tracking it would sign an
  // address that goes nowhere.
  if (href.includes('{{') || href.includes('}}')) return false
  if (/\bdata-cactus-untracked\b/i.test(attributes)) return false
  if (isOwnClickWrapper(href) || FOREIGN_WRAPPER_RE.test(href)) return false
  if (UNSUBSCRIBE_RE.test(href) || UNSUBSCRIBE_RE.test(text)) return false
  return true
}

/** The body with any open picture of ours taken out. Exported because it is
 *  worth doing to a quoted body even when this message is not being tracked. */
export function stripOwnOpenBeacons(html: string): string {
  return html.replace(IMG_RE, (tag) => {
    const match = SRC_RE.exec(tag)
    const src = match ? decodeEntities(match[1] ?? match[2] ?? match[3] ?? '') : ''
    return src && isOwnOpenBeacon(src) ? '' : tag
  })
}

export function instrumentEmailHtml(html: string, options: InstrumentOptions): InstrumentedHtml {
  let links = 0

  const withLinks = stripOwnOpenBeacons(html).replace(ANCHOR_RE, (whole, attributes: string, inner: string) => {
    const hrefMatch = HREF_RE.exec(attributes)
    if (!hrefMatch) return whole
    const raw = hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? ''
    const destination = decodeEntities(raw).trim()
    if (!isTrackableLink(destination, attributes, textOf(inner))) return whole
    const tracked = options.linkUrl(destination)
    if (!tracked) return whole
    links += 1
    const rewritten = attributes.replace(HREF_RE, (_all, prefix: string) => `${prefix}"${escapeAttribute(tracked)}"`)
    return `<a${rewritten}>${inner}</a>`
  })

  const pixel = `<img src="${escapeAttribute(options.openUrl)}" width="1" height="1" alt="" `
    + 'style="display:block;width:1px;height:1px;max-width:1px;max-height:1px;border:0;margin:0;padding:0;overflow:hidden;" />'

  const closeBody = /<\/body\s*>/i.exec(withLinks)
  const out = closeBody
    ? `${withLinks.slice(0, closeBody.index)}${pixel}${withLinks.slice(closeBody.index)}`
    : `${withLinks}${pixel}`

  return { html: out, links }
}
