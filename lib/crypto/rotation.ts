import { randomUUID } from 'crypto'
import {
  areaLabel,
  getEncryptedColumns,
  quoteIdent,
  type EncryptedColumn,
  type SecretsDb,
} from './encrypted-columns'
import { derivationSalt, envKeys, isWellFormedKey, keyFingerprint, readingKeys } from './keyring'
import { decryptWithKey, encryptWithKey, looksLikeEncryptedSecret, tryDecryptSecret, tryDecryptWithKey } from './secrets'

// Moving a site onto a new ENCRYPTION_KEY without losing anything.
//
// The order of states, and why the running site never breaks (ACTIVE is what new
// encryptions and signatures use; see activeKey() in lib/crypto/keyring.ts):
//
//   S0  host: KEY=old                     data: old   active: old
//   S1  host: KEY=old, NEXT=new, deployed data: old   active: old  reads new+old+history
//   S2  rotateEncryptionKey commits       data: new   active: new  reads new+old+history
//       (old key added to history, encrypted under new)
//   S3  host: KEY=new, no NEXT, deployed  data: new   active: new  reads new+history(old)
//
// - A host's environment only reaches the site on a redeploy, so S1 needs one
//   before the rotation may run; the rotate step refuses until the running
//   deployment really has NEXT and it is the key the owner staged.
// - Every state can read everything every earlier state wrote: S1 and S2 hold both
//   keys in the environment, S3 holds the old one in history. A straggling
//   instance still on S1 while another commits S2 writes under old, which S2 and
//   S3 read; one already on S2 writes under new, which S1 also reads.
// - Nothing is ever read back from the host - Vercel's sensitive variables cannot
//   be - because the old key is in this deployment's memory and the new one
//   arrives in it as NEXT.
//
// The rotation is one transaction (a crash leaves S1 exactly), idempotent (a value
// already under the new key is skipped, history is keyed on fingerprint), and
// keeps every value it touched in "EncryptionKeyRotation" so it can be put back
// while the old key is still on the host.

export type TransactionalDb = SecretsDb & {
  $transaction<T>(fn: (tx: SecretsDb) => Promise<T>, options?: { maxWait?: number; timeout?: number }): Promise<T>
}

/** A value a rotation changed: what it was and what it became. `from` null = was unset. */
export type BackupEntry = { table: string; column: string; from: string | null; to: string }

export type AreaCount = { area: string; values: number }

export type ColumnReport = {
  table: string
  column: string
  area: string
  /** Values shaped like our ciphertext that the site can read. */
  readable: number
  /** Of those, already under the new key (a repeated or resumed run). */
  alreadyUnderNewKey: number
  /** Shaped like ours, readable under no key the site holds. These block a rotation. */
  unreadable: number
  /** Not our ciphertext at all - left well alone, as the restore does. */
  notOurs: number
}

export type DryRunReport = {
  columns: ColumnReport[]
  areas: AreaCount[]
  totalValues: number
  unreadable: number
  /** Owner-facing names of the areas holding unreadable values. */
  unreadableAreas: string[]
}

export class RotationBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RotationBlockedError'
  }
}

// A big site's worth of secrets is a few hundred values at most; the default 5s
// interactive transaction is still too tight for a slow pooler.
const TX_OPTIONS = { maxWait: 10_000, timeout: 120_000 }

async function distinctValues(db: SecretsDb, col: EncryptedColumn): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ value: string }[]>(
    `SELECT DISTINCT ${quoteIdent(col.column)} AS value FROM ${quoteIdent(col.table)}
     WHERE ${quoteIdent(col.column)} IS NOT NULL`,
  )
  return rows.map((r) => r.value).filter((v): v is string => typeof v === 'string')
}

function sumAreas(columns: { area: string; values: number }[]): AreaCount[] {
  const byArea = new Map<string, number>()
  for (const c of columns) byArea.set(c.area, (byArea.get(c.area) ?? 0) + c.values)
  return [...byArea.entries()].filter(([, n]) => n > 0).map(([area, values]) => ({ area, values }))
}

/**
 * Count every encrypted value and prove each one decrypts. Changes nothing.
 * Without `newKey` (nothing staged yet) it still proves readability; it just
 * cannot say what is already under a key it has not been given.
 */
export async function dryRunRotation(db: SecretsDb, newKey: string | null): Promise<DryRunReport> {
  if (newKey !== null && !isWellFormedKey(newKey)) throw new RotationBlockedError('The new key must be 64 hex characters.')
  const columns: ColumnReport[] = []
  for (const col of await getEncryptedColumns(db)) {
    const report: ColumnReport = {
      table: col.table,
      column: col.column,
      area: areaLabel(col.table, col.column),
      readable: 0,
      alreadyUnderNewKey: 0,
      unreadable: 0,
      notOurs: 0,
    }
    for (const value of await distinctValues(db, col)) {
      if (!looksLikeEncryptedSecret(value)) report.notOurs++
      else if (newKey && tryDecryptWithKey(value, newKey) !== null) {
        report.readable++
        report.alreadyUnderNewKey++
      } else if (tryDecryptSecret(value) !== null) report.readable++
      else report.unreadable++
    }
    columns.push(report)
  }
  const unreadableAreas = [...new Set(columns.filter((c) => c.unreadable > 0).map((c) => c.area))]
  return {
    columns,
    areas: sumAreas(columns.map((c) => ({ area: c.area, values: c.readable }))),
    totalValues: columns.reduce((n, c) => n + c.readable, 0),
    unreadable: columns.reduce((n, c) => n + c.unreadable, 0),
    unreadableAreas,
  }
}

