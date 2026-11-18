import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import { request as httpRequest, type IncomingMessage } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { BlockList, isIP } from 'node:net'

// Fetching an address someone else chose, without letting them aim the server at
// its own network (SSRF).
//
// The usual check - resolve the host, refuse private addresses, then fetch - has
// a gap: fetch resolves the name AGAIN, and a hostile DNS server can answer
// "public" to the check and "127.0.0.1" to the fetch (DNS rebinding). So this
// does not check-then-fetch. It hands node's http client a lookup function that
// refuses private answers, which means the address that is checked is the
// address that is connected to, on every hop, redirects included.
//
// Use it for any server-side request whose URL came from a person or another
// system: a link preview, a "fetch this feed" field, a webhook target, an image
// by URL. Do NOT use it for the site's own infrastructure (its storage bucket,
// a worker on localhost, a provider's API) - those are meant to be reachable and
// some of them are deliberately private.

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeUrlError'
  }
}

// Everything that is not the public internet. IPv4 first, then IPv6, including
// the forms that smuggle an IPv4 address inside an IPv6 one.
const BLOCKED = new BlockList()
for (const [net, prefix] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. cloud metadata 169.254.169.254
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, incl. 255.255.255.255
] as const) {
  BLOCKED.addSubnet(net, prefix, 'ipv4')
}
for (const [net, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['64:ff9b::', 96], // NAT64 - wraps an IPv4 address
  ['64:ff9b:1::', 48], // local-use NAT64
  ['100::', 64], // discard
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4 - wraps an IPv4 address
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  BLOCKED.addSubnet(net, prefix, 'ipv6')
}

/** The IPv4 address hidden in an IPv4-mapped IPv6 address (::ffff:a.b.c.d or
 *  ::ffff:7f00:1), or null when there is none. */
function embeddedIpv4(address: string): string | null {
  const lower = address.toLowerCase()
  const dotted = lower.match(/^(?:0{0,4}:){0,5}:?ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (dotted?.[1]) return dotted[1]
  const hex = lower.match(/^(?:0{0,4}:){0,5}:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (hex?.[1] && hex[2]) {
    const hi = parseInt(hex[1], 16)
    const lo = parseInt(hex[2], 16)
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`
  }
  return null
}

/** True for any address that is not routable on the public internet, and for
 *  anything that is not an IP address at all. */
export function isPrivateAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, '')
  const kind = isIP(bare)
  if (kind === 4) return BLOCKED.check(bare, 'ipv4')
  if (kind === 6) {
    const v4 = embeddedIpv4(bare)
    if (v4) return isPrivateAddress(v4)
    return BLOCKED.check(bare, 'ipv6')
  }
  return true
}

const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa']

/** Parses and checks the shape of a URL - scheme, credentials, obviously local
 *  names, literal private addresses. The DNS half of the check happens at
 *  connect time, inside safeFetch. */
export function parsePublicUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new UnsafeUrlError('That does not look like a web address.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Only http and https addresses can be used.')
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError('Addresses with a username or password in them cannot be used.')
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '')
  if (!host || host === 'localhost' || LOCAL_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UnsafeUrlError('That address is not on the public internet.')
  }
  if (isIP(host) && isPrivateAddress(host)) {
    throw new UnsafeUrlError('That address is not on the public internet.')
  }
  return url
}

// node's lookup has two calling shapes (one address, or all of them), and the
// http client uses whichever it likes. Both are answered, and both refuse the
// whole answer if any address in it is private - a name that resolves to one
// public and one private address is a name somebody is playing with.
type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void

function guardedLookup(hostname: string, options: { all?: boolean } | number | undefined, callback: LookupCallback): void {
  const opts = typeof options === 'object' && options ? options : {}
  dnsLookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err, '')
    if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
      return callback(Object.assign(new UnsafeUrlError('That address is not on the public internet.'), { code: 'EUNSAFEADDR' }), '')
    }
    if (opts.all) return callback(null, addresses)
    const first = addresses[0]!
    return callback(null, first.address, first.family)
  })
}

export type SafeFetchOptions = {
  method?: 'GET' | 'HEAD' | 'POST'
  headers?: Record<string, string>
  body?: string | Buffer
  /** Largest body that will be read. Default 5 MB. */
  maxBytes?: number
  /** Whole-request time limit across every hop. Default 10 s. */
  timeoutMs?: number
  /** Redirects followed, each one re-checked. Default 4; 0 refuses them. */
  maxRedirects?: number
}

export type SafeFetchResult = {
  status: number
  headers: Record<string, string>
  body: Buffer
  /** The address the answer actually came from, after redirects. */
  finalUrl: string
}

function oneHop(url: URL, opts: Required<Omit<SafeFetchOptions, 'body'>> & { body?: string | Buffer }, signal: AbortSignal): Promise<{ res: IncomingMessage; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest
    const req = send(
      url,
      {
        method: opts.method,
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; Cactus/1.0)', ...opts.headers },
        lookup: guardedLookup as never, // node's typing wants its own overloads; the shapes match at runtime
        signal,
      },
      (res) => {
        const chunks: Buffer[] = []
        let total = 0
        res.on('data', (chunk: Buffer) => {
          total += chunk.length
          if (total > opts.maxBytes) {
            req.destroy(new UnsafeUrlError('That file is too large.'))
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => resolve({ res, body: Buffer.concat(chunks) }))
        res.on('error', reject)
      },
    )
    req.on('error', reject)
    if (opts.body !== undefined) req.write(opts.body)
    req.end()
  })
}

/**
 * Fetch a URL someone else chose. Refuses anything that is not http(s) on the
 * public internet, checked at connect time on every hop. Throws UnsafeUrlError
 * for a refused address or an oversized body; network failures throw as usual.
 * Non-2xx answers are returned, not thrown - the caller decides what they mean.
 */
export async function safeFetch(raw: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const opts = {
    method: options.method ?? 'GET',
    headers: options.headers ?? {},
    body: options.body,
    maxBytes: options.maxBytes ?? 5 * 1024 * 1024,
    timeoutMs: options.timeoutMs ?? 10_000,
    maxRedirects: options.maxRedirects ?? 4,
  }
  const signal = AbortSignal.timeout(opts.timeoutMs)
  let url = parsePublicUrl(raw)
  for (let hop = 0; ; hop += 1) {
    const { res, body } = await oneHop(url, opts, signal)
    const status = res.statusCode ?? 0
    const location = res.headers.location
    if (status >= 300 && status < 400 && location) {
      if (hop >= opts.maxRedirects) throw new UnsafeUrlError('That address redirected too many times.')
      url = parsePublicUrl(new URL(location, url).toString())
      // A redirect turns a POST into a GET (303, and in practice 301/302); only
      // 307/308 promise to repeat the request as it was.
      if (status !== 307 && status !== 308) {
        opts.method = opts.method === 'HEAD' ? 'HEAD' : 'GET'
        opts.body = undefined
      }
      continue
    }
    const headers: Record<string, string> = {}
    for (const [name, value] of Object.entries(res.headers)) {
      if (value !== undefined) headers[name] = Array.isArray(value) ? value.join(', ') : value
    }
    return { status, headers, body, finalUrl: url.toString() }
  }
}
