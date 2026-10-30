// `cactus-host site create`: a whole new site in one go - its database, its
// Cloudflare record and certificate, and everything `site add` does - so the first
// build has its database from the start and the setup wizard has nothing to paste.
//
// Order matters. Everything that can be checked without touching anything is checked
// first. Then the database, then Cloudflare, then the site itself. If a later step
// fails, the error says which earlier ones already happened, so nothing is left
// half-made without anybody knowing.

import { isValidHostname } from './caddy.ts'
import { Cloudflare, manualCloudflareSteps } from './cloudflare.ts'
import { Databases, dbNameForSite } from './db.ts'
import type { Host } from './host.ts'
import type { AdminSiteSummary, CreateSiteRequest, CreateSiteResponse } from './protocol.ts'
import { addSite } from './provision.ts'
import { SITE_ID_PATTERN, toSummary, type SiteRecord } from './store.ts'

export function adminSummary(host: Host, site: SiteRecord): AdminSiteSummary {
  const latest = host.store.listBuilds(site.id)[0] ?? null
  return {
    ...host.summary(site),
    ports: site.ports,
    liveSlot: site.liveSlot,
    latestBuild: latest ? toSummary(latest) : null,
  }
}

export async function createSite(host: Host, input: CreateSiteRequest): Promise<CreateSiteResponse> {
  const domains = input.domains.map((d) => d.trim().toLowerCase()).filter(Boolean)
  if (!SITE_ID_PATTERN.test(input.id)) {
    throw new Error('A site name is 3 to 24 lower-case letters, digits and hyphens, starting with a letter')
  }
  if (domains.length === 0) throw new Error('A new site needs at least one domain')
  for (const d of domains) if (!isValidHostname(d)) throw new Error(`"${d}" is not a valid domain name`)
  if (host.store.getSite(input.id)) throw new Error(`There is already a site called ${input.id} on this server`)
  for (const d of domains) {
    if (host.store.listSites().some((s) => s.domains.includes(d))) throw new Error(`${d} already belongs to another site on this server`)
  }

  const done: string[] = []
  const step = async <T>(what: string, work: () => Promise<T>): Promise<T> => {
    try {
      return await work()
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err)
      const before = done.length ? ` Already done: ${done.join('; ')}.` : ''
      throw new Error(`${what} failed: ${why}.${before}`)
    }
  }

  const cloudflare = Cloudflare.fromConfig(host.config, host.system)
  const dbName = dbNameForSite(input.id)
  const databases = new Databases(host.config, host.system)
  const { connectionString } = await step('Creating the database', () => databases.create(dbName, { backup: input.backup ?? null }))
  done.push(`database ${dbName}${input.backup ? `, backed up to ${input.backup}` : ''}`)

  let tls: { cert: string; key: string } | null = null
  const cloudflareDone: string[] = []
  if (cloudflare) {
    const zone = await step('Finding the Cloudflare zone', () => cloudflare.findZone(domains[0] as string))
    for (const d of domains) {
      const other = await step(`Finding the Cloudflare zone for ${d}`, () => cloudflare.findZone(d))
      if (other.id !== zone.id) throw new Error(`${d} is in a different Cloudflare zone from ${domains[0]}; one zone per site. Already done: ${done.join('; ')}.`)
    }
    for (const d of domains) {
      const note = await step(`The DNS record for ${d}`, () => cloudflare.ensureARecord(zone.id, d))
      cloudflareDone.push(note)
      done.push(note)
    }
    const strict = await step('Setting Full (strict)', () => cloudflare.ensureStrict(zone.id, zone.name))
    cloudflareDone.push(strict)
    done.push(strict)
    const cert = await step('The origin certificate', () => cloudflare.ensureOriginCertificate(zone.name))
    cloudflareDone.push(cert.note)
    done.push(cert.note)
    tls = { cert: cert.cert, key: cert.key }
  }

  const { site: added, deployKeyPublic } = await step('Adding the site', () =>
    addSite(host, { id: input.id, repo: input.repo, branch: input.branch, name: input.name, domains })
  )

  // The database before the first build: a build with none fails, and the schema
  // insists on DIRECT_URL as well as DATABASE_URL.
  const env = host.readSiteEnv(added)
  env.set('DATABASE_URL', connectionString)
  env.set('DIRECT_URL', connectionString)
  env.set('SITE_URL', `https://${domains[0]}`)
  host.writeSiteEnv(added, env)
  let site: SiteRecord = {
    ...added,
    secretKeys: [...new Set([...added.secretKeys, 'DATABASE_URL', 'DIRECT_URL'])].sort(),
    ...(tls ? { tls } : {}),
  }
  host.store.saveSite(site)
  if (tls) await host.writeRouting(site)
  site = host.site(site.id)

  return {
    site: adminSummary(host, site),
    database: dbName,
    deployKeyPublic,
    cloudflare: { done: cloudflareDone, manual: cloudflare ? [] : manualCloudflareSteps(host.config, domains) },
  }
}
