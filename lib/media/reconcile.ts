import { prisma } from '@/lib/db/prisma'
import type { MediaProviderType } from '@prisma/client'
import { isMediaProviderConfigured } from '@/lib/config/env'
import { getMediaReferencesBulk, listStoredMediaKeys, mediaKeyPrefix, type StoredObject } from '@/lib/media/upload'
import { loadMediaUsageIndex } from '@/lib/media/references'

// ---------------------------------------------------------------------------
// Reconcile the Media table against what storage actually holds.
//
// Every other figure on the media page is derived from rows, so the library can
// only ever describe itself. That leaves four drifts invisible:
//
//   orphaned  - an object in the bucket with no row AND nothing pointing at it.
//               Costs storage forever and appears in no total. Each
//               write-new-then-delete-old flow (optimise, relocate, provider
//               migration) has a failure window that leaves one behind.
//   claimed   - an object with no row that the site is nonetheless using. Not a
//               leftover at all: a module that writes a url straight into its
//               own table (a 3D model, a product photograph) without minting a
//               library row leaves the object looking unowned while a live page
//               serves it. Reported so it can be put right, never offered for
//               deletion.
//   missing   - a row whose object is gone. The library shows a broken picture
//               and nothing says why.
//   mismatched - a row whose recorded size isn't the object's. Harmless on its
//               own, but it makes "storage used" a guess.
//
// Read-only: this reports, it never repairs. Repair is a separate, explicit act
// (see the storage-check route) because deleting an orphan is destructive
// against an object no library row can vouch for.
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
  /** Objects with no library row that page or module content still points at. */
  claimed: OrphanedObject[]
  missing: MissingObject[]
  mismatched: SizeMismatch[]
  orphanedBytes: number
  claimedBytes: number
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
 * Every storage key the site's own content mentions, pulled out of the usage
 * index's haystack once so a whole bucket can be checked with a set lookup each
 * rather than a substring search each - the difference between a scan that
 * finishes and one that doesn't on a library of tens of thousands of objects.
 *
 * The haystack is builder JSON and raw module column values, so a key arrives
 * embedded in a url, a JSON string or a percent-encoded href. Both the raw and
 * the decoded form are kept: whichever one storage reports, one of them matches.
 */
export function extractReferencedKeys(haystack: string): Set<string> {
  const out = new Set<string>()
  // Stops at the characters that end a key in the shapes it turns up in: JSON
  // quoting, an escape, markdown brackets, a list separator, a url's query.
  for (const match of haystack.matchAll(/media\/[^\s"'\\)>,\]}|]+/g)) {
    const key = match[0].replace(/[?#].*$/, '').replace(/[.,;:]+$/, '')
    if (!key) continue
    out.add(key)
    try {
      out.add(decodeURIComponent(key))
    } catch {
      // A stray % in a key makes this throw. The raw form is already recorded,
      // which is the form storage reports anyway.
    }
  }
  return out
}

/**
 * The comparison itself, kept pure so it can be tested without a bucket or a
 * database. Everything above it is fetching; this is the part that decides what
 * counts as a drift, and it is the part that has to be right - a false orphan
 * here becomes a deleted file downstream.
 *
 * `isClaimed` answers "is the site using this object even though no row owns
 * it?". Omitted, nothing is claimed and every rowless object reads as an orphan,
 * which is the behaviour this had before modules started writing urls into their
 * own tables without minting a library row.
 */
export function diffStorageAgainstRows(
  provider: MediaProviderType,
  rows: ReconcileRow[],
  stored: StoredObject[],
  isClaimed: (key: string) => boolean = () => false,
): {
  orphaned: OrphanedObject[]
  claimed: OrphanedObject[]
  missing: MissingObject[]
  mismatched: SizeMismatch[]
  orphanedBytes: number
  claimedBytes: number
} {
  const storedByKey = new Map(stored.map((o) => [o.key, o]))
  const rowKeys = new Set(rows.map((r) => r.key))

  const orphaned: OrphanedObject[] = []
  const claimed: OrphanedObject[] = []
  let orphanedBytes = 0
  let claimedBytes = 0
  for (const o of stored) {
    if (rowKeys.has(o.key)) continue
    // Folder placeholders: some providers materialise a directory as a zero-byte
    // object ending in "/". Not an orphan, just bookkeeping.
    if (o.key.endsWith('/')) continue
    // No row, but a live page or a module table names it. Deleting it would take
    // a 3D model or a product photograph off the site, so it goes in its own
    // pile and never into the one with a delete button over it.
    if (isClaimed(o.key)) {
      claimed.push({ ...o, provider })
      claimedBytes += o.sizeBytes
      continue
    }
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

  return { orphaned, claimed, missing, mismatched, orphanedBytes, claimedBytes }
}

/**
 * The "is anything using this object?" test, built once per scan.
 *
 * Fails safe in both directions it can fail: an index that a module's usage
 * provider could not complete, or one that could not be built at all, claims
 * everything. That reports no leftovers rather than a list of files whose
 * references simply could not be looked up.
 */
async function buildClaimTest(): Promise<(key: string) => boolean> {
  try {
    const { haystack, degraded } = await loadMediaUsageIndex()
    if (degraded) return () => true
    const referenced = extractReferencedKeys(haystack)
    return (key: string) => referenced.has(key.toLowerCase())
  } catch (err) {
    console.error('[media] usage index could not be built; reporting no leftovers', err)
    return () => true
  }
}

export async function reconcileMediaStorage(): Promise<StorageReconcile> {
  const rows = await prisma.media.findMany({
    select: { id: true, key: true, provider: true, originalName: true, sizeBytes: true },
  })

  const isClaimed = await buildClaimTest()

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
    claimed: [],
    missing: [],
    mismatched: [],
    orphanedBytes: 0,
    claimedBytes: 0,
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

    const diff = diffStorageAgainstRows(provider, providerRows, stored, isClaimed)
    result.orphaned.push(...diff.orphaned)
    result.claimed.push(...diff.claimed)
    result.missing.push(...diff.missing)
    result.mismatched.push(...diff.mismatched)
    result.orphanedBytes += diff.orphanedBytes
    result.claimedBytes += diff.claimedBytes

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
  result.claimed.sort((a, b) => b.sizeBytes - a.sizeBytes || a.key.localeCompare(b.key))
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

  const candidates: MissingObject[] = []
  for (const key of keys) {
    const row = byKey.get(key)
    if (!row) { result.stale += 1; continue }
    candidates.push(row)
  }

  // Reference-check and delete in bulk rather than per row: a large cleanup used
  // to run hundreds of sequential query round-trips and time the request out
  // before it finished. The verdicts are identical, just fetched in one pass.
  let toDelete = candidates
  if (!force) {
    const references = await getMediaReferencesBulk(candidates.map((c) => c.id))
    toDelete = []
    for (const row of candidates) {
      const refs = references.get(row.id) ?? []
      if (refs.length > 0) {
        result.skipped.push({ key: row.key, originalName: row.originalName, references: refs })
        continue
      }
      toDelete.push(row)
    }
  }

  if (toDelete.length > 0) {
    const { count } = await prisma.media.deleteMany({ where: { id: { in: toDelete.map((r) => r.id) } } })
    result.purged = count
  }

  return result
}

/** True when a key is one this app would have written for that provider. */
export function isOwnMediaKey(provider: MediaProviderType, key: string): boolean {
  return key.startsWith(mediaKeyPrefix(provider))
}
