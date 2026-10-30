// `cactus-host site add`: everything a new site needs on the box before its first
// build - a Linux user of its own, its directories, two ports, a token, a deploy
// key, the env file with the keys cactus-host owns, two systemd units and a Caddy
// file. Safe to run again for a site that already exists: it refuses rather than
// overwrite a live site's token or ports.

import { chownSync, chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import type { Host } from './host.ts'
import { DEFAULT_LISTEN_PORT } from './protocol.ts'
import { isValidHostname } from './caddy.ts'
import { SITE_ID_PATTERN, writeFileAtomic, type SiteRecord, type SlotName } from './store.ts'
import { mustRun } from './system.ts'
import { newToken, hashToken } from './tokens.ts'
import { slotUnit } from './units.ts'

export type AddSiteInput = {
  id: string
  repo: string
  branch?: string
  name?: string
  domains?: string[]
}

export type AddSiteResult = { site: SiteRecord; deployKeyPublic: string }

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const BRANCH_PATTERN = /^[A-Za-z0-9._/-]+$/

/** The lowest free pair of ports at or above basePort. */
export function nextPorts(used: number[], basePort: number): Record<SlotName, number> {
  const taken = new Set(used)
  for (let a = basePort; a < 65000; a += 2) {
    if (!taken.has(a) && !taken.has(a + 1)) return { a, b: a + 1 }
  }
  throw new Error('No free ports left')
}

export async function addSite(host: Host, input: AddSiteInput): Promise<AddSiteResult> {
  const { config, store, system } = host
  if (!SITE_ID_PATTERN.test(input.id)) {
    throw new Error('A site name is 3 to 24 lower-case letters, digits and hyphens, starting with a letter')
  }
  if (!REPO_PATTERN.test(input.repo)) throw new Error('--repo must be owner/repo, as on GitHub')
  const branch = input.branch ?? 'main'
  if (!BRANCH_PATTERN.test(branch)) throw new Error(`"${branch}" is not a branch name`)
  const domains = (input.domains ?? []).map((d) => d.trim().toLowerCase())
  for (const d of domains) if (!isValidHostname(d)) throw new Error(`"${d}" is not a valid domain name`)
  if (store.getSite(input.id)) throw new Error(`There is already a site called ${input.id} on this server`)
  const others = store.listSites()
  for (const d of domains) {
    if (others.some((s) => s.domains.includes(d))) throw new Error(`${d} already belongs to another site on this server`)
  }

  const user = `cactus-${input.id}`
  const paths = store.paths(input.id)

  if (!system.lookupUser(user)) {
    await mustRun(system, 'Creating the site user', 'useradd', [
      '--system', '--user-group', '--no-create-home',
      '--home-dir', paths.home,
      '--shell', '/usr/sbin/nologin',
      user,
    ])
  }
  const owner = system.lookupUser(user)
  if (!owner) throw new Error(`The user ${user} could not be created`)

  // Root (the service's own user) owns the site directory; the site's group can enter
  // it, and everybody else (Caddy, for the static files) may pass through but not
  // list it.
  mkdirSync(paths.root, { recursive: true })
  chownSync(paths.root, process.getuid?.() ?? 0, owner.gid)
  chmodSync(paths.root, 0o751)
  for (const [dir, mode, mine] of [
    [paths.home, 0o700, true],
    [paths.releases, 0o750, true],
    [paths.slots, 0o755, false],
    [paths.static, 0o755, false],
  ] as const) {
    mkdirSync(dir, { recursive: true })
    if (mine) chownSync(dir, owner.uid, owner.gid)
    chmodSync(dir, mode)
  }

  mkdirSync(config.keysDir, { recursive: true, mode: 0o700 })
  if (!existsSync(paths.deployKey)) {
    await mustRun(system, 'Making the deploy key', 'ssh-keygen', [
      '-t', 'ed25519', '-N', '', '-q', '-C', `cactus-host ${input.id}`, '-f', paths.deployKey,
    ])
  }
  const deployKeyPublic = readFileSync(`${paths.deployKey}.pub`, 'utf8').trim()

  const token = newToken()
  const site: SiteRecord = {
    id: input.id,
    name: input.name?.trim() || input.id,
    repo: input.repo,
    branch,
    user,
    ports: nextPorts(others.flatMap((s) => [s.ports.a, s.ports.b]), config.basePort),
    liveSlot: null,
    domains,
    secretKeys: ['CACTUS_HOST_TOKEN'],
    tokenHash: hashToken(token),
    proof: randomBytes(16).toString('hex'),
    createdAt: system.now(),
  }

  const env = host.readSiteEnv(site)
  env.set('CACTUS_HOSTING_PROVIDER', 'server')
  env.set('CACTUS_HOST_SITE_ID', site.id)
  env.set('CACTUS_HOST_TOKEN', token)
  if (config.listenPort !== DEFAULT_LISTEN_PORT || config.listenHost !== '127.0.0.1') {
    env.set('CACTUS_HOST_URL', `http://${config.listenHost}:${config.listenPort}`)
  }
  // The repo the site commits module and core updates to - the one this server builds.
  if (!env.has('GITHUB_REPO')) env.set('GITHUB_REPO', site.repo)
  store.saveSite(site)
  host.writeSiteEnv(site, env)

  for (const slot of ['a', 'b'] as const) {
    writeFileAtomic(paths.unitFile(slot), slotUnit(config, site, paths, slot), 0o644)
  }
  await mustRun(system, 'Reloading systemd', 'systemctl', ['daemon-reload'])
  await host.writeRouting(site)

  return { site, deployKeyPublic }
}
