import { prisma } from '@/lib/db/prisma'
import type { MediaProviderType } from '@prisma/client'
import { isMediaProviderConfigured } from '@/lib/config/env'
import { getMediaReferences, listStoredMediaKeys, mediaKeyPrefix, type StoredObject } from '@/lib/media/upload'

// ---------------------------------------------------------------------------
// Reconcile the Media table against what storage actually holds.
//
// Every other figure on the media page is derived from rows, so the library can
// only ever describe itself. That leaves three drifts invisible:
//
//   orphaned  - an object in the bucket with no row. Costs storage forever and
//               appears in no total. Each write-new-then-delete-old flow
//               (optimise, relocate, provider migration) has a failure window
//               that leaves one behind.
//   missing   - a row whose object is gone. The library shows a broken picture
//               and nothing says why.
//   mismatched - a row whose recorded size isn't the object's. Harmless on its
//               own, but it makes "storage used" a guess.
//
// Read-only: this reports, it never repairs. Repair is a separate, explicit act
// (see the storage-check route) because deleting an orphan is destructive
// against an object no reference check can vouch for.
// ---------------------------------------------------------------------------

export type OrphanedObject = StoredObject & { provider: MediaProviderType }

export type MissingObject = {
  id: string
  key: string
  provider: MediaProviderType
  originalName: string | null
  sizeBytes: number
}

export type SizeMismatch = {
  id: string
  key: string
  provider: MediaProviderType
  originalName: string | null
  recordedBytes: number
  storedBytes: number
}

export type ProviderScan = {
  provider: MediaProviderType
  /** False when the provider can't be listed (unconfigured, or a direct provider). */
  scanned: boolean
  /** Why it wasn't scanned - shown to the admin rather than silently omitted. */
  skippedReason?: string
  storedObjects: number
  storedBytes: number
}

export type StorageReconcile = {
  providers: ProviderScan[]
  orphaned: OrphanedObject[]
  missing: MissingObject[]
  mismatched: SizeMismatch[]
  orphanedBytes: number
  /** True when at least one provider holding rows could not be listed. */
  partial: boolean
}

const KEYS_PER_PROVIDER_LIMIT = 50_000

export type ReconcileRow = {
  id: string
  key: string
  originalName: string | null
  sizeBytes: number
}

/**
 * The comparison itself, kept pure so it can be tested without a bucket or a
 * database. Everything above it is fetching; this is the part that decides what
 * counts as a drift, and it is the part that has to be right - a false orphan
 * here becomes a deleted file downstream.
 */
export function diffStorageAgainstRows(
  provider: MediaProviderType,
  rows: ReconcileRow[],
  stored: StoredObject[],
): { orphaned: OrphanedObject[]; missing: MissingObject[]; mismatched: SizeMismatch[]; orphanedBytes: number } {
  const storedByKey = new Map(stored.map((o) => [o.key, o]))
  const rowKeys = new Set(rows.map((r) => r.key))

  const orphaned: OrphanedObject[] = []
  let orphanedBytes = 0
  for (const o of stored) {
    if (rowKeys.has(o.key)) continue
    // Folder placeholders: some providers materialise a directory as a zero-byte
    // object ending in "/". Not an orphan, just bookkeeping.
    if (o.key.endsWith('/')) continue
    orphaned.push({ ...o, provider })
    orphanedBytes += o.sizeBytes
  }

  const missing: MissingObject[] = []
  const mismatched: SizeMismatch[] = []
  for (const r of rows) {
    const object = storedByKey.get(r.key)
    if (!object) {
      missing.push({ id: r.id, key: r.key, provider, originalName: r.originalName, sizeBytes: r.sizeBytes })
      continue
    }
    if (object.sizeBytes !== r.sizeBytes) {
      mismatched.push({
        id: r.id,
        key: r.key,
        provider,
        originalName: r.originalName,
        recordedBytes: r.sizeBytes,
        storedBytes: object.sizeBytes,
      })
    }
  }

  return { orphaned, missing, mismatched, orphanedBytes }
}

