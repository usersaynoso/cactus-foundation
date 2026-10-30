// cactus-host's own configuration: /etc/cactus-host/config.json, every key optional.
//
// Defaults describe the box the runbook builds. A key the file sets with the wrong
// type is refused at start-up rather than half-honoured - a typo in a memory limit
// should stop the service with a message, not run every build unbounded.

import { readFileSync } from 'node:fs'
import { DEFAULT_LISTEN_PORT } from './protocol.ts'

export type HostConfig = {
  listenHost: string
  listenPort: number
  /** Each site's files: /srv/cactus/<site>/. */
  sitesRoot: string
  /** cactus-host's own records: site registry, build history, logs, repo mirrors. Root only. */
  stateDir: string
  /** Deploy keys and the SSH known_hosts file. Root only. */
  keysDir: string
  /** Where each site's Caddy file is written. The main Caddyfile imports *.caddy from here. */
  caddySitesDir: string
  /** How to make Caddy pick up a changed site file. A reload is graceful. */
  caddyReload: string[]
  systemdDir: string
  nodeBin: string
  npmBin: string
  /** The server's public IPv4, shown in the setup wizard's DNS step. */
  publicAddress: string | null
  /** Cloudflare origin certificate for Caddy, when sites sit behind Cloudflare's proxy. */
  tls: { cert: string; key: string } | null
  /** First port handed out; each site takes two (one per slot). */
  basePort: number
  /** Releases kept on disk per site, the live one included. */
  keepReleases: number
  build: {
    /** systemd CPUQuota, e.g. "400%" = four cores' worth. */
    cpuQuota: string
    memoryMax: string
    nice: number
    timeoutMinutes: number
  }
  /** Limits for each running site process. */
  site: { memoryMax: string; nodeMaxOldSpaceMb: number }
  /** How long a stopped release is given to finish in-flight requests and after() work. */
  stopTimeoutSeconds: number
  healthTimeoutSeconds: number
  /** The Postgres cluster on this box: the OS user that may run psql as the superuser, and where sites reach it. */
  postgres: { osUser: string; host: string; port: number }
  /** Where `cactus-host db backup` writes its dumps. Shared with ops/backup-postgres.sh. */
  backupDir: string
  /** Cloudflare origin certificates, readable by Caddy: <zone>.pem and <zone>.key. */
  tlsDir: string
  /**
   * A Cloudflare API token, in a root-only file, for `site create`'s DNS and certificate
   * steps. A scoped token (Zone: DNS Edit, Zone: SSL and Certificates Edit) - never an
   * account's global key. Without it, `site create` prints those steps instead.
   */
  cloudflare: { apiTokenFile: string } | null
  /**
   * Let's Encrypt through certbot's DNS-01 challenge, for domains no other certificate
   * covers (certificates.ts). `credentialsFile` is certbot's dns-cloudflare credentials
   * file, read by certbot only, never by cactus-host. Null turns it off.
   */
  letsEncrypt: { credentialsFile: string; email: string | null; liveDir: string; deployHook: string } | null
}

export const DEFAULT_CONFIG_PATH = '/etc/cactus-host/config.json'

export const DEFAULT_CONFIG: HostConfig = {
  listenHost: '127.0.0.1',
  listenPort: DEFAULT_LISTEN_PORT,
  sitesRoot: '/srv/cactus',
  stateDir: '/var/lib/cactus-host',
  keysDir: '/etc/cactus-host/keys',
  caddySitesDir: '/etc/caddy/sites',
  caddyReload: ['systemctl', 'reload', 'caddy'],
  systemdDir: '/etc/systemd/system',
  nodeBin: '/usr/bin/node',
  npmBin: '/usr/bin/npm',
  publicAddress: null,
  tls: null,
  basePort: 3100,
  keepReleases: 5,
  build: { cpuQuota: '400%', memoryMax: '6G', nice: 10, timeoutMinutes: 30 },
  site: { memoryMax: '3G', nodeMaxOldSpaceMb: 2048 },
  stopTimeoutSeconds: 90,
  healthTimeoutSeconds: 120,
  postgres: { osUser: 'postgres', host: 'localhost', port: 5432 },
  backupDir: '/var/backups/cactus-db',
  tlsDir: '/etc/caddy/tls',
  cloudflare: null,
  letsEncrypt: null,
}

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pick<T>(source: Json, key: string, fallback: T, check: (v: unknown) => boolean, where: string): T {
  if (!(key in source)) return fallback
  const value = source[key]
  if (!check(value)) throw new Error(`cactus-host config: "${where}${key}" has the wrong type`)
  return value as T
}

