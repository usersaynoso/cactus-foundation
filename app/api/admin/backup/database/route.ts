import { readFileSync } from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { serializeValue } from '@/lib/backup/serialize'
import { getSessionFromCookie } from '@/lib/auth/session'
import { isAdmin } from '@/lib/permissions/check'

// Full logical SQL backup (schema + data) of the live database, generated on
// demand and streamed straight to the browser - no object storage provider
// involved. Restore target is always a fresh, empty database: run the schema
// section (identical to prisma/migrations/20260626000000_init/migration.sql),
// then the data section.
//
// Table set and foreign keys are discovered at request time via
// information_schema rather than hardcoded, so module-added tables (shop,
// boards, gazette, etc.) are always included without this file needing edits.

export const maxDuration = 60

const SCHEMA_MIGRATION_PATH = path.join(
  process.cwd(),
  'prisma/migrations/20260626000000_init/migration.sql'
)
const ROWS_PER_INSERT = 500

type Row = Record<string, unknown>
type ColumnInfo = { name: string; udtName: string }
type ForeignKey = { table: string; column: string; refTable: string; refColumn: string }

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function getTables(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ table_name: string }[]>(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name != '_prisma_migrations'
    ORDER BY table_name
  `)
  return rows.map((r) => r.table_name)
}

async function getColumns(tables: string[]): Promise<Map<string, ColumnInfo[]>> {
  const rows = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string; udt_name: string }[]>(
    `SELECT table_name, column_name, udt_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY($1)
     ORDER BY table_name, ordinal_position`,
    tables
  )
  const map = new Map<string, ColumnInfo[]>()
  for (const row of rows) {
    const list = map.get(row.table_name) ?? []
    list.push({ name: row.column_name, udtName: row.udt_name })
    map.set(row.table_name, list)
  }
  return map
}

async function getPrimaryKeys(tables: string[]): Promise<Map<string, string[]>> {
  const rows = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
    `SELECT tc.table_name, kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public' AND tc.table_name = ANY($1)
     ORDER BY tc.table_name, kcu.ordinal_position`,
    tables
  )
  const map = new Map<string, string[]>()
  for (const row of rows) {
    const list = map.get(row.table_name) ?? []
    list.push(row.column_name)
    map.set(row.table_name, list)
  }
  return map
}

// Scoped to the discovered table set - a FK pointing outside `public` (or at a
// table we didn't enumerate) is defensively ignored rather than crashing the dump.
async function getForeignKeys(tables: string[]): Promise<ForeignKey[]> {
  const rows = await prisma.$queryRawUnsafe<
    { table_name: string; column_name: string; ref_table: string; ref_column: string }[]
  >(
    `SELECT tc.table_name, kcu.column_name, ccu.table_name AS ref_table, ccu.column_name AS ref_column
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND tc.table_name = ANY($1)`,
    tables
  )
  const tableSet = new Set(tables)
  return rows
    .filter((r) => tableSet.has(r.ref_table))
    .map((r) => ({ table: r.table_name, column: r.column_name, refTable: r.ref_table, refColumn: r.ref_column }))
}

// Kahn's algorithm: parent tables (referenced) sort before dependent tables.
// Self-referencing FKs (table === refTable) are skipped here - they'd otherwise
// be a self-loop that can never resolve - and handled at the row level instead.
function topoSortTables(tables: string[], foreignKeys: ForeignKey[]): string[] {
  const dependents = new Map<string, Set<string>>()
  const inDegree = new Map<string, number>()
  for (const table of tables) {
    dependents.set(table, new Set())
    inDegree.set(table, 0)
  }
  for (const fk of foreignKeys) {
    if (fk.table === fk.refTable) continue
    const deps = dependents.get(fk.refTable)
    if (!deps || deps.has(fk.table)) continue
    deps.add(fk.table)
    inDegree.set(fk.table, (inDegree.get(fk.table) ?? 0) + 1)
  }

  const queue = tables.filter((t) => inDegree.get(t) === 0)
  const order: string[] = []
  while (queue.length) {
    const table = queue.shift() as string
    order.push(table)
    for (const dependent of dependents.get(table) ?? []) {
      const remaining = (inDegree.get(dependent) ?? 1) - 1
      inDegree.set(dependent, remaining)
      if (remaining === 0) queue.push(dependent)
    }
  }

  // Defensive fallback: a genuine multi-table FK cycle (not expected in this
  // schema) would strand tables here. Append them rather than silently
  // dropping data - restore may need manual reordering in that exotic case.
  if (order.length < tables.length) {
    const seen = new Set(order)
    for (const table of tables) if (!seen.has(table)) order.push(table)
  }
  return order
}

// Breadth-first, parents before children, for a table whose rows reference
// their own primary key (e.g. MenuItem.parentId -> MenuItem.id). Plain FKs are
// NOT DEFERRABLE, so a child row's INSERT fails if it lands before its parent's -
// even within the same multi-row statement.
function sortSelfReferencingRows(rows: Row[], pkCol: string, selfFkCol: string): Row[] {
  const childrenByParentKey = new Map<string, Row[]>()
  const queue: Row[] = []
  for (const row of rows) {
    const parentVal = row[selfFkCol]
    if (parentVal === null || parentVal === undefined) {
      queue.push(row)
    } else {
      const key = String(parentVal)
      const list = childrenByParentKey.get(key) ?? []
      list.push(row)
      childrenByParentKey.set(key, list)
    }
  }

  const ordered: Row[] = []
  while (queue.length) {
    const row = queue.shift() as Row
    ordered.push(row)
    const key = String(row[pkCol])
    for (const child of childrenByParentKey.get(key) ?? []) queue.push(child)
  }

  // Defensive: shouldn't happen against a live FK-enforced table, but never
  // silently drop rows if traversal somehow misses any.
  if (ordered.length < rows.length) {
    const seen = new Set(ordered)
    for (const row of rows) if (!seen.has(row)) ordered.push(row)
  }
  return ordered
}

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!isAdmin(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let schemaSql: string
  try {
    schemaSql = readFileSync(SCHEMA_MIGRATION_PATH, 'utf8')
  } catch {
    return NextResponse.json({ error: 'Could not read database schema file' }, { status: 500 })
  }

  const tables = await getTables()
  const [columnsByTable, pkColsByTable, foreignKeys] = await Promise.all([
    getColumns(tables),
    getPrimaryKeys(tables),
    getForeignKeys(tables),
  ])

  const order = topoSortTables(tables, foreignKeys)

  // A table qualifies for row-level reordering only when it has a single-column
  // primary key and a foreign key that references that same column on itself.
  const selfRefByTable = new Map<string, { pkCol: string; selfFkCol: string }>()
  for (const table of tables) {
    const pkCols = pkColsByTable.get(table) ?? []
    const pkCol = pkCols[0]
    if (pkCols.length !== 1 || pkCol === undefined) continue
    const selfFk = foreignKeys.find(
      (fk) => fk.table === table && fk.refTable === table && fk.refColumn === pkCol
    )
    if (selfFk) selfRefByTable.set(table, { pkCol, selfFkCol: selfFk.column })
  }

  const dataSections: string[] = []
  for (const table of order) {
    const columns = columnsByTable.get(table) ?? []
    if (columns.length === 0) continue
    const columnList = columns.map((c) => quoteIdent(c.name)).join(', ')

    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT ${columnList} FROM ${quoteIdent(table)}`
    )
    if (rows.length === 0) continue

    const selfRef = selfRefByTable.get(table)
    const orderedRows = selfRef ? sortSelfReferencingRows(rows, selfRef.pkCol, selfRef.selfFkCol) : rows

    const udtByColumn = new Map(columns.map((c) => [c.name, c.udtName]))
    const insertStatements = chunk(orderedRows, ROWS_PER_INSERT).map((rowsChunk) => {
      const valuesSql = rowsChunk
        .map(
          (row) =>
            `(${columns.map((c) => serializeValue(row[c.name], udtByColumn.get(c.name) ?? 'text')).join(', ')})`
        )
        .join(',\n')
      return `INSERT INTO ${quoteIdent(table)} (${columnList}) VALUES\n${valuesSql};`
    })
    dataSections.push(`-- Table: ${table} (${rows.length} rows)\n${insertStatements.join('\n')}`)
  }

  const timestamp = new Date().toISOString()
  const sql = [
    '-- Cactus database backup',
    `-- Generated ${timestamp}`,
    '-- Restore onto a FRESH, empty database: run the schema section below, then the data section.',
    '',
    schemaSql,
    '',
    '-- ============================================================',
    '-- Data',
    '-- ============================================================',
    '',
    ...dataSections,
  ].join('\n')

  return new NextResponse(sql, {
    headers: {
      'Content-Type': 'application/sql',
      'Content-Disposition': `attachment; filename="cactus-backup-${timestamp.replace(/[:.]/g, '-')}.sql"`,
    },
  })
}
