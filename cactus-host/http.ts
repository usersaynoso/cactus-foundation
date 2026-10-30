// cactus-host's HTTP API (protocol.ts describes the shapes). Localhost only by
// default; every route but /v1/health needs the site's own token, and a token that
// does not belong to the site named in the path gets the same 404 as a site that
// does not exist, so one site cannot even learn which others share its server.
//
// /v1/admin/... is the one exception: it answers only the server's admin token
// (admin.ts), sees every site and database, and records every change it makes in
// the audit log. A site token gets 401 there, and the admin token gets 401 on a
// site's own routes, so neither kind of token is ever more than it says.

import { existsSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { isAdminToken } from './admin.ts'
import { audited, readAudit } from './audit.ts'
import { issueCertificate, siteCertificates } from './certificates.ts'
import { lastCronTick, readCronLog } from './cron-log.ts'
import { addSiteDomain, adminSummary, createSite, siteDatabase } from './create.ts'
import { Databases } from './db.ts'
import { Host, HostError } from './host.ts'
import { PROTOCOL_VERSION, type AdminBuildSummary, type AdminCronSite, type EditSiteResponse, type EnvWrite, type ErrorBody } from './protocol.ts'
import { renameSite } from './rename.ts'
import { siteCronJobs } from './scheduler.ts'
import { toSummary, type SiteRecord } from './store.ts'
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
  if (parts[1] === 'admin') return handleAdmin(host, req, res, url, method, parts.slice(2))

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
      return send(res, 200, { build: await host.rollback(id, body.buildId as string | undefined, { restoreDatabase: body.restoreDatabase === true }) })
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

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw new HostError(`"${field}" must be text`, 400)
  return value
}

/** An error from the work itself (a name taken, Cloudflare refusing) is the caller's to fix: 400, not 500. */
async function asBadRequest<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    if (err instanceof HostError) throw err
    throw new HostError(err instanceof Error ? err.message : String(err), 400)
  }
}

