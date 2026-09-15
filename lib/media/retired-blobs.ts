import type { MediaProviderType } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { getPageCacheCached } from '@/lib/config/site'
import type { MediaMoveReason } from '@/lib/media/former-addresses'

// A superseded blob is deleted LATER, not now.
//
// Every in-place change to a media item - optimise, resize, crop, replace, rename,
// move, dedupe, a remade shrunk copy - writes the new bytes, repoints every
// reference core and the installed modules can reach, and then used to delete the
// old blob on the spot. The repoint is thorough; it just cannot reach a page that is
// not in the database. A CDN that saved a product page a minute before the optimise
// goes on serving that saved copy - old addresses and all - for the whole cache
// window, and with the old blob gone every one of those addresses 404s. Seen on a
// live shop 2026-09-14: a bulk swatch optimise, and a cached product page drawing a
// broken image in place of every colour for well over an hour.
//
// So the old blob is queued (MediaRetiredBlob) with a delete-after time long enough
// for every cache that could hold such a page to have let go, and the hourly core
// cron (/api/cron/media/retired-blobs) deletes it then. Leaving a few superseded
// files in storage for a day costs pennies; a page of broken pictures costs a sale.
//
// Deliberately NOT the other fix - purging the pages that name the item. The pages
// that name a swatch live in module tables core cannot see, and every combination
// of a product's options is its own cache entry; a purge would have to find them
// all and would still miss a browser tab that has been open since lunch.

/** What superseded a blob. The move reasons, plus a shrunk copy remade or dropped. */
export type BlobRetirementReason = MediaMoveReason | 'rendition'

// On top of the cache windows: covers a tab left open on a page that lazy-loads its
// pictures, Next's client-side router cache, and the odd CDN edge that keeps a copy
// a little past its welcome. An hour of spare storage is nothing.
export const RETIREMENT_MARGIN_SECONDS = 3600

// Failed deletes before the queue gives up and leaves the blob as an ordinary
// storage-check leftover. Retries back off by this much per attempt.
export const MAX_DELETE_ATTEMPTS = 5
const RETRY_BACKOFF_SECONDS = 3600

// Rows taken per pass and deletes in flight at once. Superseded blobs arrive in
// bursts - a bulk optimise, a folder move of thousands - so the sweep pages through
// them rather than loading the queue, and runs a few deletes at a time rather than
// looking like an attack to the provider's rate limiter.
const SWEEP_PAGE_SIZE = 200
const SWEEP_CONCURRENCY = 8

type PageCacheWindows = { ttl: number; longTtl: number; vercelEdgeTtl: number }

/**
 * How long a superseded blob must outlive its replacement.
 *
 * A CDN may hold a page for its window and then serve it stale for the same again
 * while it revalidates (`max-age=N, stale-while-revalidate=N` - see
 * sharedCacheDirectives in lib/cache/page-cache.ts), so twice the longer of the two
 * windows. Vercel's own edge can hand a copy downstream that it has already held for
 * its own ttl, so that is added on top. Then the margin.
 *
 * Whether the page cache is switched ON is ignored on purpose: an owner who turned
 * it off five minutes ago still has pages sitting in a CDN from before, under the
 * windows stored here.
 */
export function retirementHoldSeconds(windows: PageCacheWindows): number {
  const cdnWindow = Math.max(windows.ttl, windows.longTtl, 0)
  return 2 * cdnWindow + Math.max(windows.vercelEdgeTtl, 0) + RETIREMENT_MARGIN_SECONDS
}

/**
 * Queue a superseded blob for deletion once no cached page can still be naming it.
 *
 * Call this where a flow used to call deleteMedia on the bytes an item has just
 * moved off, AFTER its references were repointed. Not for a deliberate delete of
 * the item itself - a file the owner binned should go when they bin it.
 *
 * Never throws. A queue that could not be written leaves the blob in storage,
 * where the storage check lists it as a leftover: the safe direction, and the same
 * outcome the old best-effort delete had when storage refused.
 */
export async function retireMediaBlob(
  provider: MediaProviderType,
  key: string,
  reason: BlobRetirementReason,
): Promise<void> {
  if (!key) return
  try {
    const windows = await getPageCacheCached()
    const deleteAfter = new Date(Date.now() + retirementHoldSeconds(windows) * 1000)
    // The same blob retired twice (moved off, moved back, moved off again) keeps
    // the LATER of the two deadlines: the first one's pages may still be out there.
    const existing = await prisma.mediaRetiredBlob.findUnique({
      where: { provider_key: { provider, key } },
      select: { deleteAfter: true },
    })
    const later = existing && existing.deleteAfter > deleteAfter ? existing.deleteAfter : deleteAfter
    await prisma.mediaRetiredBlob.upsert({
      where: { provider_key: { provider, key } },
      create: { provider, key, reason, deleteAfter: later },
      update: { reason, deleteAfter: later, attempts: 0, lastError: null },
    })
  } catch (err) {
    console.error(`[media] could not queue superseded blob ${provider}:${key} for deletion; left in storage`, err)
  }
}