const isString = (v: unknown) => typeof v === 'string' && v.length > 0
const isPort = (v: unknown) => Number.isInteger(v) && (v as number) > 0 && (v as number) < 65536
const isPositiveInt = (v: unknown) => Number.isInteger(v) && (v as number) > 0
const isInt = (v: unknown) => Number.isInteger(v)
const isStringList = (v: unknown) => Array.isArray(v) && v.length > 0 && v.every(isString)
const isNullableString = (v: unknown) => v === null || isString(v)
const isTls = (v: unknown) => v === null || (isObject(v) && isString(v.cert) && isString(v.key))
const isCloudflare = (v: unknown) => v === null || (isObject(v) && isString(v.apiTokenFile))
const isLetsEncrypt = (v: unknown) =>
  v === null ||
  (isObject(v) &&
    isString(v.credentialsFile) &&
    (v.email === undefined || isNullableString(v.email)) &&
    (v.liveDir === undefined || isString(v.liveDir)) &&
    (v.deployHook === undefined || isString(v.deployHook)))

function letsEncrypt(raw: Json): HostConfig['letsEncrypt'] {
  const value = pick<Json | null>(raw, 'letsEncrypt', null, isLetsEncrypt, '')
  if (!value) return null
  return {
    credentialsFile: value.credentialsFile as string,
    email: (value.email as string | null | undefined) ?? null,
    liveDir: (value.liveDir as string | undefined) ?? '/etc/letsencrypt/live',
    deployHook: (value.deployHook as string | undefined) ?? '/usr/local/bin/cactus-host cert renewed',
  }
}

export function parseConfig(raw: unknown): HostConfig {
  if (!isObject(raw)) throw new Error('cactus-host config: the file must hold a JSON object')
  const d = DEFAULT_CONFIG
  const build = isObject(raw.build) ? raw.build : {}
  const site = isObject(raw.site) ? raw.site : {}
  const postgres = isObject(raw.postgres) ? raw.postgres : {}
  if ('postgres' in raw && !isObject(raw.postgres)) throw new Error('cactus-host config: "postgres" must be an object')
  if ('build' in raw && !isObject(raw.build)) throw new Error('cactus-host config: "build" must be an object')
  if ('site' in raw && !isObject(raw.site)) throw new Error('cactus-host config: "site" must be an object')
  return {
    listenHost: pick(raw, 'listenHost', d.listenHost, isString, ''),
    listenPort: pick(raw, 'listenPort', d.listenPort, isPort, ''),
    sitesRoot: pick(raw, 'sitesRoot', d.sitesRoot, isString, ''),
    stateDir: pick(raw, 'stateDir', d.stateDir, isString, ''),
    keysDir: pick(raw, 'keysDir', d.keysDir, isString, ''),
    caddySitesDir: pick(raw, 'caddySitesDir', d.caddySitesDir, isString, ''),
    caddyReload: pick(raw, 'caddyReload', d.caddyReload, isStringList, ''),
    systemdDir: pick(raw, 'systemdDir', d.systemdDir, isString, ''),
    nodeBin: pick(raw, 'nodeBin', d.nodeBin, isString, ''),
    npmBin: pick(raw, 'npmBin', d.npmBin, isString, ''),
    publicAddress: pick(raw, 'publicAddress', d.publicAddress, isNullableString, ''),
    tls: pick(raw, 'tls', d.tls, isTls, ''),
    basePort: pick(raw, 'basePort', d.basePort, isPort, ''),
    keepReleases: pick(raw, 'keepReleases', d.keepReleases, (v) => isPositiveInt(v) && (v as number) >= 2, ''),
    build: {
      cpuQuota: pick(build, 'cpuQuota', d.build.cpuQuota, isString, 'build.'),
      memoryMax: pick(build, 'memoryMax', d.build.memoryMax, isString, 'build.'),
      nice: pick(build, 'nice', d.build.nice, isInt, 'build.'),
      timeoutMinutes: pick(build, 'timeoutMinutes', d.build.timeoutMinutes, isPositiveInt, 'build.'),
    },
    site: {
      memoryMax: pick(site, 'memoryMax', d.site.memoryMax, isString, 'site.'),
      nodeMaxOldSpaceMb: pick(site, 'nodeMaxOldSpaceMb', d.site.nodeMaxOldSpaceMb, isPositiveInt, 'site.'),
    },
    stopTimeoutSeconds: pick(raw, 'stopTimeoutSeconds', d.stopTimeoutSeconds, isPositiveInt, ''),
    healthTimeoutSeconds: pick(raw, 'healthTimeoutSeconds', d.healthTimeoutSeconds, isPositiveInt, ''),
    postgres: {
      osUser: pick(postgres, 'osUser', d.postgres.osUser, isString, 'postgres.'),
      host: pick(postgres, 'host', d.postgres.host, isString, 'postgres.'),
      port: pick(postgres, 'port', d.postgres.port, isPort, 'postgres.'),
    },
    backupDir: pick(raw, 'backupDir', d.backupDir, isString, ''),
    tlsDir: pick(raw, 'tlsDir', d.tlsDir, isString, ''),
    cloudflare: pick(raw, 'cloudflare', d.cloudflare, isCloudflare, ''),
    letsEncrypt: letsEncrypt(raw),
  }
}

/** Reads the config file. A missing file means every default. */
export function loadConfig(path: string = DEFAULT_CONFIG_PATH): HostConfig {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ...DEFAULT_CONFIG }
    throw err
  }
  return parseConfig(JSON.parse(text) as unknown)
}
