import { resolveSiteUrl } from '@/lib/seo/site-url'

/**
 * The address the visitor actually used, decided in ONE place.
 *
 * On Vercel and Netlify `request.url` and `request.nextUrl.origin` are the public
 * address, and code all over Cactus builds redirects, origin checks and callback
 * addresses from them. On the `server` hosting provider they are not: under
 * `next start` behind Caddy, Next builds them from its own bind address and port,
 * so they read `https://localhost:3101` (next-server.js builds the proxy's URL
 * from `fetchHostname:port`; `experimental.trustHostHeader` only touches the
 * route handlers' `initURL`, is baked in at build time, and never reaches the
 * proxy at all, so it cannot be the answer). The symptoms were every signed-in
 * POST refused as "Origin not allowed" and OAuth callbacks that sent the browser
 * to localhost.
 *
 * So anything that needs "the public address of this request" calls
 * publicOrigin() or publicUrl(), never request.url / nextUrl.origin. The one
 * exception is NextResponse.rewrite(): a rewrite must stay on Next's own view of
 * the request URL, or Next treats the target as an external site and proxies it.
 *
 * Off a server nothing changes: the answer is request.url's origin, exactly as
 * before.
 *
 * On a server the answer comes from the Host / X-Forwarded-Host Caddy passes,
 * but only when that host is the site's own (SITE_URL's host, or its www / apex
 * twin). Anything else - a forged Host, a health check calling by IP - is
 * answered with SITE_URL's origin. That is what keeps the CSRF check honest: the
 * result is always one of the site's own addresses, never something a request
 * gets to name, so a cross-site Origin can never equal it. The Host is also not
 * the only gate: the site listens on loopback only and Caddy routes only the
 * domains configured for it. Before SITE_URL exists (the window before setup
 * writes it) the Host is used as given, because there is nothing to compare to.
 */
export type RequestLike = { url: string; headers: Headers }

function onServerProvider(): boolean {
  return process.env.CACTUS_HOSTING_PROVIDER === 'server' && process.env.VERCEL !== '1'
}

function firstValue(value: string | null): string {
  return value?.split(',')[0]?.trim().toLowerCase() ?? ''
}

// A hostname with an optional port. No userinfo, path, or IPv6 literal.
const HOST_PATTERN = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/

function hostnameOf(host: string): string {
  return host.split(':')[0] ?? ''
}

function isSiteHost(hostname: string, siteHostname: string): boolean {
  const apex = siteHostname.replace(/^www\./, '')
  return hostname === apex || hostname === `www.${apex}`
}

export function publicOrigin(request: RequestLike): string {
  const own = new URL(request.url).origin
  if (!onServerProvider()) return own

  const site = resolveSiteUrl()
  const siteUrl = site ? new URL(site) : null

  const host = firstValue(request.headers.get('x-forwarded-host')) || firstValue(request.headers.get('host'))
  const hostUsable = HOST_PATTERN.test(host)

  const forwarded = firstValue(request.headers.get('x-forwarded-proto'))
  const proto =
    forwarded === 'http' || forwarded === 'https'
      ? forwarded
      : siteUrl
        ? siteUrl.protocol.replace(':', '')
        : 'https'

  if (siteUrl) {
    if (hostUsable && isSiteHost(hostnameOf(host), siteUrl.hostname.toLowerCase())) return `${proto}://${host}`
    return siteUrl.origin
  }
  return hostUsable ? `${proto}://${host}` : own
}

/**
 * A URL on the public address, for a redirect the browser will follow.
 *
 * With no target it is this same request's path and query on the public address.
 * With one, the target is resolved against the public address. Off a server it is
 * `new URL(target, request.url)`, as these call sites always were.
 */
export function publicUrl(request: RequestLike, target?: string): URL {
  if (!onServerProvider()) return target === undefined ? new URL(request.url) : new URL(target, request.url)
  const base = publicOrigin(request)
  if (target !== undefined) return new URL(target, base)
  const current = new URL(request.url)
  return new URL(`${current.pathname}${current.search}`, base)
}