export type RetiredBlobSweep = {
  /** Blobs deleted from storage. */
  deleted: number
  /** Queue entries dropped because a library item answers to that key again. */
  reclaimed: number
  /** Deletes that failed and were put back for a later pass. */
  retrying: number
  /** Deletes that failed for the last time; the blob is left as a leftover. */
  abandoned: number
  /** True when the deadline stopped the sweep with due entries still queued. */
  more: boolean
}

type DueRow = { provider: MediaProviderType; key: string; attempts: number }

/**
 * Delete every queued blob whose time has come, until the queue is empty or the
 * deadline passes. Safe to run twice at once: a delete of a blob already gone is a
 * no-op on every provider, and the row delete tolerates a row already removed.
 */
export async function sweepRetiredMediaBlobs(opts: { deadline: number }): Promise<RetiredBlobSweep> {
  // Loaded here rather than at the top: upload.ts queues blobs through this file,
  // and a static import both ways is a cycle.
  const { deleteMedia } = await import('@/lib/media/upload')
  const result: RetiredBlobSweep = { deleted: 0, reclaimed: 0, retrying: 0, abandoned: 0, more: false }

  for (;;) {
    if (Date.now() >= opts.deadline) {
      result.more = (await prisma.mediaRetiredBlob.count({ where: { deleteAfter: { lte: new Date() } } })) > 0
      return result
    }

    const due: DueRow[] = await prisma.mediaRetiredBlob.findMany({
      where: { deleteAfter: { lte: new Date() } },
      orderBy: { deleteAfter: 'asc' },
      take: SWEEP_PAGE_SIZE,
      select: { provider: true, key: true, attempts: true },
    })
    if (due.length === 0) return result

    // A key a library row holds again - an item moved back to where it was, or a
    // new upload that landed on the same exact name - is live bytes, not a
    // leftover. Media.key is unique across providers, so the key alone settles it.
    // (A new upload still mid-flight, its bytes written and its row not yet, cannot
    // be seen from here. That window is milliseconds wide and the delete it would
    // race used to happen on every single move.)
    const live = new Set(
      (await prisma.media.findMany({ where: { key: { in: due.map((d) => d.key) } }, select: { key: true } })).map((m) => m.key),
    )

    let cursor = 0
    const worker = async () => {
      for (let i = cursor++; i < due.length; i = cursor++) {
        const row = due[i] as DueRow
        const where = { provider_key: { provider: row.provider, key: row.key } }
        if (live.has(row.key)) {
          await prisma.mediaRetiredBlob.deleteMany({ where: { provider: row.provider, key: row.key } })
          result.reclaimed += 1
          continue
        }
        try {
          await deleteMedia(row.provider, row.key)
          await prisma.mediaRetiredBlob.deleteMany({ where: { provider: row.provider, key: row.key } })
          result.deleted += 1
        } catch (err) {
          const attempts = row.attempts + 1
          const message = err instanceof Error ? err.message : 'Unknown error'
          if (attempts >= MAX_DELETE_ATTEMPTS) {
            console.error(`[media] giving up on superseded blob ${row.provider}:${row.key} after ${attempts} tries: ${message}`)
            await prisma.mediaRetiredBlob.deleteMany({ where: { provider: row.provider, key: row.key } })
            result.abandoned += 1
          } else {
            await prisma.mediaRetiredBlob
              .update({
                where,
                data: {
                  attempts,
                  lastError: message.slice(0, 1000),
                  deleteAfter: new Date(Date.now() + attempts * RETRY_BACKOFF_SECONDS * 1000),
                },
              })
              .catch(() => {})
            result.retrying += 1
          }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(SWEEP_CONCURRENCY, due.length) }, worker))
  }
}

/**
 * Every key still waiting to be deleted, per provider. Read by the storage check,
 * which must not offer these as leftovers: deleting one early is exactly the broken
 * picture the queue exists to prevent.
 */
export async function listRetiringKeys(): Promise<(provider: MediaProviderType, key: string) => boolean> {
  const rows = await prisma.mediaRetiredBlob.findMany({ select: { provider: true, key: true } })
  const keys = new Set(rows.map((r) => `${r.provider} ${r.key}`))
  return (provider, key) => keys.has(`${provider} ${key}`)
}
