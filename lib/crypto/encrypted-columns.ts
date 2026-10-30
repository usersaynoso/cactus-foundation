// Every database column that holds a lib/crypto/secrets.ts ciphertext, found from
// information_schema so a module's own encrypted columns are covered without core
// knowing about them. Shared by the restore (lib/backup/secrets.ts), which clears
// what a new install cannot read, and the key rotation (lib/crypto/rotation.ts),
// which re-encrypts all of it.
//
// The convention is a name ending in "Encrypted" / "_encrypted". social-hub
// shipped "_enc" before anyone wrote the convention down, so that suffix counts
// too; only text columns, and callers still leave any value alone that is not
// shaped like our ciphertext (looksLikeEncryptedSecret).

/** The slice of PrismaClient this needs - a transaction client will do. */
export type SecretsDb = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>
}

export type EncryptedColumn = { table: string; column: string; nullable: boolean }

export const CHUNK = 500

// Rows are matched on their own ciphertext, chunked so a big site never builds a
// statement with more placeholders than Postgres will take.
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

export function placeholders(count: number, from = 1): string {
  return Array.from({ length: count }, (_, i) => `$${i + from}`).join(', ')
}

export async function getEncryptedColumns(db: SecretsDb): Promise<EncryptedColumn[]> {
  const rows = await db.$queryRawUnsafe<{ table_name: string; column_name: string; is_nullable: string }[]>(`
    SELECT c.table_name, c.column_name, c.is_nullable
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND (c.column_name ILIKE '%encrypted' OR c.column_name ILIKE '%\\_enc')
      AND c.udt_name IN ('text', 'varchar', 'bpchar')
    ORDER BY c.table_name, c.ordinal_position
  `)
  return rows.map((r) => ({
    table: r.table_name,
    column: r.column_name,
    nullable: r.is_nullable === 'YES',
  }))
}

// What the owner is told an area is. Anything not listed is a module's own column
// and is reported by table - technical, but honest, and better than silence.
// Keyed "Table.column".
const LABELS: Record<string, string> = {
  'GithubAppConnection.privateKeyEncrypted': 'the GitHub App connection',
  'GithubAppConnection.webhookSecretEncrypted': 'the GitHub App connection',
  'GithubAppConnection.clientIdEncrypted': 'the GitHub App connection',
  'GithubAppConnection.clientSecretEncrypted': 'the GitHub App connection',
  'User.totpSecretEncrypted': 'authenticator-app sign-in',
  'User.smsOtpPhoneEncrypted': 'sign-in codes by text message',
  'MemberTwoFactor.secretEncrypted': 'member two-factor sign-in',
  'MemberTwoFactor.phoneEncrypted': 'member two-factor sign-in',
  'SiteConfig.pushVapidPrivateEncrypted': 'browser push notifications',
  'SiteConfig.derivationSaltEncrypted': 'anonymous visitor ids',
  'EncryptionKey.keyEncrypted': 'previous encryption keys',
}

/** The owner-facing name for the area a column belongs to. */
export function areaLabel(table: string, column: string): string {
  return LABELS[`${table}.${column}`] ?? `stored secrets in ${table}`
}
