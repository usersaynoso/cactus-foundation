// Asks this same server for a page, as an anonymous visitor, and captures the answer.
//
// The proxy never sees a rendered response: it says "carry on" and the render happens
// behind it. So to keep a copy it has to ask for one, over localhost, and the request
// that comes back through the proxy is told apart by a secret made fresh in this
// process.
//
// That detour is also the store's main safety property. The request carries NO cookie
// and none of the visitor's headers, so what comes back cannot contain anything about
// any visitor, whatever a module's blocks read. Personal content cannot leak into a
// stored page, because no render of one ever had any to leak.
//
// node:http rather than fetch: fetch drops the Host header, and the page's absolute
// addresses and the proxy's own gates both depend on it.

import http from 'node:http'
import { gunzip, gzip } from 'node:zlib'
import { promisify } from 'node:util'
import { dbInfraErrorCount } from '@/lib/db/infra-errors'
import { INTERNAL_RENDER_HEADER_NAME } from './header'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

const RENDER_TIMEOUT_MS = 45_000
// A page this large is a page something has gone wrong with.
const MAX_RAW_BYTES = 32 * 1024 * 1024
// Holding several of these would be most of the budget.
const MAX_STORED_BYTES = 4 * 1024 * 1024

// Statuses that are a settled answer about an address. A 500 or a 503 is not, and a
// 302 or 307 says "for now", so those are passed on to whoever asked and never held.
const STORABLE_STATUSES = new Set([200, 301, 308, 404, 410])

// Written fresh on every answer, or belongs to the render's own hop.
const DROPPED_HEADERS = new Set([
  'set-cookie',
  'date',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-length',
  'content-encoding',
  'cache-control',
  'cdn-cache-control',
  'vercel-cdn-cache-control',
  'netlify-cdn-cache-control',
  'content-security-policy',
  'strict-transport-security',
  'x-frame-options',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
])

const agent = new http.Agent({ keepAlive: true, maxSockets: 32 })

export type RenderTarget = { port: number; secret: string; host: string; path: string; query: string }

export type RenderedPage = {
  status: number
  headers: Array<[string, string]>
  body: Buffer
  gzipped: boolean
  // Why this answer may not be held. Null means it may.
  unstorable: string | null
  // Set-Cookie on the answer. It is passed to nobody but the one who asked.
  setsCookie: boolean
}

export class RenderUnavailableError extends Error {}
export class RenderTimeoutError extends Error {}

function fetchRaw(target: RenderTarget): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: 'localhost',
        port: target.port,
        agent,
        method: 'GET',
        path: `${target.path}${target.query}`,
        timeout: RENDER_TIMEOUT_MS,
        headers: {
          host: target.host,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-encoding': 'identity',
          'user-agent': 'CactusPageStore',
          'x-forwarded-proto': 'https',
          [INTERNAL_RENDER_HEADER_NAME]: target.secret,
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_RAW_BYTES) {
            req.destroy(new RenderUnavailableError('page too large to hold'))
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 500, headers: res.headers, body: Buffer.concat(chunks) }))
        res.on('error', reject)
      },
    )
    req.on('timeout', () => req.destroy(new RenderTimeoutError('render timed out')))
    req.on('error', (err) => {
      if (err instanceof RenderTimeoutError) reject(err)
      else reject(new RenderUnavailableError(err.message))
    })
    req.end()
  })
}

function keptHeaders(headers: http.IncomingHttpHeaders): Array<[string, string]> {
  const kept: Array<[string, string]> = []
  for (const [rawName, value] of Object.entries(headers)) {
    const name = rawName.toLowerCase()
    if (value === undefined) continue
    if (DROPPED_HEADERS.has(name) || name.startsWith('x-middleware-') || name.startsWith('x-nextjs-') || name.startsWith('x-cactus-')) continue
    kept.push([name, Array.isArray(value) ? value.join(', ') : value])
  }
  return kept
}

// Next streams a page, so a block that throws partway leaves a 200 with its error
// marker inside. Anything but the two digests that mean "this part draws in the
// browser" is a page that came out wrong.
const ERROR_MARKER = /data-dgst="(?!BAILOUT_TO_CLIENT_SIDE_RENDERING")[^"]*"/

/** Why this rendered answer must not be kept, or null when it may be. Exported for tests. */
export function whyUnstorable(input: {
  status: number
  headers: http.IncomingHttpHeaders
  html: Buffer
  dbErrorsDuringRender: number
}): string | null {
  const { status, headers, html } = input
  if (!STORABLE_STATUSES.has(status)) return `status ${status}`
  if (headers['set-cookie']) return 'sets a cookie'
  // The inner proxy decided this response may not be shared. Only that verdict counts.
  const cacheControl = String(headers['cache-control'] ?? '')
  if (status === 200 && !cacheControl.startsWith('public')) return 'not marked shareable'
  // The layouts swallow a failed read and carry on, by design, so a database blip
  // makes a perfectly plausible page with no header or no prices. Fine for the one
  // visitor it was built for; not for an hour of them.
  if (input.dbErrorsDuringRender > 0) return 'database trouble during the render'
  if (status === 200 && String(headers['content-type'] ?? '').includes('text/html')) {
    const tail = html.subarray(Math.max(0, html.length - 4096)).toString('latin1')
    if (!tail.includes('</html>')) return 'page was cut short'
    if (html.includes('data-dgst="') && ERROR_MARKER.test(html.toString('latin1'))) return 'a part of the page failed'
  }
  return null
}

/** Renders one address. Throws RenderUnavailableError or RenderTimeoutError. */
export async function renderPage(target: RenderTarget): Promise<RenderedPage> {
  const dbErrorsBefore = dbInfraErrorCount()
  const raw = await fetchRaw(target)
  const unstorable = whyUnstorable({
    status: raw.status,
    headers: raw.headers,
    html: raw.body,
    dbErrorsDuringRender: dbInfraErrorCount() - dbErrorsBefore,
  })
  const compressed = raw.body.length > 1024
  const body = compressed ? await gzipAsync(raw.body) : raw.body
  return {
    status: raw.status,
    headers: keptHeaders(raw.headers),
    body,
    gzipped: compressed,
    unstorable: unstorable ?? (body.length > MAX_STORED_BYTES ? 'too large to hold' : null),
    setsCookie: !!raw.headers['set-cookie'],
  }
}

export function unzipForClient(body: Buffer): Promise<Buffer> {
  return gunzipAsync(body)
}
