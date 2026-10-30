// The wire protocol between a Cactus site and cactus-host, the companion service
// that runs Cactus sites on a server the owner controls.
//
// Imported by both sides: by cactus-host itself (run by Node directly, so this file
// may use only erasable TypeScript - no enums, no namespaces, no parameter
// properties) and, type-only, by lib/server-host in the app. It imports nothing.
//
// Every request carries `Authorization: Bearer <token>`, where the token is the one
// cactus-host issued for ONE site when it was added. A token never sees another
// site, so a site that can reach the companion on localhost still cannot drive its
// neighbours.

export const PROTOCOL_VERSION = 1

/** Where cactus-host listens unless its config says otherwise. Localhost only. */
export const DEFAULT_LISTEN_PORT = 7171

export type BuildState = 'queued' | 'building' | 'ready' | 'error' | 'canceled'

export type BuildTrigger = 'api' | 'cli' | 'rollback'

export type BuildSummary = {
  id: string
  /** The commit built. Empty until the ref has been resolved at the start of the build. */
  sha: string
  ref: string
  state: BuildState
  /** Epoch ms. */
  createdAt: number
  /** When the build left the queue and began work. Absent on builds recorded before it was kept. */
  startedAt?: number | null
  finishedAt: number | null
  /** Plain-English reason for an `error` state. */
  error: string | null
  /** True for the one build currently serving the site. */
  live: boolean
  trigger: BuildTrigger
}

export type SiteSummary = {
  id: string
  name: string
  /** owner/repo of the install repository. */
  repo: string
  branch: string
  domains: string[]
  /** The server's public address, for the DNS records the setup wizard shows. */
  publicAddress: string | null
  liveBuildId: string | null
  liveSha: string | null
}

export type EnvKeySummary = { key: string; secret: boolean }

export type EnvWrite = { key: string; value: string; secret: boolean }

export type StartBuildRequest = {
  /** A commit to build. Omitted means the head of the site's branch, resolved now. */
  sha?: string
}

export type StartBuildResponse = { build: BuildSummary; alreadyRunning: boolean }

export type BuildLogChunk = {
  lines: string[]
  /** Pass back as `since` to get only what came after. */
  next: number
  /** True once the build has finished and nothing more will be written. */
  done: boolean
}

export type DomainSummary = {
  name: string
  /** True once a request to https://<name> reaches this site on this server. */
  serving: boolean
}

export type ErrorBody = { error: string }

// ── The admin API ─────────────────────────────────────────────────────────────
//
// Under /v1/admin/, with the server's one admin token (CACTUS_HOST_ADMIN_TOKEN in
// the env of whichever site was granted it), never a site's own token. It sees every
// site and every database on the box, so it is held by a site that exists only to run
// the server, never by a public-facing one.

export type DatabaseSummary = {
  name: string
  owner: string
  sizeBytes: number
  /** rclone remote:path its backups are copied to, or null for local copies only. */
  backup: string | null
}

export type AdminSiteSummary = SiteSummary & {
  ports: { a: number; b: number }
  liveSlot: 'a' | 'b' | null
  /** The newest build, whatever its state. */
  latestBuild: BuildSummary | null
  /** When the live build went live (its finish time), or null. */
  liveSince: number | null
  /** The database named in the site's DATABASE_URL, or null when it has none on this box. */
  database: string | null
  /** Where that database's backups are copied (rclone remote:path), or null. */
  backup: string | null
  createdAt: number
}

/**
 * A build in the admin API, with whether its release is still on disk to roll back to,
 * and the copy of the database that rolling back to it with its database would restore.
 */
export type AdminBuildSummary = BuildSummary & {
  kept: boolean
  /** Null when only the code can go back: no copy from when it was live is kept. */
  restorePoint: { takenAt: number; sizeBytes: number } | null
}

/**
 * POST /v1/admin/sites/:id/update, which cactus-host passes on to the site itself
 * (POST /api/internal/host-update on its live release): bring Cactus and every module
 * up to date in one build. The build then runs, and switches over, like any other.
 */
