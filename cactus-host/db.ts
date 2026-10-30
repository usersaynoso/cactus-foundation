// Databases on the box's own Postgres cluster: one role and one database per site,
// made, listed and backed up without anybody typing psql.
//
// The password for a new role never appears on a command line or in Postgres's own
// log: cactus-host works out the SCRAM-SHA-256 verifier itself and hands Postgres
// that, which is all Postgres would have stored anyway. The password is handed back
// once, inside the connection string, and cactus-host keeps no copy.
//
// Where each database's backups go is recorded in <stateDir>/databases.json, which
// ops/backup-postgres.sh reads through `cactus-host db destination <name>`.

import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { HostConfig } from './config.ts'
import type { DatabaseSummary } from './protocol.ts'
import { writeFileAtomic } from './store.ts'
import { mustRun, type System } from './system.ts'

/** Lower-case letters, digits and underscores, starting with a letter: needs no quoting anywhere. */
export const DB_NAME_PATTERN = /^[a-z][a-z0-9_]{1,40}$/

/** rclone's remote:path, without anything a shell or rclone flag could make something of. */
export const BACKUP_DEST_PATTERN = /^[A-Za-z0-9_.-]+:[A-Za-z0-9_./-]*$/

const RESERVED_NAMES = ['postgres', 'template0', 'template1']

/** A database name from a site name: `my-shop` becomes `my_shop`. */
export function dbNameForSite(siteId: string): string {
  return siteId.replace(/-/g, '_')
}

/**
 * The SCRAM-SHA-256 verifier Postgres stores for a password (RFC 5802 / 7677), in the
 * form `CREATE ROLE ... PASSWORD` accepts verbatim. The password must be plain ASCII,
 * which every password cactus-host makes is, so SASLprep leaves it unchanged.
 */
export function scramVerifier(password: string, salt: Buffer = randomBytes(16), iterations = 4096): string {
  if (!/^[\x21-\x7e]+$/.test(password)) throw new Error('Only plain ASCII passwords are supported')
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256')
  const clientKey = createHmac('sha256', salted).update('Client Key').digest()
  const storedKey = createHash('sha256').update(clientKey).digest()
  const serverKey = createHmac('sha256', salted).update('Server Key').digest()
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`
}

export function connectionString(config: HostConfig, name: string, password: string): string {
  const { host, port } = config.postgres
  return `postgresql://${name}:${password}@${host}:${port}/${name}?connection_limit=10&pool_timeout=20`
}

type Registry = Record<string, { backup: string | null; createdAt: number | null }>

function registryPath(config: HostConfig): string {
  return join(config.stateDir, 'databases.json')
}

function readRegistry(config: HostConfig): Registry {
  try {
    return JSON.parse(readFileSync(registryPath(config), 'utf8')) as Registry
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw err
  }
}

function saveRegistry(config: HostConfig, registry: Registry): void {
  writeFileAtomic(registryPath(config), JSON.stringify(registry, null, 2) + '\n')
}

function checkName(name: string): void {
  if (!DB_NAME_PATTERN.test(name) || RESERVED_NAMES.includes(name)) {
    throw new Error(`"${name}" is not a usable database name: 2 to 41 lower-case letters, digits and underscores, starting with a letter`)
  }
}

function checkDest(dest: string): void {
  if (!BACKUP_DEST_PATTERN.test(dest) || dest.includes('..')) {
    throw new Error(`"${dest}" is not an rclone remote:path`)
  }
}

export class Databases {
  readonly config: HostConfig
  readonly system: System

  constructor(config: HostConfig, system: System) {
    this.config = config
    this.system = system
  }

  /** psql as the cluster's superuser, against the maintenance database, unaligned and tuples only. */
  private psql(what: string, sql: string) {
    return mustRun(this.system, what, 'runuser', [
      '-u', this.config.postgres.osUser, '--',
      'psql', '-X', '-q', '-At', '-F', '\t', '-v', 'ON_ERROR_STOP=1', '-d', 'postgres', '-c', sql,
    ])
  }

