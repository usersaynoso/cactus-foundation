// Cloudflare, for `site create`: the DNS record, the zone's SSL mode and the zone's
// origin certificate - the three steps RUNBOOK section 6 does by hand.
//
// Uses a scoped API token from the file named in config.cloudflare (Zone: DNS Edit,
// Zone: SSL and Certificates Edit). Never an account's global key: that can do
// anything to every zone in the account, and this box has no business holding it.
//
// Careful by construction: a record that already points somewhere else is refused,
// not moved; an existing certificate is reused, not replaced; and the certificate's
// private key is made here with openssl and never leaves the box.

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { HostConfig } from './config.ts'
import { mustRun, type System } from './system.ts'

const API = 'https://api.cloudflare.com/client/v4'

/** What `site create` would have done, for a box with no Cloudflare token. */
export function manualCloudflareSteps(config: HostConfig, domains: string[]): string[] {
  const address = config.publicAddress ?? '<this server\'s public address>'
  return [
    `DNS: an A record for ${domains.join(', ')} pointing at ${address}, proxied (orange cloud).`,
    'SSL/TLS -> Overview: Full (strict).',
    `SSL/TLS -> Origin Server: a certificate for the zone, saved as ${config.tlsDir}/<zone>.pem and .key (root:caddy, 0640), then \`cactus-host site tls <site> <cert> <key>\`.`,
  ]
}

type CfEnvelope<T> = { success: boolean; errors?: Array<{ message: string }>; result: T }

export class Cloudflare {
  readonly config: HostConfig
  readonly system: System
  private readonly token: string

  constructor(config: HostConfig, system: System, token: string) {
    this.config = config
    this.system = system
    this.token = token
  }

  /** Null when the box has no Cloudflare token configured. */
  static fromConfig(config: HostConfig, system: System): Cloudflare | null {
    if (!config.cloudflare) return null
    const token = readFileSync(config.cloudflare.apiTokenFile, 'utf8').trim()
    if (!token) throw new Error(`${config.cloudflare.apiTokenFile} is empty`)
    return new Cloudflare(config, system, token)
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.system.fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = (await res.json().catch(() => null)) as CfEnvelope<T> | null
    if (!res.ok || !data?.success) {
      const why = data?.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`
      throw new Error(`Cloudflare refused ${method} ${path.split('?')[0]}: ${why}`)
    }
    return data.result
  }

  /** The zone a hostname belongs to: the longest zone name it ends with. */
  async findZone(hostname: string): Promise<{ id: string; name: string }> {
    const labels = hostname.split('.')
    for (let i = 0; i < labels.length - 1; i++) {
      const candidate = labels.slice(i).join('.')
      const zones = await this.call<Array<{ id: string; name: string }>>('GET', `/zones?name=${encodeURIComponent(candidate)}`)
      if (zones[0]) return { id: zones[0].id, name: zones[0].name }
    }
    throw new Error(`None of ${hostname}'s parent domains is a zone this Cloudflare token can see`)
  }

  /** A proxied A record to this server. Returns what it did. Refuses a record that points elsewhere. */
  async ensureARecord(zoneId: string, hostname: string): Promise<string> {
    const address = this.config.publicAddress
    if (!address) throw new Error('publicAddress is not set in cactus-host\'s config, so there is nothing to point the record at')
    const existing = await this.call<Array<{ id: string; type: string; content: string; proxied: boolean }>>(
      'GET',
      `/zones/${zoneId}/dns_records?name=${encodeURIComponent(hostname)}`
    )
    const clash = existing.find((r) => r.type !== 'A' || r.content !== address)
    if (clash) throw new Error(`${hostname} already has a ${clash.type} record pointing at ${clash.content}; change or remove it in Cloudflare first`)
    const same = existing[0]
    if (same) {
      if (same.proxied) return `${hostname} already points here, proxied`
      await this.call('PATCH', `/zones/${zoneId}/dns_records/${same.id}`, { proxied: true })
      return `${hostname} already pointed here; turned the proxy on`
    }
    await this.call('POST', `/zones/${zoneId}/dns_records`, { type: 'A', name: hostname, content: address, proxied: true, ttl: 1 })
    return `Added ${hostname} -> ${address}, proxied`
  }

  async ensureStrict(zoneId: string, zoneName: string): Promise<string> {
    const current = await this.call<{ value: string }>('GET', `/zones/${zoneId}/settings/ssl`)
    if (current.value === 'strict') return `${zoneName} is already on Full (strict)`
    await this.call('PATCH', `/zones/${zoneId}/settings/ssl`, { value: 'strict' })
    return `${zoneName}: SSL mode ${current.value} -> Full (strict)`
  }

  /**
   * The zone's origin certificate in tlsDir, covering the zone and *.zone, made if it
   * is not there yet. The key is generated here and only the request goes to Cloudflare.
   */
  async ensureOriginCertificate(zoneName: string): Promise<{ cert: string; key: string; note: string }> {
    const cert = join(this.config.tlsDir, `${zoneName}.pem`)
    const key = join(this.config.tlsDir, `${zoneName}.key`)
    if (existsSync(cert) && existsSync(key)) return { cert, key, note: `Reused the origin certificate in ${cert}` }
    if (existsSync(cert) || existsSync(key)) throw new Error(`Only half of ${zoneName}'s certificate is in ${this.config.tlsDir}; sort that out by hand first`)

    const caddy = this.system.lookupUser('caddy')
    if (!caddy) throw new Error('There is no caddy user on this box to give the certificate to')
    const work = mkdtempSync(join(tmpdir(), 'cactus-host-csr-'))
    try {
      const csr = join(work, 'request.csr')
      await mustRun(this.system, 'Making the certificate key', 'sh', [
        '-c',
        'umask 027 && openssl req -new -newkey rsa:2048 -nodes -keyout "$1" -subj "/CN=$2" -out "$3"',
        'sh', key, zoneName, csr,
      ])
      const issued = await this.call<{ certificate: string }>('POST', '/certificates', {
        csr: readFileSync(csr, 'utf8'),
        hostnames: [zoneName, `*.${zoneName}`],
        request_type: 'origin-rsa',
        requested_validity: 5475,
      })
      await mustRun(this.system, 'Saving the certificate', 'sh', [
        '-c',
        'umask 027 && printf "%s\\n" "$2" > "$1"',
        'sh', cert, issued.certificate.trim(),
      ])
      await mustRun(this.system, 'Handing the certificate to Caddy', 'chown', [`0:${caddy.gid}`, cert, key])
      await mustRun(this.system, 'Locking the certificate down', 'chmod', ['0640', cert, key])
    } catch (err) {
      // Never leave a key with no certificate: the next attempt would refuse half a pair.
      if (!existsSync(cert)) rmSync(key, { force: true })
      throw err
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
    return { cert, key, note: `Made an origin certificate for ${zoneName} and *.${zoneName} in ${cert}` }
  }
}
