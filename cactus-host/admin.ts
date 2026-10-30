// The server's one admin token, for the admin API (/v1/admin/...).
//
// Separate from every site's own token, and never widens one: a site token gets 401
// on the admin routes and the admin token gets 401 on a site's. It is granted to one
// site at a time - the site that exists to run the server - by writing it straight
// into that site's env file as CACTUS_HOST_ADMIN_TOKEN, so it is never printed and
// nobody has to paste it anywhere. Granting again makes a new one and the old one
// stops working; revoking turns the admin API off. cactus-host keeps only its sha256
// in <stateDir>/admin.json, alongside which site holds it.

import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { HostConfig } from './config.ts'
import type { Host } from './host.ts'
import { writeFileAtomic } from './store.ts'
import { hashToken, newToken, tokenMatches } from './tokens.ts'

export const ADMIN_TOKEN_KEY = 'CACTUS_HOST_ADMIN_TOKEN'

export type AdminRecord = { tokenHash: string; site: string; grantedAt: number }

function adminPath(config: HostConfig): string {
  return join(config.stateDir, 'admin.json')
}

export function readAdmin(config: HostConfig): AdminRecord | null {
  try {
    return JSON.parse(readFileSync(adminPath(config), 'utf8')) as AdminRecord
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

export function isAdminToken(config: HostConfig, token: string): boolean {
  const record = readAdmin(config)
  return record !== null && tokenMatches(token, record.tokenHash)
}

/** A new admin token, written into the site's env file. Any earlier holder's token stops working. */
export function grantAdmin(host: Host, siteId: string): AdminRecord {
  const site = host.site(siteId)
  const previous = readAdmin(host.config)
  const token = `cha_${newToken().slice('chs_'.length)}`
  const record: AdminRecord = { tokenHash: hashToken(token), site: site.id, grantedAt: host.system.now() }

  // Take it out of the previous holder's env first, so a moved grant never leaves a
  // dead token sitting in a site that should no longer think it has one.
  if (previous && previous.site !== site.id) removeFromSite(host, previous.site)

  const env = host.readSiteEnv(site)
  env.set(ADMIN_TOKEN_KEY, token)
  host.writeSiteEnv(site, env)
  if (!site.secretKeys.includes(ADMIN_TOKEN_KEY)) {
    host.store.saveSite({ ...site, secretKeys: [...site.secretKeys, ADMIN_TOKEN_KEY].sort() })
  }
  writeFileAtomic(adminPath(host.config), JSON.stringify(record, null, 2) + '\n')
  return record
}

export function revokeAdmin(host: Host): AdminRecord | null {
  const previous = readAdmin(host.config)
  if (!previous) return null
  removeFromSite(host, previous.site)
  rmSync(adminPath(host.config), { force: true })
  return previous
}

function removeFromSite(host: Host, siteId: string): void {
  const site = host.store.getSite(siteId)
  if (!site) return
  const env = host.readSiteEnv(site)
  if (env.delete(ADMIN_TOKEN_KEY)) host.writeSiteEnv(site, env)
  if (site.secretKeys.includes(ADMIN_TOKEN_KEY)) {
    host.store.saveSite({ ...site, secretKeys: site.secretKeys.filter((k) => k !== ADMIN_TOKEN_KEY) })
  }
}
