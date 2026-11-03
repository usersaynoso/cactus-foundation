import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { publicUrl } from '@/lib/security/public-origin'
import { resolveBranding, type IconMedia, type ResolvedBranding } from '@/lib/config/branding'
import {
  ICON_VARIANTS,
  ICO_ENTRIES,
  pickSlot,
  variantForRequest,
  type IconSlot,
  type IconVariant,
} from '@/lib/config/favicon-variants'
import { composeIco, ensurePng, looksLikeSvg } from '@/lib/config/favicon-render'
import { downloadMedia } from '@/lib/media/upload'

// Every icon the browser fetches, served from the site's own address and drawn
// at exactly the format and size the address promises. next.config.ts rewrites
// each public address to /api/branding/favicon/<variant> (beforeFiles, so they
// beat the static file handler); the full list is ICON_PATHS in
// lib/config/favicon-variants.ts.
//
// The history this route has, so nobody has to learn it again:
//
// - Icons used to be media-host addresses. On a page carrying hundreds of
//   product images from that host, the icon fetch (always last, always lowest
//   priority) queued behind all of them, and a dropped fetch left that page with
//   a blank tab until the browser's icon cache aged out. So: same origin.
// - Everything without a document head (a sitemap, a JSON response, a download)
//   asks for /favicon.ico by name, and used to find the bundled Cactus icon. So:
//   the well-known names answer with the site's own icon.
// - WebKit refuses an icon whose bytes do not match the address and label it was
//   offered under. The generated PNGs were being turned into WebP by the media
//   optimiser, /favicon.ico answered with PNG or WebP bytes, and Safari drew a
//   blank tab. So: this route REDRAWS. Whatever was uploaded is only a source;
//   what goes out is a real ICO, a PNG of exactly the named size, or an SVG.
// - The variant used to arrive as ?icon=... added by the rewrite. Under `next
//   start` that query never reached the route, and every sized PNG answered with
//   the 96px favicon. So: the variant is a path segment.
// - A failed branding read used to look exactly like "this site has no icon",
//   and that answer - a redirect to Cactus - was cached for an hour at the CDN,
//   a day stale, and indefinitely in browsers' icon stores. So: a failed read is
//   answered from memory, or with a 503 nobody caches. Never with Cactus. The
//   Cactus icon is only ever the answer for a site that, according to a read
//   that actually worked, has no icons at all.
export const dynamic = 'force-dynamic'

// Long enough that a slow storage provider cannot pin a function open, short
// enough that the browser gives up on us rather than the other way round.
const SOURCE_TIMEOUT_MS = 5000

// An unversioned address (/favicon.ico as a crawler asks for it): short enough
// that a changed icon shows up within the hour, long enough that it is not a
// render per page view.
const CACHE_CONTROL = 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'

// A versioned address (?v= matching the icons in use): the address changes when
// the icon does, so these bytes can never be stale.
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, s-maxage=31536000, immutable'

// Anything answered from memory because this request could not read fresh: kept
// short so the real answer takes over as soon as it can.
const TRANSIENT_CACHE_CONTROL = 'public, max-age=60, s-maxage=60'

// An SVG served from the site's own origin is a document that could carry
// script. Uploads are sanitised already; this makes it inert regardless, should
// anyone open /favicon.svg directly.
const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox"

type Drawn = { bytes: Buffer; type: string; etag: string }

// What draw() produced, and whether it had to settle for less than the best
// source (its first choice was unreadable, or an ICO came out short of a size).
// A settled-for drawing is still served - it beats nothing - but only briefly,
// and never remembered, or a moment's storage hiccup would be cached at the
// edge and in browsers for a year as the site's icon.
type Drawing = { drawn: Drawn; degraded: boolean }

// Small per-instance memories. Sources by media id + url (a media row whose
// file is replaced changes url), drawings by variant + icon version, and the
// last drawing that went out for each variant, which is what answers when a
// later request cannot read anything at all.
// Capped by bytes as well as count: a source is whatever the admin uploaded,
// and a handful of 5 MB originals must not sit in memory for the life of the
// instance.
const MAX_SOURCES = 24
const MAX_SOURCE_BYTES = 16 * 1024 * 1024
const sources = new Map<string, Buffer>()

function rememberSource(key: string, bytes: Buffer) {
  remember(sources, key, bytes, MAX_SOURCES)
  let total = 0
  for (const b of sources.values()) total += b.length
  while (total > MAX_SOURCE_BYTES && sources.size > 1) {
    const oldest = sources.keys().next().value
    if (oldest === undefined) break
    total -= sources.get(oldest)?.length ?? 0
    sources.delete(oldest)
  }
}
// Drawings expire so one that had to fall back to a lesser source (the first
// choice was unreadable for a moment) does not stand in for the real one for
// the life of the instance.
const DRAWING_TTL_MS = 10 * 60 * 1000
const drawings = new Map<string, Drawn & { at: number }>()
const lastServed = new Map<string, Drawn>()