  async list(): Promise<DatabaseSummary[]> {
    const { output } = await this.psql(
      'Listing the databases',
      "select datname, pg_get_userbyid(datdba), pg_database_size(datname) from pg_database where not datistemplate and datname <> 'postgres' order by datname"
    )
    const registry = readRegistry(this.config)
    return output
      .split('\n')
      .map((line) => line.split('\t'))
      .filter((f) => f.length === 3 && DB_NAME_PATTERN.test(f[0] as string))
      .map(([name, owner, size]) => ({
        name: name as string,
        owner: owner as string,
        sizeBytes: Number(size),
        backup: registry[name as string]?.backup ?? null,
      }))
  }

  private async exists(name: string): Promise<{ database: boolean; role: boolean }> {
    const { output } = await this.psql(
      'Checking the name is free',
      `select (select count(*) from pg_database where datname = '${name}'), (select count(*) from pg_roles where rolname = '${name}')`
    )
    const [db, role] = output.trim().split('\t')
    return { database: db !== '0', role: role !== '0' }
  }

  /** A new role and database of the same name. The connection string is returned once and kept nowhere. */
  async create(name: string, opts: { backup?: string | null } = {}): Promise<{ database: DatabaseSummary; connectionString: string }> {
    checkName(name)
    if (opts.backup) checkDest(opts.backup)
    const taken = await this.exists(name)
    if (taken.database || taken.role) {
      throw new Error(`A ${taken.database ? 'database' : 'role'} called ${name} already exists on this server`)
    }
    const password = randomBytes(24).toString('hex')
    await this.psql('Creating the role', `CREATE ROLE ${name} LOGIN PASSWORD '${scramVerifier(password)}'`)
    await mustRun(this.system, 'Creating the database', 'runuser', [
      '-u', this.config.postgres.osUser, '--', 'createdb', '--owner', name, name,
    ])
    const registry = readRegistry(this.config)
    registry[name] = { backup: opts.backup ?? null, createdAt: this.system.now() }
    saveRegistry(this.config, registry)
    return {
      database: { name, owner: name, sizeBytes: 0, backup: opts.backup ?? null },
      connectionString: connectionString(this.config, name, password),
    }
  }

  destination(name: string): string | null {
    checkName(name)
    return readRegistry(this.config)[name]?.backup ?? null
  }

  /** As destination(), but null rather than an error for a name this registry could never hold. */
  destinationOrNull(name: string): string | null {
    return DB_NAME_PATTERN.test(name) ? (readRegistry(this.config)[name]?.backup ?? null) : null
  }

  setDestination(name: string, dest: string | null): void {
    checkName(name)
    if (dest) checkDest(dest)
    const registry = readRegistry(this.config)
    registry[name] = { backup: dest, createdAt: registry[name]?.createdAt ?? null }
    saveRegistry(this.config, registry)
  }

  /** One dump now, at the lowest priority, then a copy to the recorded destination if there is one. */
  async backup(name: string): Promise<{ file: string; copiedTo: string | null }> {
    checkName(name)
    if (!(await this.exists(name)).database) throw new Error(`There is no database called ${name} on this server`)
    mkdirSync(this.config.backupDir, { recursive: true, mode: 0o700 })
    const stamp = new Date(this.system.now()).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
    const file = join(this.config.backupDir, `${name}-${stamp}.dump`)
    // pg_dump runs as the cluster's user and writes to stdout; root writes the file, so
    // the dump directory can stay root only. Arguments go in as $1 and $2, never spliced.
    await mustRun(this.system, `Dumping ${name}`, 'sh', [
      '-c',
      'nice -n 19 ionice -c3 runuser -u "$3" -- pg_dump -Fc -d "$1" > "$2.tmp" && mv "$2.tmp" "$2"',
      'sh', name, file, this.config.postgres.osUser,
    ])
    const dest = this.destination(name)
    if (dest) {
      await mustRun(this.system, `Copying ${name} to ${dest}`, 'rclone', [
        'copy', '--include', basename(file), this.config.backupDir, dest,
      ])
    }
    return { file, copiedTo: dest }
  }

  /** One dump into `file`, kept on this server only. Returns its size in bytes. */
  async dumpTo(name: string, file: string): Promise<number> {
    checkName(name)
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
    await mustRun(this.system, `Dumping ${name}`, 'sh', [
      '-c',
      'nice -n 19 ionice -c3 runuser -u "$3" -- pg_dump -Fc -d "$1" > "$2.tmp" && mv "$2.tmp" "$2"',
      'sh', name, file, this.config.postgres.osUser,
    ])
    return statSync(file).size
  }

