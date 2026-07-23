import { Prisma } from '@prisma/client'

import { serializeValue, UnrestorableBackupError, type ColumnType } from '@/lib/backup/serialize'

// Builds a Cactus database backup: a single .sql file holding a schema section
// (the init migration, verbatim) followed by a data section of INSERT statements,
// one topologically-sorted block per table, and finally a sequence section that
// restores each sequence's counter.
//
// Everything is discovered at request time from information_schema / pg_catalog
// rather than hardcoded, so module-added tables (shop, boards, gazette, etc.) are
// included without this file needing edits.
//
// Two tables are deliberately excluded (see getTables): `_prisma_migrations` and
// `ModuleMigration`. Both are build-time bookkeeping about the PHYSICAL schema of
// the database they live in, not portable content. A module's actual tables are
// created by its own migrations at build time and are NOT part of this backup's
// schema section - so carrying its ModuleMigration ledger into a restore would
// leave the target claiming those tables were applied while they don't exist,
// after which the migration runner skips them forever. The ledger stays home.
//
// Lives here rather than in the route so the round-trip test can drive it against
// a throwaway database (see roundtrip.test.ts).

const ROWS_PER_INSERT = 500

// The whole dump runs inside a single interactive transaction so every read sees
// one consistent snapshot (see buildBackupSql). Default Prisma interactive
// transactions time out after 5s, which a full-database read would blow through,
// so we widen it to sit just under the route's maxDuration of 60s.
const TRANSACTION_MAX_WAIT_MS = 10_000
const TRANSACTION_TIMEOUT_MS = 58_000

/** The slice of a transaction client the read helpers need. Inside an interactive
 *  transaction Prisma hands back a client WITHOUT `$transaction` (it's on the deny
 *  list), so this is deliberately narrower than BackupDb. */
export type BackupTx = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>
}

/** The slice of PrismaClient this file needs - lets a test pass its own client.
 *  Must expose `$transaction` so the dump can take a single consistent snapshot. */
export type BackupDb = BackupTx & {
  $transaction<R>(
    fn: (tx: BackupTx) => Promise<R>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel
      maxWait?: number
      timeout?: number
    },
  ): Promise<R>
}

