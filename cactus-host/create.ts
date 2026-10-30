// `cactus-host site create`: a whole new site in one go - its database, its
// Cloudflare record and certificate, and everything `site add` does - so the first
// build has its database from the start and the setup wizard has nothing to paste.
//
// Order matters. Everything that can be checked without touching anything is checked
// first. Then the database, then Cloudflare, then the site itself. If a later step
// fails, the error says which earlier ones already happened, so nothing is left
// half-made without anybody knowing.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { isValidHostname } from './caddy.ts'
import { domainCertificate, issueCertificate } from './certificates.ts'
import { Cloudflare, manualCloudflareSteps } from './cloudflare.ts'
import { Databases, dbNameForSite } from './db.ts'
import type { Host } from './host.ts'
import type { AdminSiteSummary, CertificateSummary, CreateSiteRequest, CreateSiteResponse } from './protocol.ts'
import { addSite } from './provision.ts'
import { SITE_ID_PATTERN, toSummary, type SiteRecord } from './store.ts'

/** The database a site uses on this box: the one its DATABASE_URL names, or null. */
export function siteDatabase(host: Host, site: SiteRecord): string | null {
  return host.siteDatabase(site)
}

export function adminSummary(host: Host, site: SiteRecord): AdminSiteSummary {
  const builds = host.store.listBuilds(site.id)
  const latest = builds[0] ?? null
  const live = builds.find((b) => b.live) ?? null
  const database = siteDatabase(host, site)
  return {
    ...host.summary(site),
    ports: site.ports,
    liveSlot: site.liveSlot,
    latestBuild: latest ? toSummary(latest) : null,
    liveSince: live?.finishedAt ?? null,
    database,
    backup: database ? new Databases(host.config, host.system).destinationOrNull(database) : null,
    createdAt: site.createdAt,
  }
}

/**
 * After a domain is attached: when this box can get certificates by itself, make sure
 * the domain has one that names it. A failure here never undoes the domain; it is
 * reported as a step still to do.
 */
async function autoCertificate(host: Host, siteId: string, domain: string, done: string[], manual: string[]): Promise<CertificateSummary> {
  if (host.config.cloudflare || host.config.letsEncrypt) {
    try {
      const issued = await issueCertificate(host, siteId, domain)
      if (issued.method !== 'existing') done.push(...issued.notes)
      return issued.certificate
    } catch (err) {
      manual.push(`A certificate for ${domain}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return domainCertificate(host, host.site(siteId), domain)
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

  // Without a Cloudflare token the steps are listed for doing by hand, except the
  // certificate when Let's Encrypt can get one for each domain here and now.
  const manual = cloudflare ? [] : manualCloudflareSteps(host.config, domains)
  if (!cloudflare && host.config.letsEncrypt) {
    manual.pop()
    for (const d of domains) await autoCertificate(host, site.id, d, cloudflareDone, manual)
  }
  site = host.site(site.id)

  return {
    site: adminSummary(host, site),
    database: dbName,
    deployKeyPublic,
    cloudflare: { done: cloudflareDone, manual },
  }
}

export type AddDomainResult = {
  domain: { name: string; serving: boolean }
  site: AdminSiteSummary
  cloudflare: { done: string[]; manual: string[] }
  certificate: CertificateSummary
}

/**
 * The origin certificate in tlsDir for the zone a hostname sits in: the longest parent
 * name with both halves there (example.co.uk.pem for www.example.co.uk), or null.
 */
export function zoneCertificate(tlsDir: string, hostname: string): { cert: string; key: string } | null {
  const labels = hostname.split('.')
  for (let i = 0; i < labels.length - 1; i++) {
    const zone = labels.slice(i).join('.')
    const pair = { cert: join(tlsDir, `${zone}.pem`), key: join(tlsDir, `${zone}.key`) }
    if (existsSync(pair.cert) && existsSync(pair.key)) return pair
  }
  return null
}

/**
 * Attaches a domain to an existing site, with its Cloudflare record when this box has
 * a token. A domain in another zone from the site's certificate gets that zone's own
 * origin certificate: reused from tlsDir, or made through Cloudflare when it can be.
 */
export async function addSiteDomain(host: Host, siteId: string, name: string, primary: boolean): Promise<AddDomainResult> {
  const site = host.site(siteId)
  const domain = host.checkedDomain(siteId, name)
  const done: string[] = []
  const manual: string[] = []
  const cloudflare = Cloudflare.fromConfig(host.config, host.system)
  let cert = zoneCertificate(host.config.tlsDir, domain)
  if (cloudflare) {
    const zone = await cloudflare.findZone(domain)
    done.push(await cloudflare.ensureARecord(zone.id, domain))
    done.push(await cloudflare.ensureStrict(zone.id, zone.name))
    const made = await cloudflare.ensureOriginCertificate(zone.name)
    done.push(made.note)
    cert = { cert: made.cert, key: made.key }
  } else {
    manual.push(...manualCloudflareSteps(host.config, [domain]).slice(0, 2))
    if (!cert && !host.config.letsEncrypt) manual.push(`An origin certificate for ${domain}'s zone, saved as ${host.config.tlsDir}/<zone>.pem and .key (root:caddy, 0640), then add the domain again.`)
  }
  const siteCert = site.tls ?? host.config.tls
  const own = cert && (cert.cert !== siteCert?.cert || cert.key !== siteCert?.key) ? cert : null
  await host.addDomain(siteId, domain, { primary, tls: own })
  const certificate = await autoCertificate(host, siteId, domain, done, manual)
  return {
    domain: await host.domainStatus(siteId, domain),
    site: adminSummary(host, host.site(siteId)),
    cloudflare: { done, manual },
    certificate,
  }
}
