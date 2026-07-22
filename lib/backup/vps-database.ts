// Throwaway databases on the self-hosted Postgres VPS, for the backup round-trip test.
//
// The round-trip test is destructive by nature - it TRUNCATEs every table and
// replays a dump - so it must never be pointed at a database anybody cares about.
// It therefore creates its own databases, owned by its own throwaway role, and
// drops the lot afterwards. Nothing it touches existed before it ran.
//
// Provisioning happens over SSH as the `postgres` superuser (there is no HTTP
// control plane here, unlike the Neon setup this replaced); the test itself then
// connects to the new databases over the public TLS port like any other client.
//
// Test-only. Nothing in the running app imports this.

import { execFile } from 'child_process'
import { randomBytes } from 'crypto'

export type VpsConfig = {
  host: string
  user: string
  password: string
}

export type TestDatabase = {
  name: string
  connectionUri: string
}

/** Everything this module creates is named with this prefix, and only names carrying
 *  it may be dropped. That is the whole safety story: an object without the prefix
 *  is somebody else's, including the live site's database. */
export const TEST_PREFIX = 'cactus_rt_'

const SAFE_NAME = /^cactus_rt_[a-z0-9_]{1,48}$/

export function vpsConfigFromEnv(): VpsConfig {
  const host = process.env.OVH_SERVER
  const user = process.env.OVH_USER
  const password = process.env.OVH_PASSWORD
  if (!host || !user || !password) {
    throw new Error(
      'The backup round-trip needs the database server: set OVH_SERVER, OVH_USER and OVH_PASSWORD (checked .env)',
    )
  }
  return { host, user, password }
}

function assertSafeName(name: string): void {
  if (!SAFE_NAME.test(name)) {
    throw new Error(`Refusing to touch "${name}": round-trip objects must match ${SAFE_NAME}`)
  }
}

/** Runs a command on the VPS over SSH. The password goes via SSHPASS in the
 *  environment rather than argv, so it never shows up in the process list. */
function ssh(cfg: VpsConfig, command: string, stdin?: string, timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'sshpass',
      [
        '-e',
        'ssh',
        '-o',
        'StrictHostKeyChecking=no',
        '-o',
        'UserKnownHostsFile=/dev/null',
        '-o',
        'LogLevel=ERROR',
        '-o',
        'ConnectTimeout=20',
        `${cfg.user}@${cfg.host}`,
        command,
      ],
      { env: { ...process.env, SSHPASS: cfg.password }, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`VPS command failed: ${stderr || stdout || err.message}`))
          return
        }
        resolve(stdout)
      },
    )
    if (stdin !== undefined) {
      child.stdin?.end(stdin)
    } else {
      child.stdin?.end()
    }
  })
}

/** Runs SQL as the `postgres` superuser. SQL travels on stdin, so nothing needs
 *  quoting through two shells. ON_ERROR_STOP makes a failed statement a failed run. */
async function sql(cfg: VpsConfig, statements: string, database = 'postgres'): Promise<string> {
  return ssh(
    cfg,
    `sudo -n -u postgres psql -v ON_ERROR_STOP=1 -X -q -tA -d ${database} -f -`,
    statements,
  )
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** Cuts every connection to a database so it can be dropped, or cloned as a template. */
async function disconnectEveryone(cfg: VpsConfig, name: string): Promise<void> {
  assertSafeName(name)
  await sql(
    cfg,
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
     WHERE datname = ${quoteLiteral(name)} AND pid <> pg_backend_pid();`,
  )
}

export type TestRole = { name: string; password: string }

export async function createTestRole(cfg: VpsConfig, name: string): Promise<TestRole> {
  assertSafeName(name)
  // Hex, so it needs no escaping in a connection URI.
  const password = randomBytes(24).toString('hex')
  await sql(
    cfg,
    `DROP ROLE IF EXISTS "${name}";
     CREATE ROLE "${name}" LOGIN PASSWORD ${quoteLiteral(password)} CREATEDB;`,
  )
  return { name, password }
}

export async function createTestDatabase(
  cfg: VpsConfig,
  name: string,
  owner: TestRole,
  template?: string,
): Promise<TestDatabase> {
  assertSafeName(name)
  assertSafeName(owner.name)
  if (template) {
    assertSafeName(template)
    // Postgres refuses to copy a template that anyone is connected to.
    await disconnectEveryone(cfg, template)
  }
  const from = template ? ` TEMPLATE "${template}"` : ''
  await sql(cfg, `CREATE DATABASE "${name}" OWNER "${owner.name}"${from};`)
  return { name, connectionUri: connectionUri(cfg, name, owner) }
}

export function connectionUri(cfg: VpsConfig, database: string, role: TestRole): string {
  assertSafeName(database)
  return `postgresql://${role.name}:${role.password}@${cfg.host}:5432/${database}?sslmode=require`
}

export async function dropTestDatabase(cfg: VpsConfig, name: string): Promise<void> {
  assertSafeName(name)
  await disconnectEveryone(cfg, name)
  await sql(cfg, `DROP DATABASE IF EXISTS "${name}" WITH (FORCE);`)
}

export async function dropTestRole(cfg: VpsConfig, name: string): Promise<void> {
  assertSafeName(name)
  await sql(cfg, `DROP ROLE IF EXISTS "${name}";`)
}

/** Sweeps up anything a crashed run left behind, so throwaway databases can't
 *  accumulate on a server that also hosts real ones. Prefix-scoped, always. */
export async function dropStaleTestObjects(cfg: VpsConfig): Promise<void> {
  const like = quoteLiteral(`${TEST_PREFIX}%`)
  const out = await sql(
    cfg,
    `SELECT 'db:' || datname FROM pg_database WHERE datname LIKE ${like}
     UNION ALL
     SELECT 'role:' || rolname FROM pg_roles WHERE rolname LIKE ${like};`,
  )
  const names = out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  for (const entry of names.filter((n) => n.startsWith('db:'))) {
    await dropTestDatabase(cfg, entry.slice(3)).catch(() => {})
  }
  // Roles last: Postgres refuses to drop one that still owns a database.
  for (const entry of names.filter((n) => n.startsWith('role:'))) {
    await dropTestRole(cfg, entry.slice(5)).catch(() => {})
  }
}
