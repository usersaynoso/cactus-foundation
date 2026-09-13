import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { Prisma, MediaProviderType } from '@prisma/client'
import { isMediaProviderConfigured } from '@/lib/config/env'
import {
  deleteMedia,
  getMediaReferencesBulk,
  listStoredMediaKeys,
  listStoredMediaKeysAfter,
  mediaKeyPrefix,
  saveMediaRecord,
  statStoredMediaObject,
  type StoredObject,
} from '@/lib/media/upload'
import { loadMediaUsageIndex } from '@/lib/media/references'
import { getMediaPrivatePrefixes } from '@/lib/media/private-storage'
import { contentTypeForKey } from '@/lib/media/limits'
import { sanitizeFolderSegment } from '@/lib/media/organise'
import { emptyReconcile, sortReconcile } from '@/lib/media/reconcile-report'

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
//   moduleOwned - an object a module keeps on purpose without a library row: an
//               email attachment, a filed receipt. Not a drift at all, and the
//               one pile that must never be adopted into the library - the whole
//               point of it is that it stays out of the media picker. Listed as
//               a count so the storage total adds up, and nothing else.
//   missing   - a row whose object is gone. The library shows a broken picture
//               and nothing says why.
//   mismatched - a row whose recorded size isn't the object's. Harmless on its
//               own, but it makes "storage used" a guess.
//
// The scan reports, it never repairs. Repair is a separate, explicit act (the
// functions at the bottom of this file) because deleting an orphan is destructive
// against an object no library row can vouch for.
//
// Size. A library of tens of thousands of files cannot be listed, cross-checked
// and sent back inside one request's time limit, so the scan is a run of
// requests (scanMediaStorageChunk), each covering an exact key range and handing
// back a cursor for the next. And a repair never re-scans the bucket to check the
// client's selection: it asks storage about the selected keys and nothing else,
// and applies the same verdict the scan did (classifyRowlessObject). The old
// shape re-listed every object in storage once per batch, which on a bucket of
// sixty thousand made a cleanup of a thousand files forty full scans long.
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
  /** Objects a module keeps outside the library on purpose. Reported, never touched. */
  moduleOwned: OrphanedObject[]
  missing: MissingObject[]
  mismatched: SizeMismatch[]
  orphanedBytes: number
  claimedBytes: number
  moduleOwnedBytes: number
  /** True when at least one provider holding rows could not be listed. */
  partial: boolean
}

/** One slice of a scan, plus where the next one starts. `next` is null when the scan is complete. */
export type StorageReconcileChunk = StorageReconcile & { next: string | null }

/** One object a repair is asked to act on. The provider comes from the scan that listed it. */
export type StorageTarget = { provider: MediaProviderType; key: string }

// Per slice of a range-listable provider. The usage index is built alongside the
// listing, not after it - on a site whose pages and module tables run to tens of
// megabytes it takes as long as the listing does - so the listing budget plus
// the row query and the diff sit well inside the route's 60 seconds. The object
// cap bounds one request's memory whatever the provider's page size.
const SLICE_MAX_OBJECTS = 50_000
const SLICE_LISTING_BUDGET_MS = 15_000

// A provider that cannot resume from a key (Vercel Blob, Supabase) is listed in
// one pass or not at all. This guard is about one request's memory, not its
// time - a listing that runs out of time fails the request loudly on its own.
const SINGLE_PASS_LIMIT = 250_000

// Storage lookups a repair makes at once. Enough to clear a batch of a couple of
// hundred keys in a few seconds, few enough not to look like an attack to a
// provider's rate limiter.
const LOOKUP_CONCURRENCY = 16

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

export type RowlessVerdict = 'placeholder' | 'moduleOwned' | 'claimed' | 'orphaned'

/**
 * What an object with no library row is. The one place that decides it, used by
 * the scan and by every repair, so the pile an admin was shown and the check a
 * repair makes before acting can never disagree.
 *
 * `isPrivate` is asked FIRST - before the claim test, not after. A module's
 * private folder is off limits whether or not the usage index happened to mention
 * the file: a mail attachment nobody has opened yet is referenced by nothing, and
 * the wrong answer to that is a delete button over somebody's invoice.
 */
