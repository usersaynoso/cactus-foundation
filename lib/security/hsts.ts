// The Strict-Transport-Security value the proxy sends, overridable per site with
// the CACTUS_HSTS environment variable.
//
//   unset or blank -> DEFAULT_HSTS, byte for byte (every site that never sets it
//                     keeps the header it has always had)
//   "off"          -> no HSTS header at all
//   a valid value  -> that value, tidied to "max-age=N[; includeSubDomains][; preload]"
//   anything else  -> DEFAULT_HSTS, with one warning, so a typo can never quietly
//                     weaken a site or put a header browsers would ignore on it
//
// Why it exists: includeSubDomains (and preload) bind every subdomain of the
// site's domain to HTTPS. A site whose domain also carries subdomains served some
// other way - plain HTTP on a home network, a tunnel - has to be able to drop them.

export const DEFAULT_HSTS = 'max-age=63072000; includeSubDomains; preload'

export const HSTS_ENV_VAR = 'CACTUS_HSTS'

// Parses an HSTS value against RFC 6797's directives, case-insensitively.
// Returns the tidied value, or null when it is not one a browser would accept
// as written: max-age missing or not a whole number, a directive repeated, or a
// directive this file does not know.
export function normaliseHsts(raw: string): string | null {
  const parts = raw.split(';').map((p) => p.trim()).filter((p) => p.length > 0)
  let maxAge: string | null = null
  let includeSubDomains = false
  let preload = false
  for (const part of parts) {
    const m = /^max-age\s*=\s*"?(\d{1,10})"?$/i.exec(part)
    if (m) {
      if (maxAge !== null) return null
      maxAge = String(Number(m[1]))
      continue
    }
    const lower = part.toLowerCase()
    if (lower === 'includesubdomains') {
      if (includeSubDomains) return null
      includeSubDomains = true
      continue
    }
    if (lower === 'preload') {
      if (preload) return null
      preload = true
      continue
    }
    return null
  }
  if (maxAge === null) return null
  return [`max-age=${maxAge}`, includeSubDomains ? 'includeSubDomains' : null, preload ? 'preload' : null]
    .filter((p): p is string => p !== null)
    .join('; ')
}

// The value to send, or null for "send no HSTS header". `warn` is called at most
// once per call, only for a malformed value; the proxy resolves this once at
// module load, so a bad value is reported once per server process.
export function resolveHsts(raw: string | undefined, warn: (message: string) => void = () => {}): string | null {
  const value = raw?.trim() ?? ''
  if (value === '') return DEFAULT_HSTS
  if (value.toLowerCase() === 'off') return null
  const normalised = normaliseHsts(value)
  if (normalised === null) {
    warn(`[cactus] ${HSTS_ENV_VAR} is not a valid Strict-Transport-Security value; sending the default (${DEFAULT_HSTS}) instead.`)
    return DEFAULT_HSTS
  }
  return normalised
}