export async function reconcileMediaStorage(): Promise<StorageReconcile> {
  const rows = await prisma.media.findMany({
    select: { id: true, key: true, provider: true, originalName: true, sizeBytes: true },
  })

  // Group rows by the provider each one actually lives on. A library that has
  // been through a provider switch holds rows on more than one, and scanning
  // only the active provider would report every other row as missing.
  const byProvider = new Map<MediaProviderType, typeof rows>()
  for (const r of rows) {
    const list = byProvider.get(r.provider)
    if (list) list.push(r)
    else byProvider.set(r.provider, [r])
  }

  const result: StorageReconcile = {
    providers: [],
    orphaned: [],
    missing: [],
    mismatched: [],
    orphanedBytes: 0,
    partial: false,
  }

  for (const [provider, providerRows] of byProvider) {
    if (!isMediaProviderConfigured(provider)) {
      result.providers.push({
        provider,
        scanned: false,
        skippedReason: 'storage credentials are not configured',
        storedObjects: 0,
        storedBytes: 0,
      })
      result.partial = true
      continue
    }

    let stored: StoredObject[] | null
    try {
      stored = await listStoredMediaKeys(provider)
    } catch (err) {
      result.providers.push({
        provider,
        scanned: false,
        skippedReason: `storage could not be listed (${err instanceof Error ? err.message : 'unknown error'})`,
        storedObjects: 0,
        storedBytes: 0,
      })
      result.partial = true
      continue
    }

    if (stored === null) {
      result.providers.push({
        provider,
        scanned: false,
        skippedReason: 'this provider stores files under ids it mints itself, so its contents cannot be listed',
        storedObjects: 0,
        storedBytes: 0,
      })
      result.partial = true
      continue
    }

    // A pathological bucket shouldn't be able to exhaust the request's memory.
    // Reporting a truncated scan as complete would be worse than saying so.
    if (stored.length > KEYS_PER_PROVIDER_LIMIT) {
      result.providers.push({
        provider,
        scanned: false,
        skippedReason: `storage holds more than ${KEYS_PER_PROVIDER_LIMIT.toLocaleString('en-GB')} objects, too many to check in one pass`,
        storedObjects: stored.length,
        storedBytes: stored.reduce((n, o) => n + o.sizeBytes, 0),
      })
      result.partial = true
      continue
    }

    const diff = diffStorageAgainstRows(provider, providerRows, stored)
    result.orphaned.push(...diff.orphaned)
    result.missing.push(...diff.missing)
    result.mismatched.push(...diff.mismatched)
    result.orphanedBytes += diff.orphanedBytes

    result.providers.push({
      provider,
      scanned: true,
      storedObjects: stored.length,
      storedBytes: stored.reduce((n, o) => n + o.sizeBytes, 0),
    })
  }

  // Deterministic order so a repeat scan reads the same way, biggest first
  // because that's the order an admin wants to act in.
  result.orphaned.sort((a, b) => b.sizeBytes - a.sizeBytes || a.key.localeCompare(b.key))
  result.missing.sort((a, b) => a.key.localeCompare(b.key))
  result.mismatched.sort((a, b) => a.key.localeCompare(b.key))

  return result
}

/**
 * Rewrite every mismatched row's `sizeBytes` to the size storage reports.
 * Non-destructive: it changes a number that was already wrong, touches no blob,
 * and re-derives the list itself rather than trusting a client-supplied set.
 */
export async function correctRecordedSizes(): Promise<{ corrected: number }> {
  const { mismatched } = await reconcileMediaStorage()
  for (const m of mismatched) {
    await prisma.media.update({ where: { id: m.id }, data: { sizeBytes: m.storedBytes } })
  }
  return { corrected: mismatched.length }
}

export type PurgeMissingResult = {
  purged: number
  /** Rows left alone because something still points at them and force wasn't set. */
  skipped: { key: string; originalName: string | null; references: string[] }[]
  /** Keys the caller asked for that a fresh scan no longer calls missing. */
  stale: number
}

/**
 * Delete the library rows whose file is no longer in storage - the drift you get
 * when someone tidies the bucket from the provider's own console.
 *
 * No blob is touched: the object these rows name is already gone, so there is
 * nothing to delete and calling the provider would only raise a not-found. The
 * destructive part is the row, and the safeguard is the same one `delete-orphans`
 * uses - the caller's key list is a selection, never an authority, so a fresh
 * scan decides what actually qualifies.
 *
 * A row still referenced by a page or a setting is skipped unless `force`. That
 * reference is already broken (the picture cannot load either way), but the
 * skipped list is the only place an admin gets told which pages need attention,
 * so it is worth one deliberate second look.
 */
export async function purgeMissingRows(keys: string[], force = false): Promise<PurgeMissingResult> {
  const { missing } = await reconcileMediaStorage()
  const byKey = new Map(missing.map((m) => [m.key, m]))

  const result: PurgeMissingResult = { purged: 0, skipped: [], stale: 0 }

  for (const key of keys) {
    const row = byKey.get(key)
    if (!row) { result.stale += 1; continue }

    if (!force) {
      const references = await getMediaReferences(row.id)
      if (references.length > 0) {
        result.skipped.push({ key: row.key, originalName: row.originalName, references })
        continue
      }
    }

    await prisma.media.delete({ where: { id: row.id } })
    result.purged += 1
  }

  return result
}

/** True when a key is one this app would have written for that provider. */
export function isOwnMediaKey(provider: MediaProviderType, key: string): boolean {
  return key.startsWith(mediaKeyPrefix(provider))
}