async function handleAdmin(
  host: Host,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  method: string,
  rest: string[]
): Promise<void> {
  const token = bearerToken(req.headers.authorization)
  if (!token || !isAdminToken(host.config, token)) {
    return send(res, 401, { error: 'The admin token is required' } satisfies ErrorBody)
  }
  const now = () => host.system.now()
  const record = <T>(action: string, target: string | null, work: () => Promise<T>) =>
    audited(host.config, now, 'admin-api', action, target, () => asBadRequest(work))
  const databases = new Databases(host.config, host.system)
  const route = `${method} /${rest.map((p, i) => (i === 1 && (rest[0] === 'sites' || rest[0] === 'databases') ? ':id' : i === 3 && rest[2] === 'builds' ? ':build' : i === 3 && rest[2] === 'domains' ? ':domain' : p)).join('/')}`
  const id = rest[1] as string

  switch (route) {
    case 'GET /sites':
      return send(res, 200, { sites: host.store.listSites().map((s) => adminSummary(host, s)) })
    case 'POST /sites': {
      const body = await readBody(req)
      if (typeof body.id !== 'string' || typeof body.repo !== 'string') throw new HostError('id and repo are required', 400)
      const input = {
        id: body.id,
        repo: body.repo,
        domains: stringList(body.domains, 'domains'),
        name: optionalText(body.name, 'name'),
        branch: optionalText(body.branch, 'branch'),
        backup: optionalText(body.backup, 'backup') ?? null,
      }
      return send(res, 201, await record('site.create', input.id, () => createSite(host, input)))
    }
    case 'GET /sites/:id':
      return send(res, 200, { site: adminSummary(host, host.site(id)) })
    case 'PATCH /sites/:id': {
      const body = await readBody(req)
      const changes = { name: optionalText(body.name, 'name'), branch: optionalText(body.branch, 'branch'), repo: optionalText(body.repo, 'repo') }
      // "backup" present means set it; null or "" clears it.
      const backup = 'backup' in body ? (optionalText(body.backup, 'backup') ?? null) : undefined
      const site = host.site(id)
      const database = backup !== undefined ? siteDatabase(host, site) : null
      if (backup !== undefined && !database) throw new HostError(`${id} has no database on this server to back up`, 400)
      const edited = await record('site.edit', id, async () => {
        const result = await host.editSite(id, changes)
        if (backup !== undefined) databases.setDestination(database as string, backup)
        return result
      })
      return send(res, 200, { site: adminSummary(host, host.site(id)), deployKeyPublic: edited.deployKeyPublic } satisfies EditSiteResponse)
    }
    case 'POST /sites/:id/rename': {
      const body = await readBody(req)
      if (typeof body.to !== 'string') throw new HostError('"to" is required: the new site name', 400)
      const to = body.to
      const renamed = await record('site.rename', `${id} ${to}`, () => renameSite(host, id, to))
      return send(res, 200, { site: adminSummary(host, renamed) })
    }
    case 'GET /sites/:id/deploy-key':
      host.site(id)
      return send(res, 200, { deployKeyPublic: host.deployKeyPublic(id) })
    case 'POST /sites/:id/rollback': {
      const body = await readBody(req)
      if (typeof body.buildId !== 'string') throw new HostError('buildId is required', 400)
      if (body.restoreDatabase !== undefined && typeof body.restoreDatabase !== 'boolean') throw new HostError('restoreDatabase must be true or false', 400)
      const buildId = body.buildId
      const restoreDatabase = body.restoreDatabase === true
      const build = await record(restoreDatabase ? 'site.rollback.database' : 'site.rollback', `${id} ${buildId}`, () =>
        host.rollback(id, buildId, { restoreDatabase })
      )
      return send(res, 200, { build, site: adminSummary(host, host.site(id)) })
    }
    // Read only, so not audited: nothing changes on the site or the server.
    case 'GET /sites/:id/update':
      return send(res, 200, { check: await asBadRequest(() => host.checkUpdate(id)) })
    case 'POST /sites/:id/update': {
      const update = await record('site.update', id, () => host.requestUpdate(id))
      return send(res, 200, { update, site: adminSummary(host, host.site(id)) })
    }
    case 'GET /sites/:id/certificates':
      return send(res, 200, { certificates: await siteCertificates(host, id) })
    case 'POST /sites/:id/domains/:domain/certificate': {
      const body = await readBody(req)
      const name = rest[3] as string
      const renew = body.renew === true
      return send(res, 200, await record(renew ? 'site.certificate.renew' : 'site.certificate', `${id} ${name}`, () => issueCertificate(host, id, name, { renew })))
    }
    case 'POST /sites/:id/refresh': {
      const site = host.site(id)
      await record('site.refresh', id, () => host.writeRouting(site))
      return send(res, 200, { site: adminSummary(host, host.site(id)) })
    }
    case 'POST /sites/:id/domains': {
      const body = await readBody(req)
      if (typeof body.name !== 'string') throw new HostError('name is required', 400)
      const name = body.name
      return send(res, 201, await record('site.domain.add', `${id} ${name}`, () => addSiteDomain(host, id, name, body.primary === true)))
    }
    case 'GET /sites/:id/domains/:domain':
      return send(res, 200, { domain: await host.domainStatus(id, rest[3] as string) })
    case 'PUT /sites/:id/domains/:domain': {
      const body = await readBody(req)
      if (body.primary !== true) throw new HostError('Only { "primary": true } can be set', 400)
      const name = rest[3] as string
      await record('site.domain.primary', `${id} ${name}`, () => host.setPrimaryDomain(id, name))
      return send(res, 200, { site: adminSummary(host, host.site(id)) })
    }
    case 'DELETE /sites/:id/domains/:domain': {
      const name = rest[3] as string
      await record('site.domain.remove', `${id} ${name}`, () => host.removeDomain(id, name))
      return send(res, 200, { site: adminSummary(host, host.site(id)) })
    }
    case 'GET /sites/:id/builds': {
      host.site(id)
      const limit = Number(url.searchParams.get('limit') ?? 10)
      const points = host.restorePoints(id)
      const builds: AdminBuildSummary[] = host.store
        .listBuilds(id)
        .slice(0, Math.max(1, Math.min(Number.isFinite(limit) ? limit : 10, 50)))
        .map((b) => {
          const point = points.get(b.id)
          return {
            ...toSummary(b),
            kept: b.state === 'ready' && Boolean(b.releaseDir && existsSync(b.releaseDir)),
            restorePoint: point ? { takenAt: point.takenAt, sizeBytes: point.sizeBytes } : null,
          }
        })
      return send(res, 200, { builds })
    }
    case 'POST /sites/:id/builds': {
      host.site(id)
      return send(res, 202, await record('site.build', id, async () => host.startBuild(id, { trigger: 'api' })))
    }
    case 'GET /sites/:id/builds/:build/log': {
      const since = Number(url.searchParams.get('since') ?? 0)
      return send(res, 200, host.readLog(id, rest[3] as string, Number.isFinite(since) && since > 0 ? Math.floor(since) : 0))
    }

    case 'GET /databases':
      return send(res, 200, { databases: await databases.list() })
    case 'POST /databases': {
      const body = await readBody(req)
      if (typeof body.name !== 'string') throw new HostError('name is required', 400)
      const name = body.name
      const backup = optionalText(body.backup, 'backup') ?? null
      return send(res, 201, await record('db.create', name, () => databases.create(name, { backup })))
    }
    case 'POST /databases/:id/backup':
      return send(res, 200, await record('db.backup', id, () => databases.backup(id)))
    case 'PUT /databases/:id/destination': {
      const body = await readBody(req)
      const backup = optionalText(body.backup, 'backup') ?? null
      await record('db.destination', id, async () => databases.setDestination(id, backup))
      return send(res, 200, { ok: true })
    }

    // Every site's scheduled jobs, each asked of the site itself, side by side. A site
    // that cannot be asked still appears, with the reason, so a quiet failure shows.
    case 'GET /cron': {
      const sites = await Promise.all(host.store.listSites().map(async (site): Promise<AdminCronSite> => {
        const lastTick = lastCronTick(host.config, site.id)
        try {
          const { tick, jobs } = await siteCronJobs(host, site)
          return { site: site.id, name: site.name, tick, jobs, error: null, lastTick }
        } catch (err) {
          return { site: site.id, name: site.name, tick: null, jobs: null, error: err instanceof Error ? err.message : String(err), lastTick }
        }
      }))
      return send(res, 200, { sites })
    }
    case 'GET /cron/log': {
      const known = host.store.listSites().map((s) => s.id)
      const site = url.searchParams.get('site')
      if (site && !known.includes(site)) throw new HostError(`No site called ${site}`, 404)
      const limit = Number(url.searchParams.get('limit') ?? 100)
      const before = Number(url.searchParams.get('before') ?? '')
      return send(res, 200, {
        entries: readCronLog(host.config, {
          sites: site ? [site] : known,
          limit: Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 1000) : 100,
          failedOnly: url.searchParams.get('failed') === '1',
          before: Number.isFinite(before) && before > 0 ? before : undefined,
        }),
      })
    }

    case 'GET /audit': {
      const limit = Number(url.searchParams.get('limit') ?? 50)
      return send(res, 200, { entries: readAudit(host.config, Number.isFinite(limit) ? Math.min(limit, 500) : 50) })
    }

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
