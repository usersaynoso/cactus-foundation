import { prisma } from '@/lib/db/prisma'

// Restore a database from a Cactus SQL backup produced by
// GET /api/admin/backup/database. That backup is a single .sql file: a schema
// section (the init migration, verbatim) followed by a data section of INSERT
// statements, one topologically-sorted block per table.
//
// The target database always already has the schema - core tables are applied
// at build time by `prisma migrate deploy`, and any installed module's tables by
// its own migrations - so restore never runs the schema section. It wipes the
// existing rows and replays only the backup's INSERTs, inside a single
// all-or-nothing transaction. If anything fails the whole thing rolls back and
// the live data is left untouched.
//
// INSERTs for a table that doesn't exist on the target (a module that was
// installed on the source site but not here) are skipped and reported rather
// than aborting the restore.

// Prisma's own migration ledger. Never wiped - dropping it would make the next
// `prisma migrate deploy` try to re-apply the init migration onto tables that
// already exist, and fail the build.
const PRESERVED_TABLES = new Set(['_prisma_migrations'])

export type RestoreResult = {
  tablesRestored: string[]
  rowsInserted: number
  skippedTables: string[]
}

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

function insertTargetTable(statement: string): string | null {
  const match = /^INSERT\s+INTO\s+"([^"]+)"/i.exec(statement)
  return match ? match[1]! : null
}

async function getExistingTables(): Promise<Set<string>> {
  const rows = await prisma.$queryRawUnsafe<{ table_name: string }[]>(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `)
  return new Set(rows.map((r) => r.table_name))
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

/**
 * Wipe the current database and reload it from a Cactus SQL backup.
 *
 * Destructive: every existing row (except Prisma's migration ledger) is removed
 * and replaced with the backup's contents. Runs in one transaction, so a failure
 * anywhere leaves the database exactly as it was.
 *
 * @throws if the file contains no recognisable INSERT statements (guards against
 *         wiping the database on the strength of an empty or wrong file).
 */
export async function restoreDatabaseFromSql(sql: string): Promise<RestoreResult> {
  const allStatements = splitSqlStatements(sql)
  const inserts = allStatements.filter((s) => /^INSERT\s+INTO/i.test(s))

  if (inserts.length === 0) {
    throw new Error(
      "This file doesn't look like a Cactus backup - no data was found in it.",
    )
  }

  const existingTables = await getExistingTables()

  const skippedTables = new Set<string>()
  const restoredTables = new Set<string>()
  const runnableInserts: string[] = []
  for (const statement of inserts) {
    const table = insertTargetTable(statement)
    if (!table) continue
    if (existingTables.has(table)) {
      runnableInserts.push(statement)
      restoredTables.add(table)
    } else {
      skippedTables.add(table)
    }
  }

  // Wipe every table the target actually has (bar the preserved ones), not just
  // the ones named in the backup, so tables that were empty at backup time end
  // up empty here too - a faithful point-in-time restore, not a merge.
  const tablesToTruncate = [...existingTables].filter((t) => !PRESERVED_TABLES.has(t))

  let rowsInserted = 0
  await prisma.$transaction(
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
    },
    { maxWait: 15_000, timeout: 55_000 },
  )

  return {
    tablesRestored: [...restoredTables].sort(),
    rowsInserted,
    skippedTables: [...skippedTables].sort(),
  }
}
