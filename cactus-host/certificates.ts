// Each domain's TLS certificate: which file Caddy serves it with, whether that file
// names the domain, when it runs out, and getting one for a domain that has none.
//
// Getting one tries, in order:
//   1. a certificate already in tlsDir that names the domain (a zone's origin
//      certificate covers the apex and one level of subdomain);
//   2. a Cloudflare origin certificate for the domain's zone, when cactus-host has its
//      scoped Cloudflare token (cloudflare.ts) - valid for 15 years, trusted by
//      Cloudflare's proxy only;
//   3. Let's Encrypt, through certbot's DNS-01 challenge with the box's own Cloudflare
//      credentials file, when config.letsEncrypt names it. cactus-host never reads that
//      file; certbot does. The certificate is publicly trusted, so it also works for a
//      domain that is not behind Cloudflare's proxy, and certbot.timer renews it: the
//      deploy hook (`cactus-host cert renewed`) copies each renewal to where Caddy
//      reads it and reloads Caddy.
//
// Let's Encrypt certificates are named cactus-<domain> in certbot, and copied to
// <tlsDir>/letsencrypt-<domain>.{pem,key}, root:caddy 0640, like the origin certificates.

import { X509Certificate } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { Cloudflare } from './cloudflare.ts'
import { zoneCertificate } from './create.ts'
import { HostError, type Host } from './host.ts'
import type { CertificateSummary, IssueCertificateResponse } from './protocol.ts'
import type { SiteRecord } from './store.ts'
import { mustRun } from './system.ts'

/** A certificate is renewed rather than reused once it has less than this left. */
const RENEW_WITHIN_MS = 30 * 24 * 60 * 60 * 1000

const LE_PREFIX = 'cactus-'

type Pair = { cert: string; key: string }

/** The certificate Caddy serves a domain with, and where that choice came from. */
export function certificateFor(host: Host, site: SiteRecord, domain: string): { source: CertificateSummary['source']; pair: Pair | null } {
  const own = site.domainTls?.[domain]
  if (own) return { source: 'domain', pair: own }
  if (site.tls) return { source: 'site', pair: site.tls }
  if (host.config.tls) return { source: 'server', pair: host.config.tls }
  return { source: 'automatic', pair: null }
}

type Described = Pick<CertificateSummary, 'covers' | 'issuer' | 'expiresAt' | 'problem' | 'kind'>

/** Reads one certificate file and says whether it names the domain, when it runs out, and what kind it is. */
export function describeCertificate(file: string, domain: string): Described {
  let cert: X509Certificate
  try {
    cert = new X509Certificate(readFileSync(file))
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    const problem = code === 'ENOENT' ? `${file} is missing` : code === 'EACCES' ? `${file} cannot be read` : `${file} is not a certificate`
    return { covers: false, issuer: null, expiresAt: null, problem, kind: 'other' }
  }
  const fields = Object.fromEntries(cert.issuer.split('\n').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
  const expiresAt = Date.parse(cert.validTo)
  const kind = /cloudflare origin/i.test(fields.OU ?? '') || /cloudflare origin/i.test(fields.CN ?? '')
    ? 'cloudflare-origin'
    : /let's encrypt/i.test(fields.O ?? '') ? 'letsencrypt' : 'other'
  return {
    covers: cert.checkHost(domain) !== undefined,
    issuer: kind === 'cloudflare-origin' ? 'Cloudflare Origin CA' : (fields.O ?? fields.CN ?? null),
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
    problem: null,
    kind,
  }
}

function isLetsEncryptFile(host: Host, domain: string, file: string): boolean {
  return file === letsEncryptFiles(host, domain).cert
}

/** One domain's certificate, without the network check (cloudflareProxy is null). */
export function domainCertificate(host: Host, site: SiteRecord, domain: string): CertificateSummary {
  const { source, pair } = certificateFor(host, site, domain)
  if (!pair) {
    return { domain, source, file: null, covers: true, issuer: 'Caddy (automatic)', expiresAt: null, problem: null, kind: 'automatic', renewedBy: 'caddy', cloudflareProxy: null }
  }
  const described = describeCertificate(pair.cert, domain)
  return {
    domain,
    source,
    file: pair.cert,
    ...described,
    renewedBy: described.kind === 'letsencrypt' && isLetsEncryptFile(host, domain, pair.cert) && host.config.letsEncrypt ? 'certbot' : null,
    cloudflareProxy: null,
  }
}

/** Whether https://<domain> is answered through Cloudflare's proxy: Cloudflare adds a cf-ray header to everything it serves. */
export async function behindCloudflare(host: Host, domain: string): Promise<boolean | null> {
  try {
    const res = await host.system.fetch(`https://${domain}/`, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(6_000),
      headers: { 'User-Agent': 'cactus-host-certificate-check/1' },
    })
    return res.headers.has('cf-ray') || /cloudflare/i.test(res.headers.get('server') ?? '')
  } catch {
    return null
  }
}

