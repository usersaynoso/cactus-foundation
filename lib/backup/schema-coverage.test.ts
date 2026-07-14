import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'
import { isSupportedUdtName } from './serialize'

// Static, network-free proof that the backup serialiser has a branch for every
// column type that actually exists in the schema - init migration AND every
// module migration. Parses the raw .sql rather than querying a live database, so
// it runs in plain `npm test` with no key, no server, no skip.
//
// This exists because the round-trip test (roundtrip.test.ts) is the one that
// proves restore actually WORKS, but it needs NEON_API_KEY and is gated on
// RUN_BACKUP_ROUNDTRIP=1 - a missing key makes it report "skipped", not "failed",
// and a skip that reads as green is exactly the gap a new column type could slip
// through. This test has no such escape hatch: any column whose type the
// serialiser doesn't recognise fails `npm test` outright, on the PR that added it,
// which the round-trip test would only ever catch if someone remembered to run it.

const INIT_MIGRATION = path.join(process.cwd(), 'prisma/migrations/20260626000000_init/migration.sql')
const MODULES_DIR = path.join(process.cwd(), 'modules')

type ParsedColumn = { table: string; column: string; sqlType: string; file: string }

// Maps the SQL type syntax Prisma's migration generator emits (see the init
// migration and every module's migrations/*.sql) to the udt_name Postgres would
// report for it via information_schema - the same identifier serializeValue
// switches on. Anything not listed here IS the point of the test: a genuinely new
// type shows up as "unmapped" rather than silently passing.
const SQL_TYPE_TO_UDT: Record<string, string> = {
  TEXT: 'text',
  VARCHAR: 'varchar',
  CHAR: 'bpchar',
  BOOLEAN: 'bool',
  INTEGER: 'int4',
  SMALLINT: 'int2',
  BIGINT: 'int8',
  'DOUBLE PRECISION': 'float8',
  REAL: 'float4',
  NUMERIC: 'numeric',
  DECIMAL: 'numeric',
  TIMESTAMP: 'timestamp',
  TIMESTAMPTZ: 'timestamptz',
  DATE: 'date',
  TIME: 'time',
  BYTEA: 'bytea',
  JSON: 'json',
  JSONB: 'jsonb',
  UUID: 'uuid',
  INET: 'inet',
  CITEXT: 'citext',
}

function listModuleMigrationFiles(): string[] {
  let modules: string[]
  try {
    modules = readdirSync(MODULES_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  } catch {
    return [] // No modules checked out locally - fine, this machine has nothing to check.
  }
  const files: string[] = []
  for (const mod of modules) {
    const dir = path.join(MODULES_DIR, mod, 'migrations')
    let entries: string[]
    try {
      entries = readdirSync(dir).filter((f) => f.endsWith('.sql'))
    } catch {
      continue
    }
    for (const f of entries) files.push(path.join(dir, f))
  }
  return files
}

// Strips a trailing array marker and quotes, and resolves a bare identifier that
// isn't a known SQL type to an enum reference (Prisma emits enum columns as
// `"colName" "EnumTypeName"`).
function resolveType(
  rawType: string,
  enumNames: Set<string>,
): { udtName: string; isEnum: boolean } | null {
  const isArray = /\[\]\s*$/.test(rawType)
  const base = rawType.replace(/\[\]\s*$/, '').trim()

  // "TypeName" quoted -> either a known builtin written unusually, or an enum.
  const quoted = /^"([^"]+)"$/.exec(base)
  if (quoted) {
    const name = quoted[1]!
    if (enumNames.has(name)) return { udtName: isArray ? `_${name}` : name, isEnum: true }
    return null // Quoted but not a recognised enum - shouldn't happen; treat as unmapped.
  }

  // Strip a (n) / (p,s) precision suffix - NUMERIC(10,2), VARCHAR(255), TIMESTAMP(3).
  const withoutPrecision = base.replace(/\(\d+(?:,\s*\d+)?\)\s*$/, '').trim().toUpperCase()
  const udt = SQL_TYPE_TO_UDT[withoutPrecision]
  if (!udt) return null
  return { udtName: isArray ? `_${udt}` : udt, isEnum: false }
}