export function classifyRowlessObject(
  key: string,
  isClaimed: (key: string) => boolean,
  isPrivate: (key: string) => boolean,
): RowlessVerdict {
  // Folder placeholders: some providers materialise a directory as a zero-byte
  // object ending in "/". Not an orphan, just bookkeeping.
  if (key.endsWith('/')) return 'placeholder'
  if (isPrivate(key)) return 'moduleOwned'
  // No row, but a live page or a module table names it. Deleting it would take a
  // 3D model or a product photograph off the site, so it goes in its own pile and
  // never into the one with a delete button over it.
  if (isClaimed(key)) return 'claimed'
  return 'orphaned'
}

/**
 * The comparison itself, kept pure so it can be tested without a bucket or a
 * database. Everything above it is fetching; this is the part that decides what
 * counts as a drift, and it is the part that has to be right - a false orphan
 * here becomes a deleted file downstream.
 *
 * `rows` and `stored` must describe the same stretch of storage - the whole
 * provider, or one key range of it. A row outside the stretch the objects came
 * from would read as missing.
 *
 * `isClaimed` answers "is the site using this object even though no row owns
 * it?". Omitted, nothing is claimed and every rowless object reads as an orphan,
 * which is the behaviour this had before modules started writing urls into their
 * own tables without minting a library row.
 *
 * `isPrivate` answers "does a module keep this file outside the library on
 * purpose?" - see classifyRowlessObject for why it outranks the claim test.
 */