export async function siteCertificates(host: Host, siteId: string, opts: { checkProxy?: boolean } = {}): Promise<CertificateSummary[]> {
  const site = host.site(siteId)
  return Promise.all(site.domains.map(async (d) => ({
    ...domainCertificate(host, site, d),
    cloudflareProxy: opts.checkProxy === false ? null : await behindCloudflare(host, d),
  })))
}

/** Points the domain at a certificate, or back at the site's own when it is the same one. */
async function attach(host: Host, siteId: string, domain: string, pair: Pair): Promise<void> {
  const site = host.site(siteId)
  const inherited = site.tls ?? host.config.tls
  const same = inherited && inherited.cert === pair.cert && inherited.key === pair.key
  await host.addDomain(siteId, domain, { tls: same ? null : pair })
}

function letsEncryptFiles(host: Host, domain: string): Pair {
  return { cert: join(host.config.tlsDir, `letsencrypt-${domain}.pem`), key: join(host.config.tlsDir, `letsencrypt-${domain}.key`) }
}

/** Copies certbot's current files for one certificate to where Caddy reads them. */
export async function installLetsEncrypt(host: Host, domain: string): Promise<Pair> {
  const le = host.config.letsEncrypt
  if (!le) throw new Error('Let\'s Encrypt is not configured in cactus-host\'s config')
  const caddy = host.system.lookupUser('caddy')
  if (!caddy) throw new Error('There is no caddy user on this box to give the certificate to')
  const lineage = join(le.liveDir, `${LE_PREFIX}${domain}`)
  const target = letsEncryptFiles(host, domain)
  for (const [from, to] of [[join(lineage, 'fullchain.pem'), target.cert], [join(lineage, 'privkey.pem'), target.key]] as const) {
    await mustRun(host.system, 'Installing the certificate for Caddy', 'install', ['-o', '0', '-g', String(caddy.gid), '-m', '0640', from, to])
  }
  return target
}

/** certbot's deploy hook, after a renewal: install the renewed files and reload Caddy. Ignores certificates that are not cactus-host's. */
export async function letsEncryptRenewed(host: Host, lineage: string): Promise<string | null> {
  const name = basename(lineage)
  if (!name.startsWith(LE_PREFIX)) return null
  const domain = name.slice(LE_PREFIX.length)
  await installLetsEncrypt(host, domain)
  const [cmd, ...args] = host.config.caddyReload
  if (cmd) await mustRun(host.system, 'Reloading Caddy', cmd, args)
  return domain
}

async function issueLetsEncrypt(host: Host, domain: string, force = false): Promise<Pair> {
  const le = host.config.letsEncrypt
  if (!le) throw new Error('Let\'s Encrypt is not configured in cactus-host\'s config')
  await mustRun(host.system, `Getting a Let's Encrypt certificate for ${domain}`, 'certbot', [
    'certonly', '--non-interactive', '--agree-tos', '--quiet',
    '--dns-cloudflare', '--dns-cloudflare-credentials', le.credentialsFile,
    '--dns-cloudflare-propagation-seconds', '30',
    '--cert-name', `${LE_PREFIX}${domain}`,
    '--key-type', 'ecdsa',
    force ? '--force-renewal' : '--keep-until-expiring',
    '--deploy-hook', le.deployHook,
    ...(le.email ? ['-m', le.email] : []),
    '-d', domain,
  ], { timeoutMs: 5 * 60_000 })
  return installLetsEncrypt(host, domain)
}

