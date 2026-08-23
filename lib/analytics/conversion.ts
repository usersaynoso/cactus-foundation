'use client'

// ---------------------------------------------------------------------------
// The conversion seam.
//
// Something worth measuring happened - an order was placed, a lead was left, a
// quote was asked for - and whichever module measures things wants to know. The
// two halves must not know each other exists: the shop cannot depend on a
// Google tag being installed, and a tag module cannot depend on the shop. So
// both talk to core instead, and core says nothing about who is listening.
//
// Everything here is deliberately vendor-neutral. The field names read like a
// receipt rather than like any one advertising platform's payload, and it is
// the listening module's job to translate. A second tag module (Meta, Bing,
// plain server logging) listens on exactly the same event with no change here.
// ---------------------------------------------------------------------------

export const CONVERSION_EVENT = 'cactus:conversion'

export type ConversionItem = {
  /** SKU where the announcer has one, otherwise any stable id. */
  id?: string
  name: string
  quantity: number
  /** Unit price, in major units (pounds, not pence). */
  price: number
  /** Human wording for the variation bought, where there is one. */
  variant?: string
  category?: string
}

export type Conversion = {
  /**
   * What happened. 'purchase' is the one with money attached; the rest are the
   * ordinary lead-shaped events a site cares about. A module may invent its own
   * string - listeners that do not recognise it ignore it rather than guessing.
   */
  type: 'purchase' | 'lead' | 'quote' | 'signup' | (string & {})
  /**
   * The order number, enquiry reference, or whatever else identifies this one
   * event for ever. Supply it wherever one exists: it is what stops a refresh
   * of the confirmation page counting as a second sale.
   */
  transactionId?: string
  /** Total value in major units. Omit for events with no money attached. */
  value?: number
  /** ISO 4217, e.g. 'GBP'. Required by every ad platform whenever value is set. */
  currency?: string
  tax?: number
  shipping?: number
  coupon?: string
  items?: ConversionItem[]
}

declare global {
  interface Window {
    /**
     * Every conversion announced since this page loaded. Lives on window rather
     * than in this module's scope because core, the shop and a tag module are
     * three separate bundles - a module-scope array would be three arrays.
     */
    __cactusConversions?: Conversion[]
  }
}

// A conversion is announced from a page the shopper can refresh, bookmark, or
// come back to tomorrow, so "already counted" has to outlive the tab. Bounded,
// because this is a browser's storage and not a ledger.
const SEEN_KEY = 'cactus-conversions-seen'
const SEEN_MAX = 40

function seenKey(c: Conversion): string | null {
  return c.transactionId ? `${c.type}:${c.transactionId}` : null
}

function readSeen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function markSeen(key: string): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...readSeen(), key].slice(-SEEN_MAX)))
  } catch { /* storage unavailable - the in-page buffer still stops a repeat this visit */ }
}

/**
 * True when this exact conversion has already been announced, in this visit or
 * a previous one. Only ever true for a conversion carrying a transactionId -
 * without one there is nothing to tell two genuine events apart, so nothing is
 * suppressed.
 */
export function conversionAlreadyAnnounced(c: Conversion): boolean {
  if (typeof window === 'undefined') return false
  const key = seenKey(c)
  if (!key) return false
  if ((window.__cactusConversions ?? []).some((prev) => seenKey(prev) === key)) return true
  return readSeen().includes(key)
}

/**
 * Announce a conversion once. Safe to call on every render or every poll tick:
 * a repeat of an identified conversion is dropped here rather than in each
 * listener, so no listener can forget to do it and every listener agrees on
 * what counted.
 */
export function announceConversion(c: Conversion): void {
  if (typeof window === 'undefined') return
  if (conversionAlreadyAnnounced(c)) return
  const key = seenKey(c)
  if (key) markSeen(key)
  ;(window.__cactusConversions ??= []).push(c)
  window.dispatchEvent(new CustomEvent<Conversion>(CONVERSION_EVENT, { detail: c }))
}

/**
 * Listen for conversions, including any announced before this listener existed.
 * The replay matters: a tag module loads its script asynchronously and may well
 * subscribe after the confirmation page has already announced the sale.
 *
 * Returns the unsubscribe.
 */
export function onConversion(cb: (c: Conversion) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  // Read the buffer and attach the listener with no await in between, so a
  // conversion cannot slip through the gap and be neither replayed nor heard.
  for (const past of window.__cactusConversions ?? []) cb(past)
  const handler = (e: Event) => cb((e as CustomEvent<Conversion>).detail)
  window.addEventListener(CONVERSION_EVENT, handler)
  return () => window.removeEventListener(CONVERSION_EVENT, handler)
}
