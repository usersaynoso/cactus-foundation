// ---------------------------------------------------------------------------
// Reading a phone number the way somebody actually types one.
//
// Every telephony provider wants E.164 - a plus, a country code and digits -
// and nobody at a keyboard types that. They type the number off the bottom of
// an email: 020 8138 0512, or 07700 900123, or (0208) 138 0512. So one reader
// sits here, in core, taking whichever of those it is given and handing back
// the one shape a provider will take.
//
// WHICH COUNTRY is a site setting, not a constant. `SiteConfig.diallingCode`
// says which country a short local number belongs to; this file only does the
// arithmetic. Nothing here reaches a database, so it is safe on both sides of
// the app - the box somebody is typing into can tidy the number up as they
// leave it, and the route that receives it does the same sum again rather than
// trusting the browser to have done it.
// ---------------------------------------------------------------------------

/** E.164: a plus, a country code that never starts with a zero, then digits.
 *  Fifteen digits is the ITU's ceiling and every provider enforces it. */
const E164 = /^\+[1-9]\d{7,14}$/

/** Everything people put in a phone number that is not part of the number:
 *  spaces of every width, brackets, dots, slashes, and every hyphen and dash a
 *  word processor might have turned a plain one into (U+2010 to U+2015). */
const PUNCTUATION = /[\s()./‐-―-]/g

/** True for a number already in the shape a provider will take. */
export function isE164(value: string): boolean {
  return E164.test(value)
}

/** A site's dialling code as digits only: "+44", "44" and "0044" all mean 44. */
function codeDigits(diallingCode: string): string {
  return diallingCode.replace(PUNCTUATION, '').replace(/^\+/, '').replace(/^00/, '')
}

/**
 * A typed phone number as E.164, or null when it cannot be read as one.
 *
 * `diallingCode` is the country short local numbers belong to, in any of the
 * forms an owner might have typed it into settings ("+44", "44", "0044").
 *
 *   +44 20 8138 0512  -> +442081380512   (already international)
 *   0044 2081380512   -> +442081380512   (international, the old way)
 *   020 8138 0512     -> +442081380512   (national, trunk zero dropped)
 *   2081380512        -> +442081380512   (national, no trunk zero either)
 *   447700900123      -> +447700900123   (carries the country code already)
 *
 * The last one is the only guess in here, and it is a guarded one: bare digits
 * are read as already carrying the country code ONLY when they begin with it
 * and enough is left afterwards to be a number. A national number does not
 * begin with its own country's dialling code in any of the places this runs -
 * a UK number written without its trunk zero starts 1, 2, 3, 7, 8 or 9 - so
 * the alternative reading would be a wrong number rather than an ambiguity.
 */
export function toE164(input: string, diallingCode: string): string | null {
  const cleaned = input.replace(PUNCTUATION, '')
  if (!cleaned) return null

  const code = codeDigits(diallingCode)
  // A site whose dialling code is missing or nonsense can still place a call to
  // a number typed in full; it just cannot expand a local one.
  const usable = /^[1-9]\d{0,3}$/.test(code) ? code : null

  let candidate: string
  if (cleaned.startsWith('+')) {
    candidate = cleaned
  } else if (cleaned.startsWith('00')) {
    candidate = `+${cleaned.slice(2)}`
  } else if (!/^\d+$/.test(cleaned)) {
    return null
  } else if (!usable) {
    return null
  } else if (cleaned.startsWith('0')) {
    // The trunk prefix. One zero, and only one: 00 was handled above.
    candidate = `+${usable}${cleaned.replace(/^0+/, '')}`
  } else if (cleaned.startsWith(usable) && cleaned.length - usable.length >= 6) {
    candidate = `+${cleaned}`
  } else {
    candidate = `+${usable}${cleaned}`
  }

  return E164.test(candidate) ? candidate : null
}
