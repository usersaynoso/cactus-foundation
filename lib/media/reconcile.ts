import { prisma } from '@/lib/db/prisma'
import { Prisma, type MediaProviderType } from '@prisma/client'
import { isMediaProviderConfigured } from '@/lib/config/env'
import { getMediaReferencesBulk, listStoredMediaKeys, mediaKeyPrefix, saveMediaRecord, type StoredObject } from '@/lib/media/upload'
import { loadMediaUsageIndex } from '@/lib/media/references'
import { getMediaPrivatePrefixes } from '@/lib/media/private-storage'
import { contentTypeForKey } from '@/lib/media/limits'
import { sanitizeFolderSegment } from '@/lib/media/organise'

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
 *
 * `isPrivate` answers "does a module keep this file outside the library on
 * purpose?", and it is checked FIRST - before the claim test, not after. A
 * module's private folder is off limits whether or not the usage index happened
 * to mention the file: a mail attachment nobody has opened yet is referenced by
 * nothing, and the wrong answer to that is a delete button over somebody's
 * invoice.
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
    // Folder placeholders: some providers materialise a directory as a zero-byte
    // object ending in "/". Not an orphan, just bookkeeping.
    if (o.key.endsWith('/')) continue
    // A module's own private folder. Never an orphan, never adoptable, and it is
    // asked before the claim test so an unopened attachment is as safe as a
    // referenced one.
    if (isPrivate(o.key)) {
      moduleOwned.push({ ...o, provider })
      moduleOwnedBytes += o.sizeBytes
      continue
    }
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

  return { orphaned, claimed, moduleOwned, missing, mismatched, orphanedBytes, claimedBytes, moduleOwnedBytes }
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

/**
 * The "does a module keep this outside the library on purpose?" test, built once
 * per scan and applied per provider, since each provider namespaces its own keys.
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

export async function reconcileMediaStorage(): Promise<StorageReconcile> {
  const rows = await prisma.media.findMany({
    select: { id: true, key: true, provider: true, originalName: true, sizeBytes: true },
  })

  const isClaimed = await buildClaimTest()
  const isPrivate = await buildPrivateTest()

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
    moduleOwned: [],
    missing: [],
    mismatched: [],
    orphanedBytes: 0,
    claimedBytes: 0,
    moduleOwnedBytes: 0,
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

    const diff = diffStorageAgainstRows(
      provider,
      providerRows,
      stored,
      isClaimed,
      (key) => isPrivate(provider, key),
    )
    result.orphaned.push(...diff.orphaned)
    result.claimed.push(...diff.claimed)
    result.moduleOwned.push(...diff.moduleOwned)
    result.missing.push(...diff.missing)
    result.mismatched.push(...diff.mismatched)
    result.orphanedBytes += diff.orphanedBytes
    result.claimedBytes += diff.claimedBytes
    result.moduleOwnedBytes += diff.moduleOwnedBytes

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
  result.moduleOwned.sort((a, b) => b.sizeBytes - a.sizeBytes || a.key.localeCompare(b.key))
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

export type AdoptClaimedResult = {
  /** Objects that now have a library entry. */
  adopted: number
  /** Bytes those entries brought into the library's own totals. */
  adoptedBytes: number
  /** Keys that could not be adopted, each with the reason in plain English. */
  skipped: { key: string; reason: string }[]
  /** Keys the caller asked for that a fresh scan no longer calls claimed. */
  stale: number
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
 * where its url already says it lives - see folderIdForKeyPath for why that walk
 * cannot use the ordinary by-name one.
 *
 * The caller's key list is a selection, never an authority - a fresh scan decides
 * what actually qualifies, which is what stops a stale page adopting an object
 * that has since become a module's private file.
 */
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

export async function adoptClaimedObjects(
  keys: string[],
  uploadedById?: string,
): Promise<AdoptClaimedResult> {
  const { claimed } = await reconcileMediaStorage()
  const byKey = new Map(claimed.map((c) => [c.key, c]))

  const result: AdoptClaimedResult = { adopted: 0, adoptedBytes: 0, skipped: [], stale: 0 }

  for (const key of keys) {
    const object = byKey.get(key)
    if (!object) { result.stale += 1; continue }

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
        sizeBytes: object.sizeBytes,
        originalName: filename,
        folderId,
        uploadedById,
      })
      result.adopted += 1
      result.adoptedBytes += object.sizeBytes
    } catch (err) {
      // A row minted between the scan and now (two admins, one list) trips the
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