type SweepHooks = {
  /** Called after each value is rewritten, inside the transaction. Tests use it to crash. */
  onValue?: (entry: BackupEntry) => void | Promise<void>
}

/**
 * Re-encrypt every one of our values that is not already under `target`.
 * Throws RotationBlockedError on any value no key in the ring can read, which
 * rolls the caller's transaction back: a rotation never drops a secret quietly.
 */
async function sweep(tx: SecretsDb, target: string, backup: BackupEntry[], hooks: SweepHooks): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (const col of await getEncryptedColumns(tx)) {
    for (const value of await distinctValues(tx, col)) {
      if (!looksLikeEncryptedSecret(value)) continue
      if (tryDecryptWithKey(value, target) !== null) continue
      const plain = tryDecryptSecret(value)
      if (plain === null) {
        throw new RotationBlockedError(
          `A value in ${areaLabel(col.table, col.column)} cannot be read with any key this site holds.`,
        )
      }
      const next = encryptWithKey(plain, target)
      if (decryptWithKey(next, target) !== plain) {
        throw new RotationBlockedError(`A value in ${areaLabel(col.table, col.column)} did not survive re-encryption.`)
      }
      const rows = await tx.$executeRawUnsafe(
        `UPDATE ${quoteIdent(col.table)} SET ${quoteIdent(col.column)} = $1 WHERE ${quoteIdent(col.column)} = $2`,
        next,
        value,
      )
      const entry = { table: col.table, column: col.column, from: value, to: next }
      backup.push(entry)
      const area = areaLabel(col.table, col.column)
      counts.set(area, (counts.get(area) ?? 0) + rows)
      await hooks.onValue?.(entry)
    }
  }
  return counts
}

async function activeFingerprintInDb(tx: SecretsDb): Promise<string | null | undefined> {
  const rows = await tx.$queryRawUnsafe<{ fp: string | null }[]>(
    `SELECT "encryptionKeyActiveFingerprint" AS fp FROM "SiteConfig" WHERE "id" = 'singleton'`,
  )
  return rows.length === 0 ? undefined : (rows[0]?.fp ?? null)
}

export type RotationResult = {
  rotationId: string | null
  /** True when the data was already wholly under the new key: nothing to do. */
  alreadyDone: boolean
  areas: AreaCount[]
  valuesRewritten: number
  keysRetired: number
}

/**
 * Re-encrypt every stored secret under `newKey`, retire every other key in the
 * ring into history (encrypted under `newKey`) and make `newKey` the active one -
 * all in one transaction.
 *
 * `newKey` must already be readable by the running site (ENCRYPTION_KEY_NEXT on
 * this deployment); the route checks that, this does the data.
 */
