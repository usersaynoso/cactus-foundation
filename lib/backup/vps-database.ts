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

/**
 * How old a throwaway object must be before a sweep may drop it.
 *
 * The sweep is for the wreckage of runs that died before their own cleanup. It
 * used to take everything carrying the prefix, which included the databases of
 * whatever OTHER run happened to be in progress - so two agents running live
 * suites at once destroyed each other's databases mid-`beforeAll`. That arrives
 * as `57P01 ... terminating connection due to administrator command` partway
 * through applying the schema, reads exactly like a broken migration, and is
 * nothing of the kind. Both runs then retry and kill each other again.
 *
 * Two hours is far longer than the slowest suite here (minutes) and far shorter
 * than leaving a shared server littered.
 */
const STALE_AFTER_MS = 2 * 60 * 60 * 1000

/**
 * Written onto every database and role as it is created, and read back by the
 * sweep.
 *
 * Postgres records no creation time for either, and the names carry no usable
 * one - some suites stamp them with `Date.now()`, some with the process id, some
 * with a truncated clock - so the age has to be put somewhere the server keeps
 * it. A shared comment survives in `pg_shdescription`, needs no table of our own,
 * and disappears with the object.
 */
function creationNote(): string {
  return `cactus throwaway test object, created ${Date.now()}`
}

/** Pulls the epoch back out of that comment, inside SQL. */
const CREATED_AT_SQL = "'created ([0-9]+)'"

/**
 * A tag unique to this process, put on the end of every name it creates.
 *
 * Without it two runs share a namespace, because the suites name their objects
 * off `Date.now()` and two processes started together land on the same
 * millisecond far more often than that sounds - it happened on the first attempt
 * here, giving `test:inbox-merge` and `test:inbox-guards` the same role name.
 * The second run's `DROP ROLE IF EXISTS` then reset the first run's password
 * underneath it, and the first run failed with "password authentication failed",
 * which says nothing whatsoever about the real cause.
 *
 * Six hex characters, so the odds of two runs sharing one are about one in
 * sixteen million, and they would have to collide on the clock as well.
 */
const RUN_TAG = randomBytes(3).toString('hex')

/**
 * The name this process actually uses for a caller's name.
 *
 * Idempotent, which is what lets it be applied at every entry point without
 * bookkeeping: a name that already carries this run's tag - `role.name` handed
 * back from `createTestRole`, a template named from a previous call - comes back
 * unchanged, and a caller's own string gets the tag put on it. Both therefore
 * resolve to the same object, so a suite can drop by whichever it kept.
 *
 * The caller's name is checked before the tag goes on and the result after it,
 * so neither the prefix guard nor the length limit is loosened by this.
 */
function runScoped(name: string): string {
  assertSafeName(name)
  if (name.endsWith(`_${RUN_TAG}`)) return name
  const scoped = `${name}_${RUN_TAG}`
  assertSafeName(scoped)
  return scoped
}

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

/**
 * Failures that happened BEFORE the remote command could run.
 *
 * The distinction is the whole safety of retrying. Authentication and connection
 * failures happen before sshd ever forks the command, so nothing ran and running
 * it again is free. A command that failed ON the server - a psql ERROR, a bad
 * exit code - may have done half its work, and repeating it is how a migration
 * gets applied one and a half times.
 */
const PRE_AUTH_FAILURE =
  /Permission denied|Connection closed by|kex_exchange_identification|Connection refused|Connection timed out|Broken pipe|Too many authentication failures/i

/**
 * How long to wait before trying again, in milliseconds.
 *
 * Longer than it looks like it needs to be, and deliberately. OpenSSH 9.8 and
 * later carry PerSourcePenalties, on by default: one failed authentication earns
 * the SOURCE ADDRESS a penalty - the server's own log says "activating ipv4
 * penalty of 16 seconds for penalty: failed authentication" - and for the length
 * of it every connection from that address is dropped before it can authenticate,
 * correct password or not. A quick retry lands inside that window, fails, and
 * lengthens the penalty. So the first wait clears a 16 second penalty with room
 * to spare, and the second clears the longer one a second offence earns.
 */
const RETRY_BACKOFF_MS = [21_000, 45_000]

/**
 * One ssh at a time, per process.
 *
 * Measured, not guessed: thirty sequential connections from this same code fail
 * none of the time, and forty at a concurrency of eight fail thirteen. sshpass
 * drives ssh through a pty it has to watch for the password prompt, and under
 * concurrency it loses that race and lets ssh send an EMPTY password - visible on
 * the server as a "Failed password" with no PAM check behind it, because
 * PermitEmptyPasswords is off and sshd refuses it without asking PAM. Those
 * spurious failures are what earn the penalty above, so serialising is not a
 * politeness to the server: it is what stops us locking ourselves out.
 */
