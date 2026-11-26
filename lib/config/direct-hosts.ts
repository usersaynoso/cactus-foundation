/**
 * The site's direct domains (Cloudflare proxy off), which cactus-host lists in
 * CACTUS_HOST_DIRECT_HOSTS - a bookkeeping hostname such as books.example.co.uk
 * that browsers reach without a proxy in between. They are the site's own
 * addresses as much as SITE_URL is, and cactus-host owns the value, so it is
 * never a request's to name. Lower-cased, in the order listed.
 *
 * Its own file, free of imports, because the request proxy reads it too and
 * must not pull the rest of lib/config/env.ts in with it.
 */
export function getDirectHosts(): string[] {
  return (process.env.CACTUS_HOST_DIRECT_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
}
