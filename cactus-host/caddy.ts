// Each site's Caddy file, /etc/caddy/sites/<site>.caddy, imported by the main
// Caddyfile. Written whole every time anything about the site's routing changes - a
// switch-over, a new domain - and followed by a graceful Caddy reload, which keeps
// connections already open on the old config until they finish.
//
// Three things are answered by Caddy itself rather than the site:
//   - /.well-known/cactus-host-proof, a value only this site knows, so the setup
//     wizard can confirm a domain really reaches THIS site on THIS server;
//   - /_next/static/*, from a directory holding every kept release's files. A page
//     Cloudflare cached from the previous build still asks for that build's scripts,
//     and they are still there;
//   - while no release is live yet, a plain 503, rather than a proxy error.

import type { HostConfig } from './config.ts'
import type { SitePaths, SiteRecord } from './store.ts'

export const PROOF_PATH = '/.well-known/cactus-host-proof'

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

export function isValidHostname(name: string): boolean {
  return HOSTNAME.test(name)
}

function tlsLine(tls: { cert: string; key: string } | null): string[] {
  if (!tls) return []
  for (const path of [tls.cert, tls.key]) {
    if (!/^\/[A-Za-z0-9._/-]+$/.test(path)) throw new Error(`"${path}" is not a plain absolute path`)
  }
  return [`\ttls ${tls.cert} ${tls.key}`]
}

export function siteCaddyFile(config: HostConfig, site: SiteRecord, paths: SitePaths): string {
  for (const domain of site.domains) {
    if (!isValidHostname(domain)) throw new Error(`"${domain}" is not a valid domain name`)
  }
  const header = `# Written by cactus-host for site ${site.id}. Rewritten on every deploy, so edits here are lost.\n`
  if (site.domains.length === 0) return `${header}# No domains yet: add one with \`cactus-host domain add ${site.id} <name>\`.\n`

  const livePort = site.liveSlot ? site.ports[site.liveSlot] : null
  const lines = [
    header.trimEnd(),
    `${site.domains.join(', ')} {`,
    ...tlsLine(site.tls ?? config.tls),
    `\troot * ${paths.static}`,
    `\thandle ${PROOF_PATH} {`,
    '\t\theader Cache-Control "no-store"',
    `\t\trespond "${site.proof}" 200`,
    '\t}',
    '\t@static {',
    '\t\tpath /_next/static/*',
    '\t\tfile',
    '\t}',
    '\thandle @static {',
    '\t\theader Cache-Control "public, max-age=31536000, immutable"',
    '\t\tfile_server',
    '\t}',
    '\thandle {',
    ...(livePort
      ? [`\t\treverse_proxy 127.0.0.1:${livePort}`]
      : ['\t\theader Cache-Control "no-store"', '\t\trespond "This site is still being built. Try again in a few minutes." 503']),
    '\t}',
    '}',
    '',
  ]
  return lines.join('\n')
}
