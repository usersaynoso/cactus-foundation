import { Prisma } from '@prisma/client'

// Renders one column value as a SQL literal for the INSERT statements in a
// Cactus database backup (GET /api/admin/backup/database).
//
// The column's Postgres type is the discriminator, never the shape of the JS
// value. Prisma hands back a plain JS array for BOTH a `text[]` column and a
// `jsonb` column holding a JSON array, and those two need completely different
// literals - `ARRAY['a', 'b']` versus `'["a","b"]'`. Deciding on
// `Array.isArray(value)` alone writes an array literal into a jsonb column and
// Postgres rejects it on restore:
//
//   column "history" is of type jsonb but expression is of type text[]
//
// (InfoPage.history / Layout.history are jsonb columns holding a JSON array of
// past published versions, so any site with a republished page tripped this.)
//
// Postgres names array types after their element type with a leading underscore:
// `text[]` is `_text`, `integer[]` is `_int4`. That underscore is the only
// reliable "this is a SQL array column" signal in information_schema.

// Type name for a cast. Builtin names (`text`, `int4`) are bare; anything with
// uppercase or punctuation - a Prisma enum type like `NotificationType`, say -
// must be quoted or Postgres folds it to lowercase and fails to find it.
function typeRef(udtName: string): string {
  return /^[a-z_][a-z0-9_]*$/.test(udtName)
    ? udtName
    : `"${udtName.replace(/"/g, '""')}"`
}

function quoteLiteral(text: string): string {
  return `'${text.replace(/'/g, "''")}'`
}

export function serializeValue(value: unknown, udtName: string): string {
  if (value === null || value === undefined) return 'NULL'

  // JSON columns first: whatever Prisma parsed out of them - object, array,
  // string, number, boolean - is a JSON *value* and goes back in as a quoted
  // JSON literal, which Postgres casts to json/jsonb on insert.
  if (udtName === 'json' || udtName === 'jsonb') {
    return quoteLiteral(JSON.stringify(value))
  }

  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'string') return quoteLiteral(value)
  if (value instanceof Date) return quoteLiteral(value.toISOString())
  if (value instanceof Prisma.Decimal) return value.toString()
  if (Buffer.isBuffer(value)) return `'\\x${value.toString('hex')}'`

  if (Array.isArray(value) && udtName.startsWith('_')) {
    const baseType = udtName.slice(1) || 'text'
    const cast = `${typeRef(baseType)}[]`
    if (value.length === 0) return `ARRAY[]::${cast}`
    // The cast is not optional on a non-empty array either: bare quoted elements
    // are untyped literals, so `ARRAY['a', 'b']` lands as text[] and an enum[] or
    // uuid[] column refuses it.
    return `ARRAY[${value.map((v) => serializeValue(v, baseType)).join(', ')}]::${cast}`
  }

  // An object in a non-JSON column shouldn't happen, but a JSON literal is the
  // least-worst rendering of one.
  return quoteLiteral(JSON.stringify(value))
}
