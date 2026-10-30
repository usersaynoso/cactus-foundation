// cactus-host's HTTP API (protocol.ts describes the shapes). Localhost only by
// default; every route but /v1/health needs the site's own token, and a token that
// does not belong to the site named in the path gets the same 404 as a site that
// does not exist, so one site cannot even learn which others share its server.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { Host, HostError } from './host.ts'
import { PROTOCOL_VERSION, type EnvWrite, type ErrorBody } from './protocol.ts'
import type { SiteRecord } from './store.ts'
import { bearerToken, tokenMatches } from './tokens.ts'

const MAX_BODY = 1024 * 1024

type Json = Record<string, unknown>

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(text)
}

async function readBody(req: IncomingMessage): Promise<Json> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY) throw new HostError('Request body too large', 413)
    chunks.push(chunk as Buffer)
  }
  if (size === 0) return {}
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object')
    return parsed as Json
  } catch {
    throw new HostError('The request body must be a JSON object', 400)
  }
}

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    throw new HostError(`"${field}" must be a list of names`, 400)
  }
  return value as string[]
}

function envWrites(value: unknown): EnvWrite[] {
  if (!Array.isArray(value)) throw new HostError('"vars" must be a list', 400)
  return value.map((v) => {
    const item = v as Partial<EnvWrite>
    if (typeof item?.key !== 'string' || typeof item.value !== 'string') {
      throw new HostError('Each entry in "vars" needs a key and a text value', 400)
    }
    return { key: item.key, value: item.value, secret: item.secret === true }
  })
}

/** The site the token belongs to, or null. */
function authenticate(host: Host, req: IncomingMessage): SiteRecord | null {
  const token = bearerToken(req.headers.authorization)
  if (!token) return null
  return host.store.listSites().find((s) => tokenMatches(token, s.tokenHash)) ?? null
}

export async function handle(host: Host, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://cactus-host.local')
  const method = req.method ?? 'GET'
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)

  if (parts[0] !== 'v1') return send(res, 404, { error: 'Not found' } satisfies ErrorBody)
  if (parts[1] === 'health' && parts.length === 2) return send(res, 200, { ok: true, protocol: PROTOCOL_VERSION })

  const site = authenticate(host, req)
  if (!site) return send(res, 401, { error: 'A valid token for this site is required' } satisfies ErrorBody)

  if (parts[1] === 'sites' && parts.length === 2 && method === 'GET') {
    return send(res, 200, { sites: [host.summary(site)] })
  }
  if (parts[1] !== 'sites' || parts[2] !== site.id) return send(res, 404, { error: 'Not found' } satisfies ErrorBody)
  const id = site.id
  const rest = parts.slice(3)
  const route = `${method} /${rest.map((p, i) => (i === 1 && (rest[0] === 'builds' || rest[0] === 'domains') ? ':id' : p)).join('/')}`

  switch (route) {
    case 'GET /':
      return send(res, 200, { site: host.summary(host.site(id)) })

    case 'GET /env':
      return send(res, 200, { keys: host.listEnvKeys(id) })
    case 'POST /env/values': {
      const body = await readBody(req)
      return send(res, 200, { values: host.readEnvValues(id, stringList(body.keys, 'keys')) })
    }
    case 'PUT /env': {
      const body = await readBody(req)
      host.writeEnv(id, envWrites(body.vars))
      return send(res, 200, { ok: true })
    }
    case 'DELETE /env': {
      const body = await readBody(req)
      return send(res, 200, host.deleteEnv(id, stringList(body.keys, 'keys')))
    }

    case 'GET /builds': {
      const limit = Number(url.searchParams.get('limit') ?? 5)
      return send(res, 200, { builds: host.listBuilds(id, Number.isFinite(limit) ? limit : 5) })
    }
    case 'POST /builds': {
      const body = await readBody(req)
      if (body.sha !== undefined && typeof body.sha !== 'string') throw new HostError('sha must be text', 400)
      const trigger = body.trigger === 'cli' ? 'cli' : 'api'
      return send(res, 202, host.startBuild(id, { sha: body.sha as string | undefined, trigger }))
    }
    case 'GET /builds/:id':
      return send(res, 200, { build: host.getBuild(id, rest[1] as string) })
    case 'GET /builds/:id/log': {
      const since = Number(url.searchParams.get('since') ?? 0)
      return send(res, 200, host.readLog(id, rest[1] as string, Number.isFinite(since) && since > 0 ? Math.floor(since) : 0))
    }

    case 'POST /rollback': {
      const body = await readBody(req)
      if (body.buildId !== undefined && typeof body.buildId !== 'string') throw new HostError('buildId must be text', 400)
      return send(res, 200, { build: await host.rollback(id, body.buildId as string | undefined) })
    }

    case 'POST /domains': {
      const body = await readBody(req)
      if (typeof body.name !== 'string') throw new HostError('name is required', 400)
      return send(res, 200, { domain: await host.addDomain(id, body.name) })
    }
    case 'GET /domains/:id':
      return send(res, 200, { domain: await host.domainStatus(id, rest[1] as string) })

    default:
      return send(res, 404, { error: 'Not found' } satisfies ErrorBody)
  }
}

export function createApiServer(host: Host): Server {
  return createServer((req, res) => {
    handle(host, req, res).catch((err: unknown) => {
      const status = err instanceof HostError ? err.status : 500
      const message = err instanceof Error ? err.message : 'Unknown error'
      if (status >= 500) console.error(`[cactus-host] ${req.method} ${req.url}: ${message}`)
      if (!res.headersSent) send(res, status, { error: message } satisfies ErrorBody)
      else res.end()
    })
  })
}