export type HostUpdateResponse = {
  ok: true
  /** Nothing newer was found, so nothing was built. */
  upToDate: boolean
  /** The core version change, or null when only modules moved. */
  core: { from: string; to: string } | null
  /** Modules included in the build. */
  updated: number
  /** Modules held back, each with the reason. */
  failed: string[]
  /** False when the site committed the update but could not start the build itself. */
  redeployTriggered: boolean
}

/** POST /v1/admin/sites/:id/rollback. `restoreDatabase` loses everything written since restorePoint.takenAt. */
export type AdminRollbackRequest = { buildId: string; restoreDatabase?: boolean }

/** PATCH /v1/admin/sites/:id. `backup` null or "" clears the destination. */
export type EditSiteRequest = { name?: string; branch?: string; repo?: string; backup?: string | null }

/** A new deploy key comes back when the repo changes: GitHub refuses one key on two repos. */
export type EditSiteResponse = { site: AdminSiteSummary; deployKeyPublic: string | null }

export type CertificateSummary = {
  domain: string
  /** Which certificate Caddy uses for it: its own, the site's, the server-wide one, or Caddy's automatic one. */
  source: 'domain' | 'site' | 'server' | 'automatic'
  file: string | null
  /** Whether that certificate names the domain (directly or by wildcard). */
  covers: boolean
  issuer: string | null
  /** Epoch ms. */
  expiresAt: number | null
  /** Why the certificate could not be read, if it could not. */
  problem: string | null
  /**
   * What kind of certificate it is. A Cloudflare origin certificate is trusted only by
   * Cloudflare's proxy: visitors see Cloudflare's own edge certificate, which Cloudflare
   * issues and renews by itself.
   */
  kind: 'cloudflare-origin' | 'letsencrypt' | 'other' | 'automatic'
  /** Who renews it: certbot (with cactus-host installing each renewal), Caddy, or nobody (it is long-lived or was put there by hand). */
  renewedBy: 'certbot' | 'caddy' | null
  /** True when https://<domain> answers through Cloudflare's proxy, false when it does not, null when it could not be told. */
  cloudflareProxy: boolean | null
}

export type IssueCertificateResponse = {
  certificate: CertificateSummary
  /** How it was got: an existing file, a Cloudflare origin certificate, or Let's Encrypt. */
  method: 'existing' | 'cloudflare-origin' | 'letsencrypt'
  notes: string[]
}

/** POST /v1/admin/sites/:id/domains/:domain/certificate. `renew` replaces a good certificate too. */
export type IssueCertificateRequest = { renew?: boolean }

export type CreateDatabaseRequest = { name: string; backup?: string | null }

/** The connection string appears here once; cactus-host keeps no copy of the password. */
export type CreateDatabaseResponse = { database: DatabaseSummary; connectionString: string }

export type BackupDatabaseResponse = { file: string; copiedTo: string | null }

export type CreateSiteRequest = {
  id: string
  repo: string
  domains: string[]
  name?: string
  branch?: string
  backup?: string | null
}

export type CreateSiteResponse = {
  site: AdminSiteSummary
  database: string
  /** Add on GitHub as a read-only deploy key before the first build. */
  deployKeyPublic: string
  /** What was done in Cloudflare, or the steps still to do by hand. */
  cloudflare: { done: string[]; manual: string[] }
}

export type AuditEntrySummary = {
  at: number
  actor: 'cli' | 'admin-api'
  action: string
  target: string | null
  ok: boolean
  error: string | null
}

export function isBuildState(value: unknown): value is BuildState {
  return (
    value === 'queued' ||
    value === 'building' ||
    value === 'ready' ||
    value === 'error' ||
    value === 'canceled'
  )
}

/** Keys cactus-host owns in every site's env file. They cannot be written or removed over the API. */
export const RESERVED_ENV_KEYS: readonly string[] = [
  'CACTUS_HOSTING_PROVIDER',
  'CACTUS_HOST_TOKEN',
  'CACTUS_HOST_SITE_ID',
  'CACTUS_HOST_URL',
  'CACTUS_HOST_ADMIN_TOKEN',
  'PORT',
  'NODE_ENV',
]

/** Env var names as POSIX shells and systemd accept them. */
export const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
