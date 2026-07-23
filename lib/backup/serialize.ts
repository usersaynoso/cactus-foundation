import { Prisma } from '@prisma/client'

// Renders one column value as a SQL literal for the INSERT statements in a
// Cactus database backup (GET /api/admin/backup/database).
//
// Two rules run this file, both learned the hard way.
//
// 1. The COLUMN's Postgres type decides the literal, never the shape of the JS
//    value. Prisma hands back a plain JS array for BOTH a `text[]` column and a
//    `jsonb` column holding a JSON array, and those two need completely
//    different literals - `ARRAY['a', 'b']` versus `'["a","b"]'`. Choosing on
//    `Array.isArray(value)` alone wrote array literals into the jsonb
//    `InfoPage.history` / `Layout.history` columns (the capped list of past
//    published versions), and restore then died with
//    `column "history" is of type jsonb but expression is of type text[]`.
//
// 2. NEVER GUESS. An unrecognised column type, or a value that isn't the shape
//    its column's type implies, throws and aborts the whole backup. A backup
//    that fails at download time is an inconvenience; a backup that quietly
//    writes a plausible-looking literal and only fails at RESTORE time fails
//    months later, in an emergency, when the original site may be gone. The old
//    code had a silent "least-worst rendering" fall-through - that is exactly
//    the mechanism that turned a small bug into an unrestorable backup.
//
// Postgres names array types after their element type with a leading underscore:
// `text[]` is `_text`, `integer[]` is `_int4`. That underscore is the only
// reliable "this is a SQL array column" signal in information_schema.

export type ColumnType = {
  table: string
  column: string
  /** `information_schema.columns.udt_name` - `text`, `jsonb`, `_text`, `PageStatus`, ... */
  udtName: string
  /** Whether the type (for an array, its element type) is a Postgres enum. */
  isEnum: boolean
}

/** Thrown when the backup cannot faithfully represent a column. Aborts the dump. */
export class UnsupportedColumnError extends Error {
  constructor(type: ColumnType, detail: string) {
    super(
      `Backup stopped: the "${type.column}" column on "${type.table}" ${detail}. ` +
        `Rather than write a backup file that would fail when you came to restore it, ` +
        `Cactus has stopped. Please report this.`,
    )
    this.name = 'UnsupportedColumnError'
  }
}

// The same "stop rather than write a file that cannot be restored" rule, for a
// problem that is about the shape of the schema rather than one column's type.
export class UnrestorableBackupError extends Error {
  constructor(detail: string) {
    super(
      `Backup stopped: ${detail} ` +
        `Rather than write a backup file that would fail when you came to restore it, ` +
        `Cactus has stopped. Please report this.`,
    )
    this.name = 'UnrestorableBackupError'
  }
}

// Types whose Postgres text representation IS the JS string Prisma returns, so a
// quoted literal round-trips exactly (Postgres coerces the untyped literal to
// the target column's type on INSERT - the same mechanism that makes enum values
// work). Anything not listed here is a type we have never round-trip tested.
const TEXTUAL = new Set([
  'text', 'varchar', 'bpchar', 'char', 'name', 'citext', 'uuid',
  'inet', 'cidr', 'macaddr', 'macaddr8', 'xml', 'tsvector', 'money', 'interval',
])
const INTEGRAL = new Set(['int2', 'int4', 'int8', 'oid'])
const FRACTIONAL = new Set(['numeric', 'float4', 'float8'])
const TEMPORAL = new Set(['timestamp', 'timestamptz'])
// date / time / timetz are NOT textual: Prisma hands them back as a JS Date, not
// a string, so they cannot share the string-only TEXTUAL branch (which would then
// throw UnsupportedColumnError on the very first install carrying a DATE column).
// They also cannot share the TEMPORAL branch, which emits a full ISO datetime - a
// `date` column rejects the time part and a `time` column rejects the date part.
const TIME_OF_DAY = new Set(['date', 'time', 'timetz'])
const JSONISH = new Set(['json', 'jsonb'])

/**
 * Whether the serialiser has a branch for this udt at all - the static
 * schema-coverage test (`schema-coverage.test.ts`) uses this to check every
 * column type in the real migration files WITHOUT touching a database, so a new
 * column type is caught by `npm test` on the PR that adds it, rather than only by
 * the (skippable) round-trip test.
 */
export function isSupportedUdtName(udtName: string, isEnum: boolean): boolean {
  if (JSONISH.has(udtName)) return true
  if (udtName.startsWith('_')) return isSupportedUdtName(udtName.slice(1), isEnum)
  if (udtName === 'bool' || udtName === 'bytea') return true
  if (INTEGRAL.has(udtName) || FRACTIONAL.has(udtName) || TEMPORAL.has(udtName)) return true
  if (TIME_OF_DAY.has(udtName)) return true
  return TEXTUAL.has(udtName) || isEnum
}

function quoteLiteral(text: string): string {
  return `'${text.replace(/'/g, "''")}'`
}

// Bytea comes back from Prisma as a Buffer or a bare Uint8Array depending on the
// query path; both are byte views and hex-encode identically via Buffer.from.
function isBytes(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array
}

// Type name for a cast. Builtin names (`text`, `int4`) go bare; anything with an
// uppercase letter or punctuation - a Prisma enum type like `NotificationType` -
// must be quoted or Postgres folds it to lowercase and can't find the type.
function typeRef(udtName: string): string {
  return /^[a-z_][a-z0-9_]*$/.test(udtName) ? udtName : `"${udtName.replace(/"/g, '""')}"`
}