let sshQueue: Promise<unknown> = Promise.resolve()

function ssh(cfg: VpsConfig, command: string, stdin?: string, timeoutMs = 120_000): Promise<string> {
  const run = sshQueue.then(
    () => sshWithRetry(cfg, command, stdin, timeoutMs),
    () => sshWithRetry(cfg, command, stdin, timeoutMs),
  )
  // The queue must not inherit this call's rejection, or one failure would
  // reject every command queued behind it.
  sshQueue = run.catch(() => undefined)
  return run
}

async function sshWithRetry(
  cfg: VpsConfig,
  command: string,
  stdin: string | undefined,
  timeoutMs: number,
): Promise<string> {
  let last: unknown
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await sshOnce(cfg, command, stdin, timeoutMs)
    } catch (error) {
      last = error
      const message = error instanceof Error ? error.message : String(error)
      const wait = RETRY_BACKOFF_MS[attempt]
      if (wait === undefined || !PRE_AUTH_FAILURE.test(message)) break
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }
  throw last
}

/** Runs a command on the VPS over SSH. The password goes via SSHPASS in the
 *  environment rather than argv, so it never shows up in the process list. */
function sshOnce(cfg: VpsConfig, command: string, stdin?: string, timeoutMs = 120_000): Promise<string> {
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
        // This is a password login by design. Left to itself ssh offers every key
        // in the agent first, and a dev machine with a handful of them burns
        // through the server's MaxAuthTries before it ever reaches the password.
        '-o',
        'PubkeyAuthentication=no',
        '-o',
        'PreferredAuthentications=password',
        `${cfg.user}@${cfg.host}`,
        command,
      ],
      {
        // SSH_ASKPASS_REQUIRE=never: the test runner has no controlling terminal,
        // and with DISPLAY set (any Mac with XQuartz installed) ssh would rather
        // shell out to a graphical ssh-askpass than read the pty sshpass hands
        // it - which fails as "exec(/usr/X11R6/bin/ssh-askpass): No such file"
        // and then three "Permission denied" retries with no password at all.
        env: { ...process.env, SSHPASS: cfg.password, SSH_ASKPASS_REQUIRE: 'never' },
        timeout: timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
      },
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
  const scoped = runScoped(name)
  // Hex, so it needs no escaping in a connection URI.
  const password = randomBytes(24).toString('hex')
  // The DROP is still here because a name can genuinely be left over from THIS
  // machine's own earlier run - ledger-guards names its role off the process id,
  // and process ids come round again. With the run tag on the name it can only
  // ever be one of ours.
  await sql(
    cfg,
    `DROP ROLE IF EXISTS "${scoped}";
     CREATE ROLE "${scoped}" LOGIN PASSWORD ${quoteLiteral(password)} CREATEDB;
     COMMENT ON ROLE "${scoped}" IS ${quoteLiteral(creationNote())};`,
  )
  return { name: scoped, password }
}

export async function createTestDatabase(
  cfg: VpsConfig,
  name: string,
  owner: TestRole,
  template?: string,
): Promise<TestDatabase> {
  const scoped = runScoped(name)
  const ownerName = runScoped(owner.name)
  if (template) {
    // Postgres refuses to copy a template that anyone is connected to.
    await disconnectEveryone(cfg, runScoped(template))
  }
  const from = template ? ` TEMPLATE "${runScoped(template)}"` : ''
  await sql(
    cfg,
    `CREATE DATABASE "${scoped}" OWNER "${ownerName}"${from};
     COMMENT ON DATABASE "${scoped}" IS ${quoteLiteral(creationNote())};`,
  )
  return { name: scoped, connectionUri: connectionUri(cfg, scoped, owner) }
}

/**
 * Where the CLIENT should connect, which is not always where the server is.
 *
 * Provisioning goes over SSH and the test then connects to Postgres directly,
 * which is right everywhere the direct port is open. It is not open everywhere:
 * a network that allows 22 and quietly swallows 5432 leaves the TCP handshake
 * succeeding and the protocol timing out, which reads exactly like a database
 * that is down and is not one. Where that happens the way through is an SSH
 * tunnel, and these two say where its near end is:
 *
 *   ssh -N -L 55432:127.0.0.1:5432 user@server
 *   OVH_DB_HOST=127.0.0.1 OVH_DB_PORT=55432 npm run test:backup-roundtrip
 *
 * Unset - which is every ordinary run - this is the server itself on 5432 and
 * nothing about the suites changes. TLS is still required either way: the
 * server presents its certificate through the tunnel the same as without one.
 */