type Row = Record<string, unknown>
type ForeignKey = { table: string; column: string; refTable: string; refColumn: string }
type Sequence = { name: string; lastValue: bigint | null; startValue: bigint }

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function getTables(db: BackupTx): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ table_name: string }[]>(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name NOT IN ('_prisma_migrations', 'ModuleMigration')
    ORDER BY table_name
  `)
  return rows.map((r) => r.table_name)
}

/** Enum type names, so `serializeValue` can tell a `PageStatus` column from an unknown type. */
async function getEnumTypes(db: BackupTx): Promise<Set<string>> {
  const rows = await db.$queryRawUnsafe<{ typname: string }[]>(`
    SELECT t.typname FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typtype = 'e' AND n.nspname = 'public'
  `)
  return new Set(rows.map((r) => r.typname))
}

// Generated and identity columns are computed by Postgres and CANNOT be inserted
// into ("cannot insert into column ... it is a generated column"), so they are
// excluded from the dump entirely. None exist today; a module could add one.
async function getColumns(db: BackupTx, tables: string[], enums: Set<string>): Promise<Map<string, ColumnType[]>> {
  const rows = await db.$queryRawUnsafe<{ table_name: string; column_name: string; udt_name: string }[]>(
    `SELECT table_name, column_name, udt_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY($1)
       AND is_generated = 'NEVER' AND identity_generation IS NULL
     ORDER BY table_name, ordinal_position`,
    tables,
  )
  const map = new Map<string, ColumnType[]>()
  for (const row of rows) {
    const list = map.get(row.table_name) ?? []
    // For an array column the enum-ness that matters is the ELEMENT type's.
    const elementUdt = row.udt_name.replace(/^_/, '')
    list.push({
      table: row.table_name,
      column: row.column_name,
      udtName: row.udt_name,
      isEnum: enums.has(elementUdt),
    })
    map.set(row.table_name, list)
  }
  return map
}

async function getPrimaryKeys(db: BackupTx, tables: string[]): Promise<Map<string, string[]>> {
  const rows = await db.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
    `SELECT tc.table_name, kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public' AND tc.table_name = ANY($1)
     ORDER BY tc.table_name, kcu.ordinal_position`,
    tables,
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
async function getForeignKeys(db: BackupTx, tables: string[]): Promise<ForeignKey[]> {
  const rows = await db.$queryRawUnsafe<
    { table_name: string; column_name: string; ref_table: string; ref_column: string }[]
  >(
    `SELECT tc.table_name, kcu.column_name, ccu.table_name AS ref_table, ccu.column_name AS ref_column
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND tc.table_name = ANY($1)`,
    tables,
  )
  const tableSet = new Set(tables)
  return rows
    .filter((r) => tableSet.has(r.ref_table))
    .map((r) => ({ table: r.table_name, column: r.column_name, refTable: r.ref_table, refColumn: r.ref_column }))
}

// Sequences are NOT tables, so nothing else in this file would ever see them.
// Missing them meant a restored shop reset shp_order_number_seq to 1 and the next
// checkout generated an order number that already existed - and order_number is
// UNIQUE, so the customer's checkout simply failed.
async function getSequences(db: BackupTx): Promise<Sequence[]> {
  const rows = await db.$queryRawUnsafe<
    { sequencename: string; last_value: bigint | null; start_value: bigint }[]
  >(`SELECT sequencename, last_value, start_value FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename`)
  return rows.map((r) => ({ name: r.sequencename, lastValue: r.last_value, startValue: r.start_value }))
}

// Kahn's algorithm: parent tables (referenced) sort before dependent tables.
// Self-referencing FKs (table === refTable) are skipped here - they'd otherwise
// be a self-loop that can never resolve - and handled at the row level instead.
export function topoSortTables(tables: string[], foreignKeys: ForeignKey[]): string[] {
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

  // A genuine multi-table FK cycle (A references B references A) strands tables
  // here. There is no table-level order that satisfies such a cycle, and plain
  // FKs in this schema are NOT DEFERRABLE, so appending the stranded tables in
  // arbitrary order - which is what this used to do - emits a file that looks
  // perfectly healthy, downloads fine, and then fails its FKs at restore. That
  // is the exact "quiet poison" the backup rules forbid: a loud failure now is
  // recoverable, an unrestorable file discovered months later is not.
  //
  // No such cycle exists in the schema today. If one is ever introduced, this
  // fires on the PR that introduces it rather than in somebody's emergency.
  if (order.length < tables.length) {
    const seen = new Set(order)
    const stranded = tables.filter((t) => !seen.has(t))
    throw new UnrestorableBackupError(
      `the tables ${stranded.join(', ')} form a foreign-key cycle, so there is no order ` +
        `in which their rows can be inserted back.`
    )
  }
  return order
}

// Breadth-first, parents before children, for a table whose rows reference
// their own primary key (e.g. MenuItem.parentId -> MenuItem.id). Plain FKs are
// NOT DEFERRABLE, so a child row's INSERT fails if it lands before its parent's -
// even within the same multi-row statement.
export function sortSelfReferencingRows(rows: Row[], pkCol: string, selfFkCol: string): Row[] {
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

/**
 * Generate the full backup file: schema section, data section, sequence section.
 *
 * @throws UnsupportedColumnError if any column holds something the backup can't
 *         faithfully represent. The whole dump aborts - see serialize.ts.
 */
export async function buildBackupSql(db: BackupDb, schemaSql: string, generatedAt: string): Promise<string> {
  // EVERY read below - schema discovery, each table's rows, and the sequence
  // counters - runs inside ONE interactive transaction at REPEATABLE READ, READ
  // ONLY. Without a shared snapshot the dump was torn: a sequence could be read at
  // N while a row using N+1 was read afterwards (restore rewinds the sequence, next
  // insert collides on a UNIQUE column), or a child row written mid-dump could
  // reference a parent whose table was already read (restore fails the FK). A single
  // REPEATABLE READ snapshot makes all reads agree on one instant, so the file is
  // internally consistent no matter what writes happen while it is being built.
  const { dataSections, sequenceSection } = await db.$transaction(
    async (tx) => {
      // Belt-and-braces: REPEATABLE READ already fixes the snapshot; READ ONLY makes
      // the intent explicit and lets Postgres reject any accidental write. Must be
      // the first statement in the transaction, before any query touches a snapshot.
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')

      const tables = await getTables(tx)
      const enums = await getEnumTypes(tx)
      const [columnsByTable, pkColsByTable, foreignKeys, sequences] = await Promise.all([
        getColumns(tx, tables, enums),
        getPrimaryKeys(tx, tables),
        getForeignKeys(tx, tables),
        getSequences(tx),
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
          (fk) => fk.table === table && fk.refTable === table && fk.refColumn === pkCol,
        )
        if (selfFk) selfRefByTable.set(table, { pkCol, selfFkCol: selfFk.column })
      }

      const dataSections: string[] = []
      for (const table of order) {
        const columns = columnsByTable.get(table) ?? []
        if (columns.length === 0) continue
        const columnList = columns.map((c) => quoteIdent(c.column)).join(', ')

        const rows = await tx.$queryRawUnsafe<Row[]>(`SELECT ${columnList} FROM ${quoteIdent(table)}`)
        if (rows.length === 0) continue

        const selfRef = selfRefByTable.get(table)
        const orderedRows = selfRef ? sortSelfReferencingRows(rows, selfRef.pkCol, selfRef.selfFkCol) : rows

        const insertStatements = chunk(orderedRows, ROWS_PER_INSERT).map((rowsChunk) => {
          const valuesSql = rowsChunk
            .map((row) => `(${columns.map((c) => serializeValue(row[c.column], c)).join(', ')})`)
            .join(',\n')
          return `INSERT INTO ${quoteIdent(table)} (${columnList}) VALUES\n${valuesSql};`
        })
        dataSections.push(`-- Table: ${table} (${rows.length} rows)\n${insertStatements.join('\n')}`)
      }

      // `setval(seq, n, true)` = "n has been handed out, next call returns n+1".
      // `setval(seq, start, false)` = "nothing handed out yet, next call returns start" -
      // which is what a NULL last_value (never called) means.
      const sequenceSection = sequences.map((seq) => {
        const target = seq.lastValue ?? seq.startValue
        const isCalled = seq.lastValue !== null
        return `SELECT setval('${quoteIdent(seq.name).replace(/'/g, "''")}', ${target}, ${isCalled ? 'TRUE' : 'FALSE'});`
      })

      return { dataSections, sequenceSection }
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: TRANSACTION_MAX_WAIT_MS,
      timeout: TRANSACTION_TIMEOUT_MS,
    },
  )

  return [
    '-- Cactus database backup',
    `-- Generated ${generatedAt}`,
    '-- Restore onto a FRESH, empty database: run the schema section below, then the data section.',
    '',
    schemaSql,
    '',
    '-- ============================================================',
    '-- Data',
    '-- ============================================================',
    '',
    ...dataSections,
    '',
    '-- ============================================================',
    '-- Sequences',
    '-- ============================================================',
    '',
    ...sequenceSection,
  ].join('\n')
}
