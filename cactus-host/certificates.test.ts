import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { describeCertificate, issueCertificate, letsEncryptRenewed, siteCertificates } from './certificates.ts'
import { addSiteDomain } from './create.ts'
import { hostWithSite } from './testing.ts'

// Self-signed, CN example.org, SAN example.org and *.example.org, valid until 2126.
const EXAMPLE_ORG = `-----BEGIN CERTIFICATE-----
MIIBqjCCAVCgAwIBAgIURyLwO2PiLCXdPRJRvOGVKg15kSAwCgYIKoZIzj0EAwIw
FjEUMBIGA1UEAwwLZXhhbXBsZS5vcmcwIBcNMjYxMDMwMTk0NjQ4WhgPMjEyNjEw
MDYxOTQ2NDhaMBYxFDASBgNVBAMMC2V4YW1wbGUub3JnMFkwEwYHKoZIzj0CAQYI
KoZIzj0DAQcDQgAEk0zhe2tdHso7/UoJ0s0YV3gIpdbWoOLexBisrX4jtk2d99Ri
mYVJof1d1PgoenUC/zGl4YkvZxyLRgB7hg1hQqN6MHgwHQYDVR0OBBYEFM3Wfc/i
EY2vjdZrfymShL1CxIYIMB8GA1UdIwQYMBaAFM3Wfc/iEY2vjdZrfymShL1CxIYI
MA8GA1UdEwEB/wQFMAMBAf8wJQYDVR0RBB4wHIILZXhhbXBsZS5vcmeCDSouZXhh
bXBsZS5vcmcwCgYIKoZIzj0EAwIDSAAwRQIhALkY8xiTMCvd0X3SwImNf2/qEunc
OEOQEGFHGN6BjcMBAiBsfxh617Y/iNVrxs9M6V7417mZb/XCzK/22Y6MPun3nw==
-----END CERTIFICATE-----
`

function withTlsDir(ctx: ReturnType<typeof hostWithSite>) {
  const tlsDir = join(ctx.config.stateDir, 'tls')
  mkdirSync(tlsDir, { recursive: true })
  ;(ctx.config as { tlsDir: string }).tlsDir = tlsDir
  return tlsDir
}

function withLetsEncrypt(ctx: ReturnType<typeof hostWithSite>) {
  const liveDir = join(ctx.config.stateDir, 'le-live')
  ;(ctx.config as { letsEncrypt: unknown }).letsEncrypt = {
    credentialsFile: '/etc/letsencrypt/cloudflare.ini',
    email: null,
    liveDir,
    deployHook: '/usr/local/bin/cactus-host cert renewed',
  }
  return liveDir
}

describe('describing a certificate', () => {
  it('says what it names, when it runs out, and when it cannot be read', () => {
    const ctx = hostWithSite()
    const file = join(withTlsDir(ctx), 'example.org.pem')
    writeFileSync(file, EXAMPLE_ORG)
    expect(describeCertificate(file, 'www.example.org')).toMatchObject({ covers: true, issuer: 'example.org', kind: 'other', problem: null })
    expect(describeCertificate(file, 'a.b.example.org').covers).toBe(false)
    expect(describeCertificate(file, 'example.com').covers).toBe(false)
    expect(new Date(describeCertificate(file, 'example.org').expiresAt as number).getUTCFullYear()).toBe(2126)
    expect(describeCertificate(join(ctx.config.tlsDir, 'nope.pem'), 'example.org').problem).toMatch(/missing/)
  })

  it('lists each domain with its source and whether Cloudflare answers for it', async () => {
    const ctx = hostWithSite({ domains: ['shop.example.com', 'www.example.org'] })
    const file = join(withTlsDir(ctx), 'example.org.pem')
    writeFileSync(file, EXAMPLE_ORG)
    ctx.host.store.saveSite({ ...ctx.host.site('shop'), domainTls: { 'www.example.org': { cert: file, key: file.replace('.pem', '.key') } } })
    ctx.system.fetch = async (url: string) => new Response('', { headers: url.includes('example.org') ? { 'cf-ray': '1-LHR' } : {} })
    const certs = await siteCertificates(ctx.host, 'shop')
    expect(certs[0]).toMatchObject({ domain: 'shop.example.com', source: 'automatic', kind: 'automatic', renewedBy: 'caddy', cloudflareProxy: false })
    expect(certs[1]).toMatchObject({ domain: 'www.example.org', source: 'domain', covers: true, cloudflareProxy: true, renewedBy: null })
  })
})

