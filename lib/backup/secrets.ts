import { isEncryptionKeyUsable, looksLikeEncryptedSecret, tryDecryptSecret } from '@/lib/crypto/secrets'

// Secrets that came out of somebody else's install.
//
// A handful of columns hold AES-256-GCM ciphertext (lib/crypto/secrets.ts) keyed
// on ENCRYPTION_KEY. That key is minted fresh per install - setup generates a
// random one and writes it to Vercel - but a backup file is portable. So the
// ordinary act of restoring a site onto a NEW install lands a pile of ciphertext
// that this site's key cannot read, and never will: the old key is not in the
// backup, and putting it there would be a fine way to hand the site's secrets to
// anyone who gets hold of the file.
//
// Left in place, those values are worse than absent. A GithubAppConnection row
// makes the site report "GitHub is connected" while every call to GitHub dies
// with OpenSSL's "Unsupported state or unable to authenticate data" - which is
// precisely what a restored site used to show its owner when they tried to
// update Cactus or open the module directory. A two-factor enrolment is worse
// still: it points at a secret nobody on earth can produce a code for.
//
// So after a restore has replayed the data, this walks every encrypted column
// the database has (discovered from information_schema, so a module's own
// encrypted columns are covered without this file knowing about them) and tries
// to actually decrypt each value. Whatever this install cannot read is cleared,
// and the owner is told, in English, what they need to set up again.
//
// Runs inside the restore's transaction: if any of it fails, the restore rolls
// back and the site is left exactly as it was.

/** The slice of PrismaClient this needs - restore passes its transaction client. */
export type SecretsDb = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>
}

export type SecretsReconcileResult = {
  /** False when this install has no usable ENCRYPTION_KEY, so nothing could be tested. */
  checked: boolean
  /** Plain-English list of what had to be cleared, for the owner to act on. */
  cleared: string[]
}

type EncryptedColumn = { table: string; column: string; nullable: boolean }

const CHUNK = 500

// Rows are matched on their own ciphertext, chunked so a big site never builds a
// statement with more placeholders than Postgres will take.
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function placeholders(count: number, from = 1): string {
  return Array.from({ length: count }, (_, i) => `$${i + from}`).join(', ')
}

// Clearing a secret without clearing the state that depended on it just moves the
// problem: an admin whose totpVerifiedAt survives is offered an authenticator step
// at login that can never succeed. Keyed "Table.column".
const COMPANION_CLEARS: Record<string, string[]> = {
  'User.totpSecretEncrypted': [`${quoteIdent('totpVerifiedAt')} = NULL`, `${quoteIdent('totpLastStep')} = NULL`],
}

// What the owner is told to set up again. Anything not listed is a module's own
// column and is reported by name - technical, but honest, and better than silence.
const LABELS: Record<string, string> = {
  'GithubAppConnection.privateKeyEncrypted': 'the GitHub App connection',
  'User.totpSecretEncrypted': 'authenticator-app sign-in',
  'User.smsOtpPhoneEncrypted': 'sign-in codes by text message',
}

function describe(key: string, rows: number): string {
  const label = LABELS[key] ?? `stored secrets in ${key}`
  return rows > 1 ? `${label} (${rows} accounts)` : label
}

// Only columns whose name ends in "Encrypted" - the convention every encrypted
// column in this schema follows - and only text ones. Modules are expected to
// keep to it; one that does gets this protection for free.
async function getEncryptedColumns(db: SecretsDb): Promise<EncryptedColumn[]> {
  const rows = await db.$queryRawUnsafe<{ table_name: string; column_name: string; is_nullable: string }[]>(`
    SELECT c.table_name, c.column_name, c.is_nullable
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name ILIKE '%encrypted'
      AND c.udt_name IN ('text', 'varchar', 'bpchar')
    ORDER BY c.table_name, c.ordinal_position
  `)
  return rows.map((r) => ({
    table: r.table_name,
    column: r.column_name,
    nullable: r.is_nullable === 'YES',
  }))
}

/**
 * The values in this column that this install cannot decrypt.
 *
 * A value that isn't even shaped like our ciphertext is left well alone - it was
 * written by something other than `encryptSecret`, and guessing at what it means
 * is exactly the sort of thing that quietly destroys data.
 */
async function unreadableValues(db: SecretsDb, col: EncryptedColumn): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ value: string }[]>(
    `SELECT DISTINCT ${quoteIdent(col.column)} AS value FROM ${quoteIdent(col.table)}
     WHERE ${quoteIdent(col.column)} IS NOT NULL`,
  )
  return rows
    .map((r) => r.value)
    .filter((v) => typeof v === 'string' && looksLikeEncryptedSecret(v) && tryDecryptSecret(v) === null)
}