function clientEndpoint(cfg: VpsConfig): { host: string; port: string } {
  return {
    host: process.env.OVH_DB_HOST || cfg.host,
    port: process.env.OVH_DB_PORT || '5432',
  }
}

export function connectionUri(cfg: VpsConfig, database: string, role: TestRole): string {
  const { host, port } = clientEndpoint(cfg)
  return `postgresql://${runScoped(role.name)}:${role.password}@${host}:${port}/${runScoped(database)}?sslmode=require`
}

export async function dropTestDatabase(cfg: VpsConfig, name: string): Promise<void> {
  await dropDatabaseExactly(cfg, runScoped(name))
}

export async function dropTestRole(cfg: VpsConfig, name: string): Promise<void> {
  await dropRoleExactly(cfg, runScoped(name))
}

/** The drops with no run tag put on the name, for the sweep - which is the one
 *  caller holding names that belong to OTHER runs and must pass them through
 *  untouched. Everything else goes through the two above. */
async function dropDatabaseExactly(cfg: VpsConfig, name: string): Promise<void> {
  assertSafeName(name)
  await disconnectEveryone(cfg, name)
  await sql(cfg, `DROP DATABASE IF EXISTS "${name}" WITH (FORCE);`)
}

async function dropRoleExactly(cfg: VpsConfig, name: string): Promise<void> {
  assertSafeName(name)
  await sql(cfg, `DROP ROLE IF EXISTS "${name}";`)
}

/**
 * Sweeps up what a crashed run left behind, WITHOUT touching a run in progress.
 *
 * Scope is two rules, both of which have to hold:
 *
 *   1. the name carries `cactus_rt_` - the prefix guard has never moved, because
 *      an object without it is somebody else's, and on this server that includes
 *      `neondb`, which is the live Deskwell site;
 *   2. the object is at least STALE_AFTER_MS old, by the creation time stamped
 *      into its comment when it was made.
 *
 * Rule 2 is what makes concurrent runs safe: a suite that started ten minutes
 * ago is not old enough to be swept, so another agent starting a suite now sweeps
 * only genuine wreckage and leaves the live run alone. The run tag on every name
 * is the other half of that - it stops two runs claiming the same object in the
 * first place.
 *
 * An object carrying no stamp predates this and cannot be aged, so it is dropped
 * only while nothing at all is connected to it - which a run in progress always
 * is, through its Prisma client.
 *
 * Failures to drop are swallowed on purpose: a sweep is housekeeping, and one
 * stubborn leftover must not fail the suite that was only tidying up first.
 */
export async function dropStaleTestObjects(cfg: VpsConfig): Promise<void> {
  const like = quoteLiteral(`${TEST_PREFIX}%`)
  const cutoff = Date.now() - STALE_AFTER_MS
  const out = await sql(
    cfg,
    `WITH throwaway AS (
       SELECT 'db' AS kind,
              d.datname AS name,
              substring(shobj_description(d.oid, 'pg_database') from ${CREATED_AT_SQL}) AS created,
              EXISTS (SELECT 1 FROM pg_stat_activity a WHERE a.datname = d.datname) AS busy
         FROM pg_database d
        WHERE d.datname LIKE ${like}
       UNION ALL
       SELECT 'role',
              r.rolname,
              substring(shobj_description(r.oid, 'pg_authid') from ${CREATED_AT_SQL}),
              EXISTS (SELECT 1 FROM pg_stat_activity a WHERE a.usename = r.rolname)
         FROM pg_roles r
        WHERE r.rolname LIKE ${like}
     )
     SELECT kind || ':' || name
       FROM throwaway
      WHERE CASE WHEN created IS NULL THEN NOT busy ELSE created::bigint < ${cutoff} END;`,
  )
  const names = out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  for (const entry of names.filter((n) => n.startsWith('db:'))) {
    await dropDatabaseExactly(cfg, entry.slice(3)).catch(() => {})
  }
  // Roles last: Postgres refuses to drop one that still owns a database.
  for (const entry of names.filter((n) => n.startsWith('role:'))) {
    await dropRoleExactly(cfg, entry.slice(5)).catch(() => {})
  }
}