describe('getting a certificate', () => {
  it('uses a covering certificate already in tlsDir', async () => {
    const ctx = hostWithSite({ domains: ['shop.example.com', 'www.example.org'] })
    const tlsDir = withTlsDir(ctx)
    writeFileSync(join(tlsDir, 'example.org.pem'), EXAMPLE_ORG)
    writeFileSync(join(tlsDir, 'example.org.key'), 'k')
    const issued = await issueCertificate(ctx.host, 'shop', 'www.example.org')
    expect(issued.method).toBe('existing')
    expect(ctx.host.site('shop').domainTls?.['www.example.org']?.cert).toBe(join(tlsDir, 'example.org.pem'))
    expect(readFileSync(ctx.paths.caddyFile, 'utf8')).toContain(`tls ${join(tlsDir, 'example.org.pem')}`)
  })

  it('asks Let\'s Encrypt when nothing covers the domain, and installs the files for Caddy', async () => {
    const ctx = hostWithSite({ domains: ['shop.example.com'] })
    const tlsDir = withTlsDir(ctx)
    withLetsEncrypt(ctx)
    const issued = await issueCertificate(ctx.host, 'shop', 'shop.example.com')
    expect(issued.method).toBe('letsencrypt')
    const certbot = ctx.system.calls.find((c) => c.cmd === 'certbot')
    expect(certbot?.args).toEqual(expect.arrayContaining(['--dns-cloudflare', '--cert-name', 'cactus-shop.example.com', '-d', 'shop.example.com', '--keep-until-expiring', '--deploy-hook']))
    expect(ctx.system.calls.filter((c) => c.cmd === 'install').map((c) => c.args.at(-1))).toEqual([
      join(tlsDir, 'letsencrypt-shop.example.com.pem'),
      join(tlsDir, 'letsencrypt-shop.example.com.key'),
    ])
    expect(ctx.host.site('shop').domainTls?.['shop.example.com']?.cert).toBe(join(tlsDir, 'letsencrypt-shop.example.com.pem'))
  })

  it('forces a renewal on request, and refuses with an explanation when it cannot', async () => {
    const ctx = hostWithSite()
    withTlsDir(ctx)
    await expect(issueCertificate(ctx.host, 'shop', 'shop.example.com', { renew: true })).rejects.toThrow(/Let's Encrypt is not configured/)
    withLetsEncrypt(ctx)
    await issueCertificate(ctx.host, 'shop', 'shop.example.com', { renew: true })
    expect(ctx.system.calls.find((c) => c.cmd === 'certbot')?.args).toContain('--force-renewal')
  })

  it('says how to get one when the box cannot', async () => {
    const ctx = hostWithSite()
    withTlsDir(ctx)
    await expect(issueCertificate(ctx.host, 'shop', 'shop.example.com')).rejects.toThrow(/cannot get one by itself/)
    await expect(issueCertificate(ctx.host, 'shop', 'other.example.com')).rejects.toThrow(/not attached/)
  })

  it('happens by itself when a domain is added and Let\'s Encrypt is set up', async () => {
    const ctx = hostWithSite()
    const tlsDir = withTlsDir(ctx)
    withLetsEncrypt(ctx)
    const added = await addSiteDomain(ctx.host, 'shop', 'new.example.net', false)
    expect(added.cloudflare.done.join(' ')).toMatch(/Let's Encrypt issued/)
    expect(added.cloudflare.manual.join(' ')).not.toMatch(/origin certificate/)
    expect(ctx.host.site('shop').domainTls?.['new.example.net']?.cert).toBe(join(tlsDir, 'letsencrypt-new.example.net.pem'))
  })
})

describe('certbot\'s deploy hook', () => {
  it('installs cactus-host\'s renewals and ignores anybody else\'s', async () => {
    const ctx = hostWithSite()
    withTlsDir(ctx)
    const liveDir = withLetsEncrypt(ctx)
    expect(await letsEncryptRenewed(ctx.host, join(liveDir, 'db.deskwell.co.uk'))).toBeNull()
    expect(ctx.system.calls).toEqual([])
    expect(await letsEncryptRenewed(ctx.host, join(liveDir, 'cactus-shop.example.com'))).toBe('shop.example.com')
    expect(ctx.system.calls.map((c) => c.cmd)).toEqual(['install', 'install', 'systemctl'])
  })
})