/** Whether automatic certificates can be had at all on this box. */
export function certificateMethods(host: Host): Array<IssueCertificateResponse['method']> {
  return [
    'existing',
    ...(host.config.cloudflare ? ['cloudflare-origin' as const] : []),
    ...(host.config.letsEncrypt ? ['letsencrypt' as const] : []),
  ]
}

/**
 * Makes sure a domain has a certificate that names it and has a month or more left,
 * getting one when it has not. Safe to repeat: a good certificate is left alone.
 */
export async function issueCertificate(host: Host, siteId: string, name: string, opts: { renew?: boolean } = {}): Promise<IssueCertificateResponse> {
  const site = host.site(siteId)
  const domain = name.trim().toLowerCase()
  if (!site.domains.includes(domain)) throw new HostError(`${domain} is not attached to ${siteId}`, 404)
  const now = host.system.now()
  const good = (c: Pick<CertificateSummary, 'covers' | 'expiresAt' | 'problem'>) =>
    c.covers && !c.problem && (c.expiresAt === null || c.expiresAt - now > RENEW_WITHIN_MS)

  const current = domainCertificate(host, site, domain)
  if (opts.renew) {
    // A renewal on request: Let's Encrypt can always issue again. An origin certificate
    // lasts 15 years and Cloudflare renews what visitors see by itself, so there is
    // nothing to renew; anything else is replaced by Let's Encrypt when it can be.
    if (current.kind === 'cloudflare-origin' && current.covers && !current.problem) {
      return {
        certificate: current,
        method: 'existing',
        notes: [`${domain} uses a Cloudflare origin certificate${current.expiresAt ? ` valid until ${new Date(current.expiresAt).toISOString().slice(0, 10)}` : ''}. Visitors see Cloudflare's own certificate, which Cloudflare renews, so there is nothing to renew here.`],
      }
    }
    if (!host.config.letsEncrypt) {
      throw new HostError(`This server cannot renew ${domain}'s certificate by itself: Let's Encrypt is not configured (config "letsEncrypt").`, 400)
    }
    const pair = await issueLetsEncrypt(host, domain, true)
    await attach(host, siteId, domain, pair)
    return { certificate: domainCertificate(host, host.site(siteId), domain), method: 'letsencrypt', notes: [`Let's Encrypt issued a fresh certificate for ${domain}.`] }
  }
  if (current.source !== 'automatic' && good(current)) {
    return { certificate: current, method: 'existing', notes: [`${domain} already has a good certificate in ${current.file}.`] }
  }

  const zone = zoneCertificate(host.config.tlsDir, domain)
  if (zone && good(describeCertificate(zone.cert, domain))) {
    await attach(host, siteId, domain, zone)
    return { certificate: domainCertificate(host, host.site(siteId), domain), method: 'existing', notes: [`Used the certificate already in ${zone.cert}.`] }
  }

  const cloudflare = Cloudflare.fromConfig(host.config, host.system)
  if (cloudflare) {
    const found = await cloudflare.findZone(domain)
    const made = await cloudflare.ensureOriginCertificate(found.name)
    if (good(describeCertificate(made.cert, domain))) {
      await attach(host, siteId, domain, { cert: made.cert, key: made.key })
      return { certificate: domainCertificate(host, host.site(siteId), domain), method: 'cloudflare-origin', notes: [made.note] }
    }
    // An origin certificate covers the zone and one level below it; a deeper name falls through.
  }

  if (host.config.letsEncrypt) {
    const pair = await issueLetsEncrypt(host, domain)
    await attach(host, siteId, domain, pair)
    return {
      certificate: domainCertificate(host, host.site(siteId), domain),
      method: 'letsencrypt',
      notes: [`Let's Encrypt issued a certificate for ${domain}. certbot renews it, and cactus-host installs each renewal.`],
    }
  }

  throw new HostError(
    `No certificate covers ${domain}, and this server cannot get one by itself: give cactus-host a Cloudflare token (config "cloudflare") or Let's Encrypt (config "letsEncrypt"), or save one as ${host.config.tlsDir}/<zone>.pem and .key and try again.`,
    400
  )
}