export function diffStorageAgainstRows(
  provider: MediaProviderType,
  rows: ReconcileRow[],
  stored: StoredObject[],
  isClaimed: (key: string) => boolean = () => false,
  isPrivate: (key: string) => boolean = () => false,
): {
  orphaned: OrphanedObject[]
  claimed: OrphanedObject[]
  moduleOwned: OrphanedObject[]
  missing: MissingObject[]
  mismatched: SizeMismatch[]
  orphanedBytes: number
  claimedBytes: number
  moduleOwnedBytes: number
} {
  const storedByKey = new Map(stored.map((o) => [o.key, o]))
  const rowKeys = new Set(rows.map((r) => r.key))

  const orphaned: OrphanedObject[] = []
  const claimed: OrphanedObject[] = []
  const moduleOwned: OrphanedObject[] = []
  let orphanedBytes = 0
  let claimedBytes = 0
  let moduleOwnedBytes = 0
  for (const o of stored) {
    if (rowKeys.has(o.key)) continue
    switch (classifyRowlessObject(o.key, isClaimed, isPrivate)) {
      case 'placeholder':
        break
      case 'moduleOwned':
        moduleOwned.push({ ...o, provider })
        moduleOwnedBytes += o.sizeBytes
        break
      case 'claimed':
        claimed.push({ ...o, provider })
        claimedBytes += o.sizeBytes
        break
      case 'orphaned':
        orphaned.push({ ...o, provider })
        orphanedBytes += o.sizeBytes
        break
    }
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

  return { orphaned, claimed, moduleOwned, missing, mismatched, orphanedBytes, claimedBytes, moduleOwnedBytes }
}

/**
 * The "is anything using this object?" test, built once per request.
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

/**
 * The "does a module keep this outside the library on purpose?" test, built once
 * per request and applied per provider, since each provider namespaces its own keys.
 *
 * A registry that cannot be read claims nothing, which is the safe direction
 * here: a private file that falls through still meets the claim test (its module
 * vouches for it through the usage providers) and so is still never offered for
 * deletion. It would merely be listed in the wrong pile.
 */
async function buildPrivateTest(): Promise<(provider: MediaProviderType, key: string) => boolean> {
  let folders: string[] = []
  try {
    folders = await getMediaPrivatePrefixes()
  } catch (err) {
    console.error('[media] private storage folders could not be read', err)
  }
  if (folders.length === 0) return () => false
  const cache = new Map<MediaProviderType, string[]>()
  return (provider, key) => {
    let prefixes = cache.get(provider)
    if (!prefixes) {
      prefixes = folders.map((f) => `${mediaKeyPrefix(provider)}${f}/`)
      cache.set(provider, prefixes)
    }
    return prefixes.some((prefix) => key.startsWith(prefix))
  }
}

// ---------------------------------------------------------------------------
// The scan, one slice at a time.
// ---------------------------------------------------------------------------

/**
 * Where a scan has got to: the provider being listed and the last key the
 * previous slice covered (null at the start of a provider). Travels to the page
 * and back as an opaque string, and is validated on the way in like any other
 * input - it names a key range, and a mangled one must be refused, not guessed at.
 */
export type ScanCursor = { provider: MediaProviderType; after: string | null }

const scanCursorSchema = z.object({
  provider: z.nativeEnum(MediaProviderType),
  after: z.string().min(1).max(2048).nullable(),
})

export function encodeScanCursor(cursor: ScanCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

/** The cursor, or null when the string is not one this code issued. */
export function decodeScanCursor(raw: string): ScanCursor | null {
  try {
    const parsed = scanCursorSchema.safeParse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * Every provider holding at least one row, in a fixed order so a scan that spans
 * several requests visits them in the same sequence each time. A library that
 * has been through a provider switch holds rows on more than one, and scanning
 * only the active provider would report every other row as missing.
 */
async function providersHoldingRows(): Promise<MediaProviderType[]> {
  const groups = await prisma.media.groupBy({ by: ['provider'] })
  return groups.map((g) => g.provider).sort()
}

/**
 * The provider's rows whose key falls in (after, upTo], either end open when null.
 *
 * COLLATE "C" is load-bearing: it compares bytes, which is the order an
 * S3-compatible listing comes back in. The database's own collation folds case
 * and skips punctuation, so a range written in it would not line up with the
 * slice of objects it is compared against - a row could land in no slice at all
 * and never be checked, or in the wrong one and read as missing.
 */
async function rowsInKeyRange(
  provider: MediaProviderType,
  after: string | null,
  upTo: string | null,
): Promise<ReconcileRow[]> {
  return prisma.$queryRaw<ReconcileRow[]>`
    SELECT "id", "key", "originalName", "sizeBytes"
    FROM "Media"
    WHERE "provider" = ${provider}::"MediaProviderType"
      AND (${after}::text IS NULL OR "key" COLLATE "C" > ${after}::text)
      AND (${upTo}::text IS NULL OR "key" COLLATE "C" <= ${upTo}::text)
  `
}

type ListedSlice = { stored: StoredObject[]; rows: ReconcileRow[]; done: boolean }

/**
 * The objects and rows for one slice of a provider, or a plain-English reason it
 * could not be listed. Range-listable providers are sliced; the rest are listed
 * whole, once, on the first request that reaches them.
 */
async function listSlice(provider: MediaProviderType, after: string | null): Promise<ListedSlice | { skippedReason: string; storedObjects: number; storedBytes: number }> {
  let ranged: Awaited<ReturnType<typeof listStoredMediaKeysAfter>>
  let whole: StoredObject[] | null = null
  try {
    ranged = await listStoredMediaKeysAfter(provider, after, {
      maxObjects: SLICE_MAX_OBJECTS,
      deadline: Date.now() + SLICE_LISTING_BUDGET_MS,
    })
    if (!ranged) whole = await listStoredMediaKeys(provider)
  } catch (err) {
    return {
      skippedReason: `storage could not be listed (${err instanceof Error ? err.message : 'unknown error'})`,
      storedObjects: 0,
      storedBytes: 0,
    }
  }

  if (ranged) {
    const last = ranged.objects.at(-1)
    if (!ranged.done && !last) {
      // A truncated listing that returned nothing leaves no key to resume from,
      // and pretending the provider ended here would report the rest as missing.
      return { skippedReason: 'storage stopped answering part-way through the list', storedObjects: 0, storedBytes: 0 }
    }
    // The final slice is open-ended, so rows filed after the last object (or
    // outside the media folder altogether) are still compared - as missing.
    const upTo = ranged.done ? null : last?.key ?? null
    return { stored: ranged.objects, rows: await rowsInKeyRange(provider, after, upTo), done: ranged.done }
  }

  if (whole === null) {
    return {
      skippedReason: 'this provider stores files under ids it mints itself, so its contents cannot be listed',
      storedObjects: 0,
      storedBytes: 0,
    }
  }

  // A pathological bucket shouldn't be able to exhaust the request's memory.
  // Reporting a truncated scan as complete would be worse than saying so.
  if (whole.length > SINGLE_PASS_LIMIT) {
    return {
      skippedReason: `storage holds more than ${SINGLE_PASS_LIMIT.toLocaleString('en-GB')} objects, too many for this provider to check in one pass`,
      storedObjects: whole.length,
      storedBytes: whole.reduce((n, o) => n + o.sizeBytes, 0),
    }
  }

  const rows = await prisma.media.findMany({
    where: { provider },
    select: { id: true, key: true, originalName: true, sizeBytes: true },
  })
  return { stored: whole, rows, done: true }
}

/**
 * One slice of the storage check. Pass null to start, then each `next` in turn
 * until it comes back null; the slices summed (mergeReconcile) are the whole
 * report. Each slice is complete for its own key range, so nothing is lost or
 * double-counted at a boundary.
 *
 * Objects added or removed while a scan is under way may or may not be seen,
 * depending on which side of the scan's position they land - the report is a
 * walk through storage, not a photograph of it. That is safe because no repair
 * trusts it: each one re-checks its own keys before acting.
 */
export async function scanMediaStorageChunk(cursor: ScanCursor | null): Promise<StorageReconcileChunk> {
  const providers = await providersHoldingRows()
  const provider = cursor?.provider ?? providers[0]
  const report = emptyReconcile()
  if (!provider) return { ...report, next: null }

  // Providers are visited in sorted order, so the next one is simply the first
  // name after this. Still correct if this provider's last row went mid-scan.
  const nextProvider = providers.find((p) => p > provider)
  const afterThisProvider = nextProvider ? encodeScanCursor({ provider: nextProvider, after: null }) : null

  if (!isMediaProviderConfigured(provider)) {
    report.providers.push({ provider, scanned: false, skippedReason: 'storage credentials are not configured', storedObjects: 0, storedBytes: 0 })
    return { ...report, partial: true, next: afterThisProvider }
  }

  // Started before the listing so the two run side by side. Neither can reject -
  // both fail safe internally - so abandoning it on a skipped slice is harmless.
  const tests = Promise.all([buildClaimTest(), buildPrivateTest()])

  const after = cursor?.after ?? null
  const slice = await listSlice(provider, after)
  if ('skippedReason' in slice) {
    report.providers.push({ provider, scanned: false, ...slice })
    return { ...report, partial: true, next: afterThisProvider }
  }

  const [isClaimed, isPrivate] = await tests
  const diff = diffStorageAgainstRows(provider, slice.rows, slice.stored, isClaimed, (key) => isPrivate(provider, key))
  const last = slice.stored.at(-1)

  return {
    ...sortReconcile({
      ...report,
      ...diff,
      providers: [{
        provider,
        scanned: true,
        storedObjects: slice.stored.length,
        storedBytes: slice.stored.reduce((n, o) => n + o.sizeBytes, 0),
      }],
    }),
    next: slice.done || !last ? afterThisProvider : encodeScanCursor({ provider, after: last.key }),
  }
}

// ---------------------------------------------------------------------------
// Repairs.
//
// The caller's list is a selection, never an authority. Each repair looks up
// exactly the keys it was handed - their rows, their objects, the same claim and
// private tests the scan used - and acts only on those that still qualify. That
// is what stops a stale page (or a crafted request) deleting an object that has
// since been claimed, and it costs one lookup per selected key rather than a
// fresh listing of the whole bucket per batch.
// ---------------------------------------------------------------------------

type InspectedTarget = StorageTarget & {
  /** The object at this key, null when storage says there is none, undefined when storage could not be asked. */
  stored: StoredObject | null | undefined
  row: (ReconcileRow & { provider: MediaProviderType }) | null
}

async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length)
  let cursor = 0
  const worker = async () => {
    for (let i = cursor++; i < items.length; i = cursor++) {
      out[i] = await fn(items[i] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/** Distinct targets, first occurrence kept, so a doubled key is acted on once. */
function uniqueTargets(targets: StorageTarget[]): StorageTarget[] {
  const seen = new Set<string>()
  return targets.filter((t) => {
    const id = `${t.provider}\u0000${t.key}`
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

async function inspectTargets(targets: StorageTarget[]): Promise<InspectedTarget[]> {
  const rows = await prisma.media.findMany({
    where: { key: { in: targets.map((t) => t.key) } },
    select: { id: true, key: true, provider: true, originalName: true, sizeBytes: true },
  })
  // Media.key is unique across providers, so one key has at most one row.
  const rowByKey = new Map(rows.map((r) => [r.key, r]))

  return mapWithConcurrency(targets, LOOKUP_CONCURRENCY, async (target) => {
    let stored: StoredObject | null | undefined
    try {
      stored = await statStoredMediaObject(target.provider, target.key)
    } catch (err) {
      console.error(`[media] storage check could not look up ${target.provider}:${target.key}`, err)
      stored = undefined
    }
    return { ...target, stored, row: rowByKey.get(target.key) ?? null }
  })
}

/** Rowless objects that are there right now, each with the verdict the scan would give it. */
async function inspectRowless(targets: StorageTarget[]): Promise<(InspectedTarget & { stored: StoredObject; verdict: RowlessVerdict })[]> {
  const [inspected, isClaimed, isPrivate] = await Promise.all([
    inspectTargets(uniqueTargets(targets)),
    buildClaimTest(),
    buildPrivateTest(),
  ])
  const out: (InspectedTarget & { stored: StoredObject; verdict: RowlessVerdict })[] = []
  for (const t of inspected) {
    // A row for the key (on any provider) means the library owns it, and an
    // object that is not there - or could not be looked up - is nothing to act on.
    if (t.row || !t.stored) continue
    out.push({ ...t, stored: t.stored, verdict: classifyRowlessObject(t.key, isClaimed, (key) => isPrivate(t.provider, key)) })
  }
  return out
}

export type DeleteOrphansResult = {
  deleted: number
  /** Selected keys left alone: no longer orphaned, not there, or the delete failed. */
  skipped: number
  reclaimedBytes: number
}

/**
 * Delete the selected objects that are still leftovers: in storage, no row, not
 * a module's private file, and nothing on the site naming them.
 */
export async function deleteOrphanedObjects(targets: StorageTarget[]): Promise<DeleteOrphansResult> {
  const unique = uniqueTargets(targets)
  const orphans = (await inspectRowless(unique)).filter((t) => t.verdict === 'orphaned')

  const outcomes = await mapWithConcurrency(orphans, LOOKUP_CONCURRENCY, async (t) => {
    try {
      await deleteMedia(t.provider, t.key)
      return t.stored.sizeBytes
    } catch (err) {
      console.error(`[media] storage check could not delete ${t.provider}:${t.key}`, err)
      return null
    }
  })

  const deleted = outcomes.filter((b): b is number => b !== null)
  return {
    deleted: deleted.length,
    skipped: unique.length - deleted.length,
    reclaimedBytes: deleted.reduce((n, b) => n + b, 0),
  }
}

/**
 * Rewrite the selected rows' `sizeBytes` to the size storage reports. Non-destructive:
 * it changes a number that was already wrong and touches no blob.
 */
export async function correctRecordedSizes(targets: StorageTarget[]): Promise<{ corrected: number }> {
  const inspected = await inspectTargets(uniqueTargets(targets))
  let corrected = 0
  for (const t of inspected) {
    if (!t.row || t.row.provider !== t.provider || !t.stored) continue
    if (t.row.sizeBytes === t.stored.sizeBytes) continue
    await prisma.media.update({ where: { id: t.row.id }, data: { sizeBytes: t.stored.sizeBytes } })
    corrected += 1
  }
  return { corrected }
}

export type AdoptClaimedResult = {
  /** Objects that now have a library entry. */
  adopted: number
  /** Bytes those entries brought into the library's own totals. */
  adoptedBytes: number
  /** Keys that could not be adopted, each with the reason in plain English. */
  skipped: { key: string; reason: string }[]
  /** Keys the caller asked for that are no longer claimed. */
  stale: number
}

/**
 * The library folder an already-stored object belongs in, from its key's own path.
 *
 * NOT getOrCreateFolderByPath: that one matches on the folder's DISPLAY name,
 * and a key segment is the SANITISED form of it. A library filed under "Product
 * Photos" holds its files at "media/product-photos/...", so matching by display
 * name finds nothing and quietly builds a second tree named after the slugs -
 * two folders, same files, on a page where the whole point is that the library
 * finally agrees with storage. So each level is matched on the sanitised name,
 * which is the form the key was built from and therefore the only form that can
 * be compared honestly. Nothing matching is a folder that genuinely is not there
 * yet, and it is created under the segment as its own name.
 */
async function folderIdForKeyPath(segments: string[]): Promise<string | null> {
  let parentId: string | null = null
  for (const segment of segments) {
    if (!segment) continue
    // Annotated because parentId is reassigned from this query's own result, and
    // an unannotated round trip makes the inference circular.
    const siblings: { id: string; name: string }[] =
      await prisma.folder.findMany({ where: { parentId }, select: { id: true, name: true } })
    const match = siblings.find((f) => sanitizeFolderSegment(f.name) === segment)
    parentId = match ? match.id : (await prisma.folder.create({ data: { name: segment, parentId } })).id
  }
  return parentId
}

/**
 * Give a library entry to objects the site is using but the library has never
 * heard of - the third pile in the storage check, and the only one that used to
 * have no way out of it.
 *
 * How a site gets there: a bulk import writes a 3D model's url straight into a
 * module's table without minting a row, or a library entry is deleted while a
 * module's own column still points at the file. Either way the object is live,
 * safe from the orphan sweep, and invisible to every figure on the media page.
 *
 * Nothing is copied, moved or re-encoded: this writes a row describing an object
 * that is already exactly where the row will say it is. The folder tree is walked
 * (and created) from the key's own path, so an adopted file lands in the library
 * where its url already says it lives.
 *
 * Only keys still claimed qualify, which is what stops a stale page adopting an
 * object that has since become a module's private file. Adoption itself runs one
 * key at a time: two keys in the same new folder, adopted at once, would each
 * create that folder.
 */
export async function adoptClaimedObjects(
  targets: StorageTarget[],
  uploadedById?: string,
): Promise<AdoptClaimedResult> {
  const unique = uniqueTargets(targets)
  const claimed = (await inspectRowless(unique)).filter((t) => t.verdict === 'claimed')

  const result: AdoptClaimedResult = { adopted: 0, adoptedBytes: 0, skipped: [], stale: unique.length - claimed.length }

  for (const object of claimed) {
    const { key } = object

    // The type comes from the key's extension, which is the same claim the media
    // Worker serves the file under - so an adopted row cannot disagree with what
    // a browser is already being sent. No extension it recognises, no row: a
    // guess here would be a wrong mimeType on a live file.
    const mimeType = contentTypeForKey(key)
    if (!mimeType) {
      result.skipped.push({ key, reason: 'the file type could not be worked out from its name' })
      continue
    }

    const prefix = mediaKeyPrefix(object.provider)
    if (!key.startsWith(prefix)) {
      result.skipped.push({ key, reason: 'it is not filed under this storage\u2019s media folder' })
      continue
    }

    const segments = key.slice(prefix.length).split('/').filter(Boolean)
    const filename = segments.pop()
    if (!filename) {
      result.skipped.push({ key, reason: 'it has no filename' })
      continue
    }

    try {
      const folderId = segments.length > 0 ? await folderIdForKeyPath(segments) : null
      await saveMediaRecord({
        key,
        // Rebuilt from the key by saveMediaRecord for every provider whose files
        // are served through the Worker, which is every provider whose contents
        // can be listed in the first place.
        url: '',
        provider: object.provider,
        mimeType,
        sizeBytes: object.stored.sizeBytes,
        originalName: filename,
        folderId,
        uploadedById,
      })
      result.adopted += 1
      result.adoptedBytes += object.stored.sizeBytes
    } catch (err) {
      // A row minted between the lookup and now (two admins, one list) trips the
      // unique key. Nothing is wrong with that outcome - the object has an entry,
      // which is what was asked for - so it is counted as stale, not failed.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        result.stale += 1
        continue
      }
      result.skipped.push({ key, reason: err instanceof Error ? err.message : 'it could not be added' })
    }
  }

  return result
}

export type PurgeMissingResult = {
  purged: number
  /** Rows left alone because something still points at them and force wasn't set. */
  skipped: { key: string; provider: MediaProviderType; originalName: string | null; references: string[] }[]
  /** Keys the caller asked for that are no longer missing, or whose file could not be looked up. */
  stale: number
}

/**
 * Delete the library rows whose file is no longer in storage - the drift you get
 * when someone tidies the bucket from the provider's own console.
 *
 * No blob is touched: the object these rows name is already gone, so there is
 * nothing to delete and calling the provider would only raise a not-found. The
 * destructive part is the row, so a row only qualifies when storage positively
 * says there is nothing at its key. A lookup that failed is not that answer, and
 * the row is left alone and counted as stale.
 *
 * A row still referenced by a page or a setting is skipped unless `force`. That
 * reference is already broken (the picture cannot load either way), but the
 * skipped list is the only place an admin gets told which pages need attention,
 * so it is worth one deliberate second look.
 */
export async function purgeMissingRows(targets: StorageTarget[], force = false): Promise<PurgeMissingResult> {
  const unique = uniqueTargets(targets)
  const inspected = await inspectTargets(unique)

  const candidates: MissingObject[] = []
  for (const t of inspected) {
    if (!t.row || t.row.provider !== t.provider || t.stored !== null) continue
    candidates.push({ id: t.row.id, key: t.row.key, provider: t.provider, originalName: t.row.originalName, sizeBytes: t.row.sizeBytes })
  }

  const result: PurgeMissingResult = { purged: 0, skipped: [], stale: unique.length - candidates.length }

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
        result.skipped.push({ key: row.key, provider: row.provider, originalName: row.originalName, references: refs })
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
