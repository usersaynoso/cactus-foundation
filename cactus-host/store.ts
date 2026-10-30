// cactus-host's records, and where every file for a site lives.
//
// Layout on the box (paths from config.ts; these are the defaults):
//
//   /var/lib/cactus-host/            root only
//     sites/<site>.json              the site's record (SiteRecord)
//     builds/<site>.json             its build history, newest first
//     logs/<site>/<build>.log        one log per build
//     repos/<site>.git               bare mirror of the install repo
//   /etc/cactus-host/keys/<site>     the site's read-only deploy key
//   /srv/cactus/<site>/              root:<site user>, 0751
//     env                            the site's env file, <site user> 0600
//     home/                          HOME for builds (npm's cache)
//     releases/<build>/              one finished build per directory
//     slots/a, slots/b               symlinks to the releases the two slots run
//     static/_next/static/           every kept release's static files, for Caddy
//
// Writes are atomic (write a temporary file, then rename over the old one), so a
// crash or a full disk leaves the previous record rather than half of a new one.

import { chownSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { HostConfig } from './config.ts'
import type { BuildSummary } from './protocol.ts'

export type SlotName = 'a' | 'b'

export type SiteRecord = {
  id: string
  name: string
  /** owner/repo on GitHub. */
  repo: string
  branch: string
  /** The Linux user the site's builds and processes run as. */
  user: string
  ports: Record<SlotName, number>
  liveSlot: SlotName | null
  /** First is the primary domain, sent as the Host header on health checks and cron. */
  domains: string[]
  /** Keys the API will list but never hand back. */
  secretKeys: string[]
  /** sha256 of the site's token, hex. The token itself is only in the site's env file. */
  tokenHash: string
  /** Served at /.well-known/cactus-host-proof so a domain check can tell this site from any other. */
  proof: string
  /**
   * This site's own Cloudflare origin certificate, when its domains are in a different
   * Cloudflare zone from the server-wide one in config.tls. Origin certificates are
   * issued per zone, so two sites on two domains need one each.
   */
  tls?: { cert: string; key: string }
  /**
   * Certificates for particular domains that sit in another Cloudflare zone from the
   * rest of the site (an origin certificate covers one zone), keyed by domain.
   */
  domainTls?: Record<string, { cert: string; key: string }>
  createdAt: number
}

export type BuildRecord = BuildSummary & {
  releaseDir: string | null
  slot: SlotName | null
  /** Epoch ms it last went live, by its own build or a rollback. Absent on older records. */
  liveAt?: number | null
  /**
   * Whether the build got as far as `npm run build`, where migrations run. False until
   * it does. Absent on records from before it was kept, which counts as true: nobody
   * knows what those did to the database.
   */
  reachedMigrations?: boolean
}

// Short enough that "cactus-<site>" fits a Linux user name (32 characters at most).
export const SITE_ID_PATTERN = /^[a-z][a-z0-9-]{1,22}[a-z0-9]$/

export const MAX_BUILD_HISTORY = 50

export function sitePaths(config: HostConfig, siteId: string) {
  if (!SITE_ID_PATTERN.test(siteId)) throw new Error(`"${siteId}" is not a valid site name`)
  const root = join(config.sitesRoot, siteId)
  return {
    root,
    env: join(root, 'env'),
    home: join(root, 'home'),
    releases: join(root, 'releases'),
    release: (buildId: string) => join(root, 'releases', buildId),
    slots: join(root, 'slots'),
    slot: (slot: SlotName) => join(root, 'slots', slot),
    static: join(root, 'static'),
    record: join(config.stateDir, 'sites', `${siteId}.json`),
    builds: join(config.stateDir, 'builds', `${siteId}.json`),
    logs: join(config.stateDir, 'logs', siteId),
    log: (buildId: string) => join(config.stateDir, 'logs', siteId, `${buildId}.log`),
    /** One JSON line per cron tick (cron-log.ts). Beside the build logs so a rename takes it along. */
    cronLog: join(config.stateDir, 'logs', siteId, 'cron.jsonl'),
    mirror: join(config.stateDir, 'repos', `${siteId}.git`),
    deployKey: join(config.keysDir, siteId),
    knownHosts: join(config.keysDir, 'known_hosts'),
    caddyFile: join(config.caddySitesDir, `${siteId}.caddy`),
    unit: (slot: SlotName) => `cactus-${siteId}-${slot}.service`,
    unitFile: (slot: SlotName) => join(config.systemdDir, `cactus-${siteId}-${slot}.service`),
  }
}

export type SitePaths = ReturnType<typeof sitePaths>

export function writeFileAtomic(
  path: string,
  content: string,
  mode = 0o600,
  owner?: { uid: number; gid: number }
): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, content, { mode })
  // Owned before it is in place, so there is never a moment when the site's env file
  // exists under the wrong owner.
  if (owner) chownSync(tmp, owner.uid, owner.gid)
  renameSync(tmp, path)
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

export class Store {
  readonly config: HostConfig

  constructor(config: HostConfig) {
    this.config = config
  }

  paths(siteId: string): SitePaths {
    return sitePaths(this.config, siteId)
  }

  getSite(siteId: string): SiteRecord | null {
    if (!SITE_ID_PATTERN.test(siteId)) return null
    return readJson<SiteRecord>(this.paths(siteId).record)
  }

  listSites(): SiteRecord[] {
    const dir = join(this.config.stateDir, 'sites')
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      return []
    }
    return names
      .filter((n) => n.endsWith('.json'))
      .map((n) => this.getSite(n.slice(0, -5)))
      .filter((s): s is SiteRecord => s !== null)
      .sort((a, b) => a.id.localeCompare(b.id))
  }

  saveSite(site: SiteRecord): void {
    writeFileAtomic(this.paths(site.id).record, JSON.stringify(site, null, 2) + '\n')
  }

  listBuilds(siteId: string): BuildRecord[] {
    return readJson<BuildRecord[]>(this.paths(siteId).builds) ?? []
  }

  getBuild(siteId: string, buildId: string): BuildRecord | null {
    return this.listBuilds(siteId).find((b) => b.id === buildId) ?? null
  }

  /** Inserts or replaces one build, keeping the history newest first and bounded. */
  saveBuild(siteId: string, build: BuildRecord): void {
    const others = this.listBuilds(siteId).filter((b) => b.id !== build.id)
    const all = [build, ...others].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_BUILD_HISTORY)
    writeFileAtomic(this.paths(siteId).builds, JSON.stringify(all, null, 2) + '\n')
  }

  /** Marks one build live and every other build of the site not live. */
  setLiveBuild(siteId: string, buildId: string): void {
    const all = this.listBuilds(siteId).map((b) => ({ ...b, live: b.id === buildId }))
    writeFileAtomic(this.paths(siteId).builds, JSON.stringify(all, null, 2) + '\n')
  }
}

export function toSummary(build: BuildRecord): BuildSummary {
  return {
    id: build.id,
    sha: build.sha,
    ref: build.ref,
    state: build.state,
    createdAt: build.createdAt,
    startedAt: build.startedAt ?? null,
    finishedAt: build.finishedAt,
    error: build.error,
    live: build.live,
    trigger: build.trigger,
  }
}
