import { randomBytes } from 'node:crypto'
import { Client } from 'pg'
import {
  TEST_PREFIX,
  connectionUri as vpsConnectionUri,
  createTestDatabase as vpsCreateTestDatabase,
  createTestRole as vpsCreateTestRole,
  dropStaleTestObjects as vpsDropStaleTestObjects,
  dropTestDatabase as vpsDropTestDatabase,
  dropTestRole as vpsDropTestRole,
  vpsConfigFromEnv,
  type TestDatabase,
  type TestRole,
  type VpsConfig,
} from './vps-database'

// Throwaway databases for the tests that need a real Postgres, from either of the
// two places one can be had.
//
// `vps-database.ts` reaches the OVH server over SSH, which is the only Postgres a
// developer here has and is why the live suites are gated on OVH_* credentials.
// That gate is also why those suites have never run in CI - and a suite that only
// runs when somebody remembers to run it is how uk-bookkeeping v0.2.29 shipped a
// query with a reserved word in it, past a green typecheck, a green eslint, 4870
// green tests and a green build gate, none of which execute SQL.
//
// A CI runner has no SSH to that server and does not want one: it has a throwaway
// Postgres of its own, sitting right there as a service container. So this picks a
// backend rather than a server:
//
//   CACTUS_TEST_DATABASE_URL set -> talk to that Postgres directly, as its owner
//   otherwise                    -> the OVH server over SSH, exactly as before
//
// Same operations, same names, same prefix-scoped safety in both. The tests do not
// know which one they got.

export type { TestDatabase, TestRole } from './vps-database'
export { TEST_PREFIX } from './vps-database'

export type TestServer =
  | { kind: 'vps'; cfg: VpsConfig }
  /** A Postgres we can reach on a URI, as a role allowed to CREATE DATABASE and CREATE ROLE. */
  | { kind: 'direct'; adminUri: string }

/**
 * The same rule the SSH backend enforces, restated here because this backend
 * builds its own SQL and must not be the loose one. An object without the prefix
 * belongs to somebody else - on a developer's machine that could be the live
 * site's database, and `DROP DATABASE` does not ask twice.
 */
const SAFE_NAME = /^cactus_rt_[a-z0-9_]{1,48}$/

function assertSafeName(name: string): void {
  if (!SAFE_NAME.test(name)) {
    throw new Error(`Refusing to touch "${name}": throwaway objects must match ${SAFE_NAME}`)
  }
}

/**
 * Which Postgres this run gets.
 *
 * CACTUS_TEST_DATABASE_URL wins when it is set, so CI is explicit about it rather
 * than borrowing whatever DATABASE_URL happens to be pointing at - which, on a
 * developer's machine, is a live customer's database.
 */
export function testServerFromEnv(): TestServer {
  const adminUri = process.env.CACTUS_TEST_DATABASE_URL
  if (adminUri) return { kind: 'direct', adminUri }
  return { kind: 'vps', cfg: vpsConfigFromEnv() }
}

/** One statement batch against the admin connection. Direct backend only. */
async function run(adminUri: string, statements: string): Promise<string[]> {
  const client = new Client({ connectionString: adminUri })
  await client.connect()
  try {
    const result = await client.query(statements)
    const last = Array.isArray(result) ? result[result.length - 1] : result
    return (last?.rows ?? []).map((row: Record<string, unknown>) => String(Object.values(row)[0]))
  } finally {
    await client.end().catch(() => undefined)
  }
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

async function disconnectEveryone(adminUri: string, name: string): Promise<void> {
  await run(
    adminUri,
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
     WHERE datname = ${quoteLiteral(name)} AND pid <> pg_backend_pid();`,
  ).catch(() => [])
}

export async function createTestRole(server: TestServer, name: string): Promise<TestRole> {
  if (server.kind === 'vps') return vpsCreateTestRole(server.cfg, name)
  assertSafeName(name)
  // Hex, so it needs no escaping in a connection URI.
  const password = randomBytes(24).toString('hex')
  await run(
    server.adminUri,
    `DROP ROLE IF EXISTS "${name}";
     CREATE ROLE "${name}" LOGIN PASSWORD ${quoteLiteral(password)} CREATEDB;`,
  )
  return { name, password }
}

export async function createTestDatabase(
  server: TestServer,
  name: string,
  owner: TestRole,
): Promise<TestDatabase> {
  if (server.kind === 'vps') return vpsCreateTestDatabase(server.cfg, name, owner)
  assertSafeName(name)
  assertSafeName(owner.name)
  // CREATE DATABASE cannot run inside a transaction block, so it goes on its own.
  await run(server.adminUri, `CREATE DATABASE "${name}" OWNER "${owner.name}";`)
  return { name, connectionUri: connectionUri(server, name, owner) }
}

export function connectionUri(server: TestServer, database: string, role: TestRole): string {
  if (server.kind === 'vps') return vpsConnectionUri(server.cfg, database, role)
  assertSafeName(database)
  // Built off the admin URI so host, port and TLS match whatever we were handed.
  // The SSH backend hard-codes sslmode=require because that server demands it; a
  // CI service container on localhost has no TLS at all, so copying the admin
  // connection's own settings is the only thing that works in both places.
  const url = new URL(server.adminUri)
  url.username = encodeURIComponent(role.name)
  url.password = encodeURIComponent(role.password)
  url.pathname = `/${database}`
  // The result must carry a query string whether or not the admin URI had one:
  // callers append their own settings with `&uselibpqcompat=true`, and on a URI
  // with no `?` that produces a database name with an ampersand in it rather
  // than a parameter. sslmode=prefer negotiates TLS where the server offers it
  // and connects without where it does not, which covers both the CI service
  // container and a server that insists.
  if (![...url.searchParams.keys()].length) url.searchParams.set('sslmode', 'prefer')
  return url.toString()
}

export async function dropTestDatabase(server: TestServer, name: string): Promise<void> {
  if (server.kind === 'vps') return vpsDropTestDatabase(server.cfg, name)
  assertSafeName(name)
  await disconnectEveryone(server.adminUri, name)
  await run(server.adminUri, `DROP DATABASE IF EXISTS "${name}" WITH (FORCE);`)
}

export async function dropTestRole(server: TestServer, name: string): Promise<void> {
  if (server.kind === 'vps') return vpsDropTestRole(server.cfg, name)
  assertSafeName(name)
  await run(server.adminUri, `DROP ROLE IF EXISTS "${name}";`)
}

/** Sweeps up anything a crashed run left behind. Prefix-scoped, always. */
export async function dropStaleTestObjects(server: TestServer): Promise<void> {
  if (server.kind === 'vps') return vpsDropStaleTestObjects(server.cfg)
  const like = quoteLiteral(`${TEST_PREFIX}%`)
  const databases = await run(
    server.adminUri,
    `SELECT datname FROM pg_database WHERE datname LIKE ${like};`,
  )
  for (const name of databases) {
    await dropTestDatabase(server, name).catch(() => undefined)
  }
  // Roles last: Postgres refuses to drop one that still owns a database.
  const roles = await run(server.adminUri, `SELECT rolname FROM pg_roles WHERE rolname LIKE ${like};`)
  for (const name of roles) {
    await dropTestRole(server, name).catch(() => undefined)
  }
}
