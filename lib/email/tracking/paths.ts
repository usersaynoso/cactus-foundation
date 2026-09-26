// ---------------------------------------------------------------------------
// Where the site's own email tracking lives on the web, and how to recognise
// one of its addresses when it turns up somewhere else.
//
// Two addresses, both on the site's own domain: an invisible picture that is
// fetched when a message is opened, and a redirect that every link in the
// message is rewritten to go through. See lib/email/tracking/instrument.ts for
// the rewriting and app/api/email/{o,c}/[token] for the two routes.
//
// This file is deliberately tiny and pure - no crypto, no database, nothing
// Node-only - because it is read from a browser as well as a server. The
// unified inbox draws our own sent mail on the screen, and it has to know one
// of these addresses when it sees one so that the site reading its own post
// never counts as the recipient reading it.
// ---------------------------------------------------------------------------

/** The picture. Fetching it is an open. */
export const EMAIL_OPEN_PATH = '/api/email/o/'

/** The redirect. Following it is a click. */
export const EMAIL_CLICK_PATH = '/api/email/c/'

/** The path of an address, or null when it is not a web address at all. Never
 *  throws: it is handed whatever was written in an href or a src. A mail
 *  client's image proxy (Gmail's, notably) keeps the original address after a
 *  `#`, and that is matched too - a quoted copy of our message that came back
 *  through Gmail still carries our picture underneath it. */
function pathsOf(raw: string): string[] {
  const value = raw.trim()
  if (!value) return []
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return []
    const out = [url.pathname]
    const hash = url.hash.slice(1)
    if (hash) {
      try {
        out.push(new URL(hash).pathname)
      } catch {
        // Not an address behind the #, which is the ordinary case.
      }
    }
    return out
  } catch {
    return []
  }
}

/** True when fetching this address would record an open of one of our own
 *  messages. */
export function isOwnOpenBeacon(url: string): boolean {
  return pathsOf(url).some((path) => path.startsWith(EMAIL_OPEN_PATH))
}

/** True when following this address would record a click on one of our own
 *  messages. */
export function isOwnClickWrapper(url: string): boolean {
  return pathsOf(url).some((path) => path.startsWith(EMAIL_CLICK_PATH))
}

/** base64url to text, in a way that works in a browser and in Node alike. */
function decodeBase64Url(value: string): string | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4)
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

/**
 * The address one of our tracked links actually leads to, read straight out of
 * its token, or null when it is not one of ours.
 *
 * NOT VERIFIED. The signature is not checked here and cannot be - this runs in
 * a browser, which never holds the key. It is for SHOWING somebody where a link
 * in their own sent mail goes, and for going there directly rather than through
 * the counter. A forged token only gets as far as naming an address, which is
 * shown to the reader in full before anything is opened, exactly as any other
 * link in a stranger's email is. The redirect route is where the signature is
 * enforced, and it refuses anything unsigned.
 */
export function ownTrackedDestination(href: string): string | null {
  if (!isOwnClickWrapper(href)) return null
  let path: string
  try {
    path = new URL(href.trim().startsWith('//') ? `https:${href.trim()}` : href.trim()).pathname
  } catch {
    return null
  }
  const token = decodeURIComponent(path.slice(EMAIL_CLICK_PATH.length).split('/')[0] ?? '')
  const body = token.split('.')[1]
  if (!body) return null
  const json = decodeBase64Url(body)
  if (!json) return null
  try {
    const claim = JSON.parse(json) as { u?: unknown }
    return typeof claim.u === 'string' && /^https?:\/\//i.test(claim.u) ? claim.u : null
  } catch {
    return null
  }
}