// Two-factor rows need their own handling, because member sign-in REFUSES an
// account with no two-factor config at all ("required but not yet configured").
// Deleting a dead enrolment would therefore lock the member out just as surely as
// leaving it. Instead the row is demoted to the EMAIL method, which needs no
// stored secret: the member still has to pass a second factor, they just get a
// code by email until they re-enrol their authenticator or phone.
async function repairMemberTwoFactor(db: SecretsDb, table: string): Promise<number> {
  const rows = await db.$queryRawUnsafe<
    { id: string; memberId: string; secretEncrypted: string | null; phoneEncrypted: string | null }[]
  >(`SELECT "id", "memberId", "secretEncrypted", "phoneEncrypted" FROM ${quoteIdent(table)}`)

  const isDead = (v: string | null) => !!v && looksLikeEncryptedSecret(v) && tryDecryptSecret(v) === null
  const dead = rows.filter((r) => isDead(r.secretEncrypted) || isDead(r.phoneEncrypted))
  if (dead.length === 0) return 0

  const deadIds = new Set(dead.map((r) => r.id))
  const liveMembers = new Set(rows.filter((r) => !deadIds.has(r.id)).map((r) => r.memberId))

  const toDemote: string[] = []
  const toDelete: string[] = []
  const demotedMembers = new Set<string>()
  for (const row of dead) {
    // Something readable still stands for this member (an EMAIL config, or an
    // enrolment made under the current key), so the dead row is just clutter.
    if (liveMembers.has(row.memberId) || demotedMembers.has(row.memberId)) {
      toDelete.push(row.id)
      continue
    }
    toDemote.push(row.id)
    demotedMembers.add(row.memberId)
  }

  for (const ids of chunk(toDemote, CHUNK)) {
    await db.$executeRawUnsafe(
      `UPDATE ${quoteIdent(table)}
       SET "method" = 'EMAIL', "secretEncrypted" = NULL, "phoneEncrypted" = NULL,
           "verified" = FALSE, "lastStep" = NULL
       WHERE "id" IN (${placeholders(ids.length)})`,
      ...ids,
    )
  }
  for (const ids of chunk(toDelete, CHUNK)) {
    await db.$executeRawUnsafe(
      `DELETE FROM ${quoteIdent(table)} WHERE "id" IN (${placeholders(ids.length)})`,
      ...ids,
    )
  }

  return new Set(dead.map((r) => r.memberId)).size
}

/**
 * Clear every stored secret this install's ENCRYPTION_KEY cannot read.
 *
 * Call after a restore has replayed its data, in the same transaction.
 */
export async function clearUnreadableSecrets(db: SecretsDb): Promise<SecretsReconcileResult> {
  // With no usable key there is no way to tell "written under a different key"
  // from "the key hasn't been set on this site yet" - and wiping the site's
  // secrets on the strength of a missing environment variable would be a rotten
  // trade. Report it instead; nothing that reads a secret trusts one it cannot
  // decrypt anyway.
  if (!isEncryptionKeyUsable()) return { checked: false, cleared: [] }

  const columns = await getEncryptedColumns(db)
  const cleared: string[] = []

  const memberTwoFactor = columns.find((c) => c.table === 'MemberTwoFactor')
  if (memberTwoFactor) {
    const members = await repairMemberTwoFactor(db, memberTwoFactor.table)
    if (members > 0) {
      cleared.push(
        members > 1
          ? `two-factor authentication for ${members} member accounts (they now get a code by email until they set it up again)`
          : 'two-factor authentication for 1 member account (they now get a code by email until they set it up again)',
      )
    }
  }

  for (const col of columns) {
    if (col.table === 'MemberTwoFactor') continue

    const dead = await unreadableValues(db, col)
    if (dead.length === 0) continue

    const key = `${col.table}.${col.column}`
    let rowsAffected = 0

    for (const values of chunk(dead, CHUNK)) {
      const where = `WHERE ${quoteIdent(col.column)} IN (${placeholders(values.length)})`
      if (col.nullable) {
        const sets = [`${quoteIdent(col.column)} = NULL`, ...(COMPANION_CLEARS[key] ?? [])]
        rowsAffected += await db.$executeRawUnsafe(
          `UPDATE ${quoteIdent(col.table)} SET ${sets.join(', ')} ${where}`,
          ...values,
        )
      } else {
        // The column is NOT NULL, so the row cannot exist without the secret. It
        // only ever existed to hold it (a GitHub App connection is the whole row),
        // and an unreadable one is a lie the site keeps telling its owner.
        rowsAffected += await db.$executeRawUnsafe(
          `DELETE FROM ${quoteIdent(col.table)} ${where}`,
          ...values,
        )
      }
    }

    if (rowsAffected > 0) cleared.push(describe(key, rowsAffected))
  }

  return { checked: true, cleared }
}