function remember<V>(map: Map<string, V>, key: string, value: V, max: number) {
  map.delete(key)
  map.set(key, value)
  while (map.size > max) {
    const oldest = map.keys().next().value
    if (oldest === undefined) break
    map.delete(oldest)
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

// Straight from storage (the provider's own API where it has one), not over the
// public internet through the media host and its CDN.
async function loadSource(icon: IconMedia): Promise<Buffer> {
  const key = `${icon.id}:${icon.url}`
  const hit = sources.get(key)
  if (hit) return hit
  const bytes = await withTimeout(downloadMedia(icon.provider, icon.key, icon.url), SOURCE_TIMEOUT_MS)
  if (bytes.length === 0) throw new Error('empty file')
  rememberSource(key, bytes)
  return bytes
}

// A PNG of `size` from the first slot in `chain` that has an icon AND can be
// read and decoded. A broken file in one slot falls through to the next rather
// than failing the address.
async function drawPng(
  chain: IconSlot[],
  size: number,
  b: ResolvedBranding,
  background?: string,
): Promise<{ png: Buffer; degraded: boolean } | null> {
  let first = true
  for (const slot of chain) {
    const icon = b.icons[slot]
    if (!icon) continue
    try {
      return { png: await ensurePng(await loadSource(icon), size, background), degraded: !first }
    } catch {
      first = false
      continue
    }
  }
  return null
}

async function draw(variant: IconVariant, b: ResolvedBranding): Promise<Drawing | null> {
  let bytes: Buffer | null = null
  let type = 'image/png'
  let degraded = false

  if (variant.format === 'svg') {
    const slot = pickSlot(variant, b.icons)
    const icon = slot ? b.icons[slot] : null
    if (!icon) return null
    const svg = await loadSource(icon)
    if (!looksLikeSvg(svg)) return null
    bytes = svg
    type = 'image/svg+xml'
  } else if (variant.format === 'ico') {
    const dark = variant.name === 'favicon-dark'
    const pngs: Buffer[] = []
    for (const entry of ICO_ENTRIES) {
      const drawnEntry = await drawPng(ICON_VARIANTS[dark ? entry.dark : entry.light].chain, entry.size, b)
      if (drawnEntry) pngs.push(drawnEntry.png)
      if (!drawnEntry || drawnEntry.degraded) degraded = true
    }
    bytes = composeIco(pngs)
    type = 'image/x-icon'
  } else {
    const drawnPng = await drawPng(variant.chain, variant.size ?? 32, b, variant.opaque ? b.backgroundColor : undefined)
    bytes = drawnPng?.png ?? null
    degraded = !!drawnPng?.degraded
  }

  if (!bytes) return null
  return { drawn: { bytes, type, etag: `"${createHash('sha1').update(bytes).digest('hex')}"` }, degraded }
}

function respond(request: Request, drawn: Drawn, cacheControl: string): NextResponse {
  const headers = new Headers()
  headers.set('ETag', drawn.etag)
  headers.set('Cache-Control', cacheControl)
  headers.set('X-Content-Type-Options', 'nosniff')
  if (drawn.type === 'image/svg+xml') headers.set('Content-Security-Policy', SVG_CSP)
  if (request.headers.get('if-none-match') === drawn.etag) {
    return new NextResponse(null, { status: 304, headers })
  }
  headers.set('Content-Type', drawn.type)
  headers.set('Content-Length', String(drawn.bytes.length))
  return new NextResponse(new Uint8Array(drawn.bytes), { status: 200, headers })
}

function redirect(request: Request, target: string, cacheControl: string): NextResponse {
  const res = NextResponse.redirect(publicUrl(request, target), 307)
  res.headers.set('Cache-Control', cacheControl)
  return res
}

// Nothing fresh and nothing remembered. A 503 nobody stores: the browser keeps
// whatever icon it already had for the page (or shows its own blank one for a
// moment) and asks again next time. Anything is better than teaching it Cactus.
function unavailable(): NextResponse {
  return new NextResponse(null, {
    status: 503,
    headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' },
  })
}

export async function GET(request: Request, { params }: { params: Promise<{ variant?: string[] }> }) {
  const { variant: segments } = await params
  const url = new URL(request.url)
  const variant = variantForRequest(url.pathname, url.searchParams, segments)

  const b = await resolveBranding()

  const fallbackFromMemory = () => {
    const remembered = lastServed.get(variant.name)
    return remembered ? respond(request, remembered, TRANSIENT_CACHE_CONTROL) : unavailable()
  }

  if (b.state === 'unavailable') return fallbackFromMemory()

  // A read that worked and found no icons: the one case Cactus is right. Only
  // briefly when that verdict is a remembered one rather than this request's.
  const branded = Object.values(b.icons).some(Boolean)
  if (!branded) return redirect(request, variant.fallback, b.state === 'live' ? CACHE_CONTROL : TRANSIENT_CACHE_CONTROL)

  const memoKey = `${variant.name}:${b.iconVersion}:${b.backgroundColor}`
  const memo = drawings.get(memoKey)
  let drawn: Drawn | null = memo && Date.now() - memo.at < DRAWING_TTL_MS ? memo : null
  let degraded = false
  if (!drawn) {
    let drawing: Drawing | null = null
    try {
      drawing = await draw(variant, b)
    } catch {
      drawing = null
    }
    drawn = drawing?.drawn ?? null
    degraded = !!drawing?.degraded
    if (drawn && !degraded) remember(drawings, memoKey, { ...drawn, at: Date.now() }, 64)
  }

  if (!drawn) {
    // An svg address on a site whose icon is not an SVG (an old page, a probing
    // crawler): send it to the raster the site does have, never to Cactus.
    if (variant.format === 'svg') return redirect(request, '/favicon-96x96.png', TRANSIENT_CACHE_CONTROL)
    return fallbackFromMemory()
  }

  if (!degraded || !lastServed.has(variant.name)) lastServed.set(variant.name, drawn)

  const versioned = !!b.iconVersion && url.searchParams.get('v') === b.iconVersion
  const cacheControl =
    b.state === 'remembered' || degraded ? TRANSIENT_CACHE_CONTROL : versioned ? IMMUTABLE_CACHE_CONTROL : CACHE_CONTROL
  return respond(request, drawn, cacheControl)
}