export async function rotateEncryptionKey(
  db: TransactionalDb,
  newKey: string,
  hooks: SweepHooks = {},
): Promise<RotationResult> {
  if (!isWellFormedKey(newKey)) throw new RotationBlockedError('The new key must be 64 hex characters.')
  const toFingerprint = keyFingerprint(newKey)
  const retiring = readingKeys().filter((k) => keyFingerprint(k) !== toFingerprint)
  if (retiring.length === 0) throw new RotationBlockedError('This site has no current key to rotate away from.')
  const fromKey = retiring[0] as string

  return db.$transaction(async (tx) => {
    const backup: BackupEntry[] = []

    // Ids hashed from the key (visitor ids, hashed IPs) must not change. Seed the
    // salt with the value they were made from, before the key stops being it.
    const salt = derivationSalt()
    const saltRows = await tx.$queryRawUnsafe<{ s: string | null }[]>(
      `SELECT "derivationSaltEncrypted" AS s FROM "SiteConfig" WHERE "id" = 'singleton'`,
    )
    if (saltRows.length > 0 && saltRows[0]?.s == null && salt) {
      const sealed = encryptWithKey(salt, newKey)
      await tx.$executeRawUnsafe(
        `UPDATE "SiteConfig" SET "derivationSaltEncrypted" = $1 WHERE "id" = 'singleton'`,
        sealed,
      )
      backup.push({ table: 'SiteConfig', column: 'derivationSaltEncrypted', from: null, to: sealed })
    }

    const counts = await sweep(tx, newKey, backup, hooks)

    const inserted: string[] = []
    for (const key of retiring) {
      const fingerprint = keyFingerprint(key)
      const added = await tx.$executeRawUnsafe(
        `INSERT INTO "EncryptionKey" ("id", "fingerprint", "keyEncrypted") VALUES ($1, $2, $3)
         ON CONFLICT ("fingerprint") DO NOTHING`,
        randomUUID(),
        fingerprint,
        encryptWithKey(key, newKey),
      )
      if (added > 0) inserted.push(fingerprint)
    }
    // Prove the history reads back under the new key before anything commits: a
    // history the new key cannot open is every old link broken.
    const history = await tx.$queryRawUnsafe<{ fingerprint: string; keyEncrypted: string }[]>(
      `SELECT "fingerprint", "keyEncrypted" FROM "EncryptionKey"`,
    )
    for (const key of retiring) {
      const row = history.find((h) => h.fingerprint === keyFingerprint(key))
      if (!row || tryDecryptWithKey(row.keyEncrypted, newKey)?.toLowerCase() !== key.toLowerCase()) {
        throw new RotationBlockedError('The previous key could not be stored safely, so nothing was changed.')
      }
    }

    const wasActive = await activeFingerprintInDb(tx)
    if (backup.length === 0 && inserted.length === 0 && wasActive === toFingerprint) {
      return { rotationId: null, alreadyDone: true, areas: [], valuesRewritten: 0, keysRetired: 0 }
    }

    await tx.$executeRawUnsafe(
      `UPDATE "SiteConfig" SET "encryptionKeyActiveFingerprint" = $1 WHERE "id" = 'singleton'`,
      toFingerprint,
    )

    const areas = [...counts.entries()].filter(([, n]) => n > 0).map(([area, values]) => ({ area, values }))
    const rotationId = randomUUID()
    await tx.$executeRawUnsafe(
      `INSERT INTO "EncryptionKeyRotation" ("id", "fromFingerprint", "toFingerprint", "counts", "backup")
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
      rotationId,
      keyFingerprint(fromKey),
      toFingerprint,
      JSON.stringify({ areas, insertedHistory: inserted }),
      JSON.stringify(backup),
    )

    return {
      rotationId,
      alreadyDone: false,
      areas,
      valuesRewritten: backup.length,
      keysRetired: inserted.length,
    }
  }, TX_OPTIONS)
}

export type RollbackResult = { rotationId: string; valuesRestored: number }

/**
 * Put the latest rotation back: every value it touched returns to what it was,
 * anything written under the new key since is moved back to the old one, and the
 * history it added is removed. Only while the old key is still in this
 * deployment's environment - after the swap, the way back is another rotation.
 */
export async function rollbackLatestRotation(db: TransactionalDb): Promise<RollbackResult> {
  // The host's ENCRYPTION_KEY, and only that. The old key also sits in history,
  // but putting the data back under a key the host no longer has would leave
  // this deployment writing under one key and holding the data under another,
  // with the only copy of the old one deleted by the roll-back itself.
  const hostKey = envKeys().current
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<
      { id: string; fromFingerprint: string; counts: { insertedHistory?: string[] }; backup: BackupEntry[] }[]
    >(
      `SELECT "id", "fromFingerprint", "counts", "backup" FROM "EncryptionKeyRotation"
       WHERE "rolledBackAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1`,
    )
    const rotation = rows[0]
    if (!rotation) throw new RotationBlockedError('There is no rotation to put back.')
    const oldKey = hostKey && keyFingerprint(hostKey) === rotation.fromFingerprint ? hostKey : null
    if (!oldKey) {
      throw new RotationBlockedError(
        'The old key has already been swapped out on the host, so the rotation cannot be put back. Rotate again instead.',
      )
    }

    let restored = 0
    for (const entry of [...rotation.backup].reverse()) {
      if (entry.from === null) {
        restored += await tx.$executeRawUnsafe(
          `UPDATE ${quoteIdent(entry.table)} SET ${quoteIdent(entry.column)} = NULL WHERE ${quoteIdent(entry.column)} = $1`,
          entry.to,
        )
      } else {
        restored += await tx.$executeRawUnsafe(
          `UPDATE ${quoteIdent(entry.table)} SET ${quoteIdent(entry.column)} = $1 WHERE ${quoteIdent(entry.column)} = $2`,
          entry.from,
          entry.to,
        )
      }
    }

    const inserted = rotation.counts.insertedHistory ?? []
    if (inserted.length > 0) {
      await tx.$executeRawUnsafe(
        `DELETE FROM "EncryptionKey" WHERE "fingerprint" = ANY($1::text[])`,
        inserted,
      )
    }

    // Secrets saved since the rotation went under the new key; bring them back too.
    const since: BackupEntry[] = []
    await sweep(tx, oldKey, since, {})

    await tx.$executeRawUnsafe(
      `UPDATE "SiteConfig" SET "encryptionKeyActiveFingerprint" = $1 WHERE "id" = 'singleton'`,
      rotation.fromFingerprint,
    )
    await tx.$executeRawUnsafe(
      `UPDATE "EncryptionKeyRotation" SET "rolledBackAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
      rotation.id,
    )
    return { rotationId: rotation.id, valuesRestored: restored + since.length }
  }, TX_OPTIONS)
}
