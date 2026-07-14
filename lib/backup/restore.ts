import type { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { clearUnreadableSecrets, type SecretsReconcileResult } from '@/lib/backup/secrets'

// Restore a database from a Cactus SQL backup produced by
// GET /api/admin/backup/database. That backup is a single .sql file: a schema
// section (the init migration, verbatim), a data section of INSERT statements -
// one topologically-sorted block per table - and a sequence section of setval()
// calls.
//
// The target database always already has the schema - core tables are applied
// at build time by `prisma migrate deploy`, and any installed module's tables by
// its own migrations - so restore never runs the schema section. It wipes the
// existing rows and replays only the backup's INSERTs and setvals, inside a
// single all-or-nothing transaction. If anything fails the whole thing rolls back
// and the live data is left untouched.
//
// INSERTs for a table that doesn't exist on the target (a module that was
// installed on the source site but not here) are skipped and reported rather
// than aborting the restore. A COLUMN mismatch is different - that means the two
// sites are on different versions of Cactus - and is reported as a clear error
// BEFORE anything is wiped, rather than dying halfway with a raw Postgres error.

// Prisma's own migration ledger. Never wiped - dropping it would make the next
// `prisma migrate deploy` try to re-apply the init migration onto tables that
// already exist, and fail the build.
const PRESERVED_TABLES = new Set(['_prisma_migrations'])

export type RestoreResult = {
  tablesRestored: string[]
  rowsInserted: number
  skippedTables: string[]
  sequencesRestored: string[]
  /** Secrets the backup carried that this install's ENCRYPTION_KEY cannot read, and
   *  which have therefore been cleared. Plain English - the owner has to act on it. */
  clearedSecrets: string[]
  /** False if this site has no usable ENCRYPTION_KEY, so no secret could be tested. */
  secretsChecked: boolean
}

type TargetColumn = { name: string; required: boolean }

// Splits a Cactus backup into individual SQL statements.
//
// The backup format is constrained and known: single-quoted string literals
// with '' escaping, no dollar-quoting, no E'' escapes (standard_conforming_strings
// is on), and `--` line comments between statements. A naive split on ';' or on
// newlines is wrong because a text/JSON value can contain either inside a string
// literal, so this walks the text tracking string state and skips line comments.
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let inString = false

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]

    if (inString) {
      current += ch
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          // Escaped quote - stays in the string, consume both chars.
          current += "'"
          i++
        } else {
          inString = false
        }
      }
      continue
    }

    // Outside a string: strip `--` line comments so they never get glued onto
    // the front of the following statement (which would defeat the INSERT filter).
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++
      continue
    }

    if (ch === "'") {
      inString = true
      current += ch
      continue
    }

    if (ch === ';') {
      const trimmed = current.trim()
      if (trimmed) statements.push(trimmed)
      current = ''
      continue
    }

    current += ch
  }

  const tail = current.trim()
  if (tail) statements.push(tail)
  return statements
}

export function insertTargetTable(statement: string): string | null {
  const match = /^INSERT\s+INTO\s+"([^"]+)"/i.exec(statement)
  return match ? match[1]! : null
}

// The column list is the first parenthesised group after the table name, and it
// only ever contains quoted identifiers - no nested parens to worry about.
export function insertColumns(statement: string): string[] {
  const match = /^INSERT\s+INTO\s+"[^"]+"\s*\(([^)]*)\)/i.exec(statement)
  if (!match?.[1]) return []
  return match[1]
    .split(',')
    .map((c) => c.trim().replace(/^"|"$/g, ''))
    .filter(Boolean)
}