function describe(value: unknown): string {
  if (value === null) return 'null'
  if (isBytes(value)) return 'binary data'
  if (value instanceof Date) return 'a date'
  if (Array.isArray(value)) return 'a list'
  return typeof value
}

export function serializeValue(value: unknown, type: ColumnType): string {
  if (value === null || value === undefined) return 'NULL'

  const { udtName } = type

  // JSON columns first, before any shape check: whatever Prisma parsed out of
  // them - object, array, string, number, boolean - is a JSON *value*, and goes
  // back in as a quoted JSON literal that Postgres casts to json/jsonb.
  if (JSONISH.has(udtName)) {
    if (isBytes(value) || value instanceof Date || value instanceof Prisma.Decimal) {
      throw new UnsupportedColumnError(type, `holds ${describe(value)} where JSON was expected`)
    }
    return quoteLiteral(JSON.stringify(value))
  }

  // Real Postgres array columns. The cast is not optional: bare quoted elements
  // are untyped literals, so `ARRAY['a', 'b']` lands as text[] and an enum[] or
  // uuid[] column refuses it.
  if (udtName.startsWith('_')) {
    if (!Array.isArray(value)) {
      throw new UnsupportedColumnError(type, `is a list column but holds ${describe(value)}`)
    }
    const elementUdt = udtName.slice(1)
    const elementType: ColumnType = { ...type, udtName: elementUdt }
    const cast = `${typeRef(elementUdt)}[]`
    if (value.length === 0) return `ARRAY[]::${cast}`
    return `ARRAY[${value.map((v) => serializeValue(v, elementType)).join(', ')}]::${cast}`
  }

  if (udtName === 'bool') {
    if (typeof value !== 'boolean') {
      throw new UnsupportedColumnError(type, `is a yes/no column but holds ${describe(value)}`)
    }
    return value ? 'TRUE' : 'FALSE'
  }

  if (udtName === 'bytea') {
    // Prisma's raw queries hand bytea back as a Uint8Array, not always a Buffer,
    // so accept any byte view. (The old Buffer.isBuffer-only check silently fell
    // through to JSON.stringify and corrupted every bytea column in the backup.)
    if (!isBytes(value)) {
      throw new UnsupportedColumnError(type, `is a binary column but holds ${describe(value)}`)
    }
    return `'\\x${Buffer.from(value).toString('hex')}'`
  }

  if (INTEGRAL.has(udtName)) {
    if (typeof value === 'bigint') return value.toString()
    if (typeof value === 'number' && Number.isInteger(value)) return String(value)
    if (typeof value === 'string' && /^-?\d+$/.test(value)) return value
    throw new UnsupportedColumnError(type, `is a whole-number column but holds ${describe(value)}`)
  }

  if (FRACTIONAL.has(udtName)) {
    // Quoted, not bare: it keeps full precision for Decimal, and it is the only
    // way to write NaN / Infinity, which the old code silently turned into NULL.
    if (value instanceof Prisma.Decimal) return quoteLiteral(value.toString())
    if (typeof value === 'bigint') return value.toString()
    if (typeof value === 'number') return quoteLiteral(String(value))
    if (typeof value === 'string') return quoteLiteral(value)
    throw new UnsupportedColumnError(type, `is a number column but holds ${describe(value)}`)
  }

  if (TEMPORAL.has(udtName)) {
    if (value instanceof Date) return quoteLiteral(value.toISOString())
    if (typeof value === 'string') return quoteLiteral(value)
    throw new UnsupportedColumnError(type, `is a date column but holds ${describe(value)}`)
  }

  // date / time / timetz. Prisma returns a JS Date: for `date` the calendar day at
  // UTC midnight; for `time`/`timetz` the time-of-day carried on the 1970-01-01
  // epoch day. A raw path can also hand back the plain string, which we accept as
  // is. We slice the right span out of the ISO form rather than emitting the whole
  // datetime, because the target column type only accepts its own part:
  //   date   -> 'YYYY-MM-DD'
  //   time   -> 'HH:MM:SS.mmm'
  //   timetz -> 'HH:MM:SS.mmm+00'  (a JS Date is an instant with no stored offset,
  //             so the faithful literal is the UTC time-of-day with an explicit
  //             +00 zone; timetz compares by UTC, so the value survives even though
  //             the originally-printed offset is not recoverable from a Date).
  if (TIME_OF_DAY.has(udtName)) {
    if (value instanceof Date) {
      const iso = value.toISOString()
      if (udtName === 'date') return quoteLiteral(iso.slice(0, 10))
      if (udtName === 'timetz') return quoteLiteral(`${iso.slice(11, 23)}+00`)
      return quoteLiteral(iso.slice(11, 23))
    }
    if (typeof value === 'string') return quoteLiteral(value)
    throw new UnsupportedColumnError(type, `is a date/time column but holds ${describe(value)}`)
  }

  if (TEXTUAL.has(udtName) || type.isEnum) {
    if (typeof value !== 'string') {
      throw new UnsupportedColumnError(type, `is a text column but holds ${describe(value)}`)
    }
    return quoteLiteral(value)
  }

  throw new UnsupportedColumnError(
    type,
    `has a database type ("${udtName}") this version of Cactus doesn't know how to back up`,
  )
}