  /**
   * Puts a dump back in place of a database, all at once. The dump is restored into a
   * new database beside the live one (`<name>__incoming`), which takes the live one's
   * name in a single moment while nobody is connected; the database it replaced waits
   * as `<name>__replaced` until commit() drops it or undo() swaps it back.
   *
   * Restoring over the top of the live database instead would leave behind anything the
   * newer schema added (a table, an index) that the dump does not mention, and the next
   * build's migrations would then trip over it.
   */
  async replaceWithDump(name: string, file: string): Promise<{ commit: () => Promise<void>; undo: () => Promise<void> }> {
    checkName(name)
    const incoming = `${name}__incoming`
    const replaced = `${name}__replaced`
    const { output } = await this.psql(
      'Checking the database',
      `select pg_get_userbyid(datdba), (select count(*) from pg_database where datname = '${replaced}') from pg_database where datname = '${name}'`
    )
    const [owner, leftover] = output.trim().split('\t')
    if (leftover && leftover !== '0') {
      throw new Error(`${replaced} is still on this server from an earlier restore. Check it is not needed, drop it, then try again.`)
    }
    await this.psql('Clearing out an unfinished restore', `DROP DATABASE IF EXISTS ${incoming} WITH (FORCE)`)
    await mustRun(this.system, 'Making a database to restore into', 'runuser', [
      '-u', this.config.postgres.osUser, '--', 'createdb', '--owner', owner && DB_NAME_PATTERN.test(owner) ? owner : name, incoming,
    ])
    try {
      // The dump is root's alone, so it goes in on stdin rather than by name.
      await mustRun(this.system, `Restoring ${name}`, 'sh', [
        '-c',
        'runuser -u "$3" -- pg_restore --exit-on-error --single-transaction -d "$1" < "$2"',
        'sh', incoming, file, this.config.postgres.osUser,
      ])
    } catch (err) {
      await this.psql('Removing the half-restored copy', `DROP DATABASE IF EXISTS ${incoming} WITH (FORCE)`).catch(() => undefined)
      throw err
    }

    const swap = async (from: string, aside: string) => {
      // No new connections, then none at all, so the rename cannot be refused.
      await this.psql(`Closing connections to ${name}`, `ALTER DATABASE ${name} ALLOW_CONNECTIONS false`)
      try {
        await this.psql(`Closing connections to ${name}`, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}' AND pid <> pg_backend_pid()`)
        await this.psql(`Moving ${name} aside`, `ALTER DATABASE ${name} RENAME TO ${aside}`)
      } catch (err) {
        await this.psql(`Reopening ${name}`, `ALTER DATABASE ${name} ALLOW_CONNECTIONS true`).catch(() => undefined)
        throw err
      }
      await this.psql(`Putting ${from} in place`, `ALTER DATABASE ${from} RENAME TO ${name}`)
      await this.psql(`Opening ${name}`, `ALTER DATABASE ${name} ALLOW_CONNECTIONS true`)
    }

    try {
      await swap(incoming, replaced)
    } catch (err) {
      await this.psql('Removing the restored copy', `DROP DATABASE IF EXISTS ${incoming} WITH (FORCE)`).catch(() => undefined)
      throw err
    }
    return {
      commit: async () => {
        await this.psql('Dropping the replaced database', `DROP DATABASE IF EXISTS ${replaced} WITH (FORCE)`)
      },
      undo: async () => {
        await swap(replaced, incoming)
        await this.psql('Dropping the restored copy', `DROP DATABASE IF EXISTS ${incoming} WITH (FORCE)`)
      },
    }
  }
}

/**
 * The database a site's env points at, when it is one on this server's own cluster.
 * Null for no DATABASE_URL, one elsewhere (Neon, Supabase), or one we could not name.
 */
export function localDatabase(config: HostConfig, databaseUrl: string | undefined): string | null {
  if (!databaseUrl) return null
  try {
    const url = new URL(databaseUrl)
    const host = url.hostname.replace(/^\[|\]$/g, '')
    const local = ['localhost', '127.0.0.1', '::1', config.postgres.host]
    if (!local.includes(host)) return null
    if (url.port && Number(url.port) !== config.postgres.port) return null
    const name = decodeURIComponent(url.pathname.replace(/^\//, ''))
    return DB_NAME_PATTERN.test(name) && !RESERVED_NAMES.includes(name) ? name : null
  } catch {
    return null
  }
}
