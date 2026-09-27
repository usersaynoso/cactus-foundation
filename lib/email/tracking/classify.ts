// ---------------------------------------------------------------------------
// What an open is worth.
//
// An open is somebody's computer fetching an invisible picture, and plenty of
// computers do that without a person anywhere near. The two that matter:
//
//   Apple Mail Privacy Protection fetches every picture in every message the
//   moment it arrives, through Apple's own servers, whether or not anybody
//   ever looks. It announces itself by announcing nothing - the program name
//   it sends is the bare "Mozilla/5.0" with no detail after it, which no real
//   browser or mail program sends.
//
//   Office mail security (Mimecast, Proofpoint, Barracuda and the rest) opens
//   everything on the way in to look for anything nasty. Most name themselves.
//
// Both are kept as a separate kind of event rather than thrown away - "their
// email app fetched it" is still a fact, and it does at least say the message
// landed - but neither is ever reported as somebody having opened it. Gmail and
// Yahoo also fetch pictures through their own servers, but only when the
// message is opened, so those are genuine opens and are counted as such.
//
// Missed opens are the other half, and nothing can fix those: Outlook in an
// office very often blocks pictures until somebody presses a button, so a
// message read there may never be counted at all. A followed link is the only
// signal worth leaning on, and the screens say so.
// ---------------------------------------------------------------------------

export type OpenKind = 'opened' | 'proxy_open'

/**
 * How soon after sending an open is taken to be the mail system fetching the
 * picture on arrival rather than a person reading.
 *
 * Measured on a live site, 2026-09-27: on every test send, Google's picture
 * proxy fetched the picture 3 to 5 seconds after the message left, an iPhone
 * mail app 13 to 18 seconds after, and Apple's privacy fetch inside 22 - all
 * before anybody could have opened anything. Gmail now fetches pictures as mail
 * arrives, not only when it is opened, so its proxy can no longer be trusted on
 * its own. A minute is comfortably past all of that. The price is that somebody
 * who genuinely reads a message within a minute of it landing is recorded as
 * "their email app fetched it" - and any later open still counts in full.
 */
export const ARRIVAL_FETCH_WINDOW_MS = 60_000

const SCANNER_RE = /mimecast|proofpoint|barracuda|symantec|messagelabs|trend\s?micro|sophos|fortinet|forcepoint|cisco|ironport|zscaler|bot\b|crawler|spider|python-|curl\/|wget\/|go-http-client|java\/|okhttp|headless/i

/** Whether an open came from a person's mail program or from a machine acting
 *  on its own. `sinceSendMs` is how long after the send it arrived, when the
 *  token says when that was (tokens minted before it did carry nothing). */
export function classifyOpen(userAgent: string | null | undefined, sinceSendMs?: number | null): OpenKind {
  const agent = (userAgent ?? '').trim()
  // Fetched as the message arrived, by whatever fetched it. See above.
  if (typeof sinceSendMs === 'number' && sinceSendMs < ARRIVAL_FETCH_WINDOW_MS) return 'proxy_open'
  // Apple Mail Privacy Protection, and anything else that says nothing at all.
  if (!agent || agent === 'Mozilla/5.0') return 'proxy_open'
  // Gmail and Yahoo fetch through their own servers. Past the arrival window,
  // that is somebody opening it.
  if (/GoogleImageProxy|YahooMailProxy/i.test(agent)) return 'opened'
  if (SCANNER_RE.test(agent)) return 'proxy_open'
  return 'opened'
}

/** The program name as it is worth storing: trimmed, and short enough that a
 *  column somebody reads with their eyes stays readable. */
export function tidyUserAgent(userAgent: string | null | undefined): string | null {
  const agent = (userAgent ?? '').trim()
  return agent ? agent.slice(0, 500) : null
}

/** A network address as it is worth storing, or null for anything that is not
 *  one. It goes on a screen, so it is checked rather than trusted. */
export function tidyIp(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim().slice(0, 64)
  if (!raw || raw === 'unknown') return null
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(raw)
  if (v4 && v4.slice(1).every((part) => Number(part) <= 255)) return raw
  if (/^[0-9a-f:.]+$/i.test(raw) && raw.includes(':')) return raw.toLowerCase()
  return null
}