export function setvalTargetSequence(statement: string): string | null {
  const match = /^SELECT\s+setval\(\s*'"?([^'"]+)"?'/i.exec(statement)
  return match ? match[1]! : null
}

async function getExistingTables(db: PrismaClient): Promise<Set<string>> {
  const rows = await db.$queryRawUnsafe<{ table_name: string }[]>(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `)
  return new Set(rows.map((r) => r.table_name))
}

async function getExistingSequences(db: PrismaClient): Promise<Set<string>> {
  const rows = await db.$queryRawUnsafe<{ sequencename: string }[]>(
    `SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'`,
  )
  return new Set(rows.map((r) => r.sequencename))
}

// `required` = the INSERT must supply it: NOT NULL, no default, and not computed
// by Postgres. Anything else can safely be left out of a backup's column list.
async function getTargetColumns(db: PrismaClient): Promise<Map<string, TargetColumn[]>> {
  const rows = await db.$queryRawUnsafe<
    {
      table_name: string
      column_name: string
      is_nullable: string
      column_default: string | null
      is_generated: string
      identity_generation: string | null
    }[]
  >(`
    SELECT table_name, column_name, is_nullable, column_default, is_generated, identity_generation
    FROM information_schema.columns WHERE table_schema = 'public'
  `)
  const map = new Map<string, TargetColumn[]>()
  for (const row of rows) {
    const list = map.get(row.table_name) ?? []
    list.push({
      name: row.column_name,
      required:
        row.is_nullable === 'NO' &&
        row.column_default === null &&
        row.is_generated === 'NEVER' &&
        row.identity_generation === null,
    })
    map.set(row.table_name, list)
  }
  return map
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function listForHumans(items: string[]): string {
  const shown = items.slice(0, 3).map((i) => `"${i}"`)
  const rest = items.length - shown.length
  const joined = shown.join(', ')
  return rest > 0 ? `${joined} and ${rest} more` : joined
}

// Catches the two ways a backup and a site can disagree about the shape of a
// table, and says so in English BEFORE anything is truncated. Without this the
// restore dies mid-transaction with a raw Postgres error and the owner has no
// idea what to do about it.
function assertSchemasMatch(
  columnsInBackup: Map<string, Set<string>>,
  targetColumns: Map<string, TargetColumn[]>,
): void {
  const backupHasExtra: string[] = []
  const backupIsMissing: string[] = []

  for (const [table, backupCols] of columnsInBackup) {
    const target = targetColumns.get(table) ?? []
    const targetNames = new Set(target.map((c) => c.name))

    for (const col of backupCols) {
      if (!targetNames.has(col)) backupHasExtra.push(`${table}.${col}`)
    }
    for (const col of target) {
      if (col.required && !backupCols.has(col.name)) backupIsMissing.push(`${table}.${col.name}`)
    }
  }

  if (backupHasExtra.length > 0) {
    throw new Error(
      `This backup was made on a NEWER version of Cactus than this site is running. ` +
        `It carries data this site has nowhere to put (${listForHumans(backupHasExtra)}). ` +
        `Update this site to the latest version of Cactus first, then restore the backup again. ` +
        `Nothing has been changed.`,
    )
  }

  if (backupIsMissing.length > 0) {
    throw new Error(
      `This backup was made on an OLDER version of Cactus and is missing information this site now ` +
        `requires (${listForHumans(backupIsMissing)}). Restore it onto a site running the version it ` +
        `was taken from, and update that site afterwards. Nothing has been changed.`,
    )
  }
}

/**
 * Wipe the current database and reload it from a Cactus SQL backup.
 *
 * Destructive: every existing row (except Prisma's migration ledger) is removed
 * and replaced with the backup's contents. Runs in one transaction, so a failure
 * anywhere leaves the database exactly as it was.
 *
 * @param db  defaults to the app's Prisma singleton; the round-trip test passes
 *            its own client pointed at a throwaway database.
 * @throws if the file contains no recognisable INSERT statements (guards against
 *         wiping the database on the strength of an empty or wrong file), or if
 *         the backup and this site disagree about any table's columns.
 */
export async function restoreDatabaseFromSql(
  sql: string,
  db: PrismaClient = prisma,
): Promise<RestoreResult> {
  const allStatements = splitSqlStatements(sql)
  const inserts = allStatements.filter((s) => /^INSERT\s+INTO/i.test(s))
  const setvals = allStatements.filter((s) => /^SELECT\s+setval\s*\(/i.test(s))

  if (inserts.length === 0) {
    throw new Error(
      "This file doesn't look like a Cactus backup - no data was found in it.",
    )
  }

  const [existingTables, existingSequences, targetColumns] = await Promise.all([
    getExistingTables(db),
    getExistingSequences(db),
    getTargetColumns(db),
  ])

  const skippedTables = new Set<string>()
  const restoredTables = new Set<string>()
  const columnsInBackup = new Map<string, Set<string>>()
  const runnableInserts: string[] = []
  for (const statement of inserts) {
    const table = insertTargetTable(statement)
    if (!table) continue
    if (!existingTables.has(table)) {
      skippedTables.add(table)
      continue
    }
    runnableInserts.push(statement)
    restoredTables.add(table)
    // Every chunk for a table repeats the same column list, so a set is enough.
    const cols = columnsInBackup.get(table) ?? new Set<string>()
    for (const col of insertColumns(statement)) cols.add(col)
    columnsInBackup.set(table, cols)
  }

  // Before anything destructive happens.
  assertSchemasMatch(columnsInBackup, targetColumns)

  const restoredSequences: string[] = []
  const runnableSetvals: string[] = []
  for (const statement of setvals) {
    const sequence = setvalTargetSequence(statement)
    // A sequence belonging to a module this site hasn't installed is skipped for
    // the same reason its tables are.
    if (!sequence || !existingSequences.has(sequence)) continue
    runnableSetvals.push(statement)
    restoredSequences.push(sequence)
  }

  // Wipe every table the target actually has (bar the preserved ones), not just
  // the ones named in the backup, so tables that were empty at backup time end
  // up empty here too - a faithful point-in-time restore, not a merge.
  const tablesToTruncate = [...existingTables].filter((t) => !PRESERVED_TABLES.has(t))

  let rowsInserted = 0
  let secrets: SecretsReconcileResult = { checked: false, cleared: [] }
  await db.$transaction(
    async (tx) => {
      if (tablesToTruncate.length > 0) {
        const list = tablesToTruncate.map(quoteIdent).join(', ')
        await tx.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
      }
      // The backup orders tables parent-before-child and self-referencing rows
      // parent-before-child, so replaying INSERTs in file order satisfies every
      // foreign key without deferring constraints.
      for (const statement of runnableInserts) {
        rowsInserted += await tx.$executeRawUnsafe(statement)
      }
      // Next: the sequence counters. TRUNCATE ... RESTART IDENTITY has just reset
      // any table-owned sequence to its start, and standalone ones (the shop's
      // order numbers) were never touched by it, so both need setting either way.
      for (const statement of runnableSetvals) {
        await tx.$executeRawUnsafe(statement)
      }
      // Last: throw out any secret that came from an install whose encryption key
      // this site doesn't have. Restoring onto a fresh install is the ordinary
      // case, and a fresh install always has a different key - see secrets.ts.
      secrets = await clearUnreadableSecrets(tx)
    },
    { maxWait: 15_000, timeout: 55_000 },
  )

  return {
    tablesRestored: [...restoredTables].sort(),
    rowsInserted,
    skippedTables: [...skippedTables].sort(),
    sequencesRestored: restoredSequences.sort(),
    clearedSecrets: secrets.cleared,
    secretsChecked: secrets.checked,
  }
}
