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
  'PORT',
  'NODE_ENV',
]

/** Env var names as POSIX shells and systemd accept them. */
export const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