function parseEnumNames(sql: string): Set<string> {
  const names = new Set<string>()
  for (const m of sql.matchAll(/CREATE\s+TYPE\s+"([^"]+)"\s+AS\s+ENUM/gi)) names.add(m[1]!)
  return names
}

// Column lines inside a CREATE TABLE body: `"colName" TYPE ...` - stops before a
// bare CONSTRAINT/PRIMARY/FOREIGN/UNIQUE/CHECK line, which never starts with a
// quoted identifier followed immediately by a type.
function parseCreateTableColumns(sql: string, file: string): ParsedColumn[] {
  const out: ParsedColumn[] = []
  for (const tableMatch of sql.matchAll(/CREATE\s+TABLE\s+"([^"]+)"\s*\(([\s\S]*?)\n\);/gi)) {
    const table = tableMatch[1]!
    const body = tableMatch[2]!
    for (const line of body.split('\n')) {
      const colMatch = /^\s*"([^"]+)"\s+([A-Za-z0-9_" ()[\],.]+?)\s*(?:NOT NULL|NULL|DEFAULT|,\s*$|$)/.exec(
        line,
      )
      if (!colMatch) continue
      const column = colMatch[1]!
      const sqlType = colMatch[2]!.trim()
      out.push({ table, column, sqlType, file })
    }
  }
  return out
}

// `ALTER TABLE "t" ADD COLUMN IF NOT EXISTS "col" TYPE ...` - later module
// migrations add columns this way rather than via a fresh CREATE TABLE.
function parseAlterTableColumns(sql: string, file: string): ParsedColumn[] {
  const out: ParsedColumn[] = []
  const re =
    /ALTER\s+TABLE\s+"([^"]+)"\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"\s+([A-Za-z0-9_" ()[\],.]+?)\s*(?:NOT NULL|NULL|DEFAULT|;)/gi
  for (const m of sql.matchAll(re)) {
    out.push({ table: m[1]!, column: m[2]!, sqlType: m[3]!.trim(), file })
  }
  return out
}

function allMigrationFiles(): string[] {
  return [INIT_MIGRATION, ...listModuleMigrationFiles()]
}

describe('backup serialiser covers every column type in the real schema', () => {
  it('has a branch for every column type declared across all migrations', () => {
    const files = allMigrationFiles()
    expect(files.length, 'no migration files found - check the paths in this test').toBeGreaterThan(0)

    const columns: ParsedColumn[] = []
    const enumNames = new Set<string>()
    for (const file of files) {
      const sql = readFileSync(file, 'utf8')
      for (const name of parseEnumNames(sql)) enumNames.add(name)
    }
    for (const file of files) {
      const sql = readFileSync(file, 'utf8')
      columns.push(...parseCreateTableColumns(sql, file))
      columns.push(...parseAlterTableColumns(sql, file))
    }
    expect(columns.length, 'parsed zero columns - the parser regex has drifted from the SQL format').toBeGreaterThan(50)

    const unmapped: string[] = []
    const unsupported: string[] = []
    for (const col of columns) {
      const resolved = resolveType(col.sqlType, enumNames)
      if (!resolved) {
        unmapped.push(`${path.basename(col.file)}: ${col.table}.${col.column} (${col.sqlType})`)
        continue
      }
      if (!isSupportedUdtName(resolved.udtName, resolved.isEnum)) {
        unsupported.push(`${path.basename(col.file)}: ${col.table}.${col.column} (${col.sqlType})`)
      }
    }

    // "Unmapped" = this test's own SQL-syntax-to-udt table doesn't recognise the
    // type (test needs updating). "Unsupported" = the test understood it fine,
    // but lib/backup/serialize.ts has no branch for it (the serialiser needs
    // updating, or someone chose a genuinely new column type without checking).
    expect(unmapped, 'add these SQL types to SQL_TYPE_TO_UDT in this test').toEqual([])
    expect(
      unsupported,
      'these column types have no branch in lib/backup/serialize.ts - the backup ' +
        'would throw UnsupportedColumnError on them today. Add support before shipping.',
    ).toEqual([])
  })
})
