// Type-only - erased at build, so this file stays free of the server-only
// reconcile module (and its prisma import) and the storage check's client half
// can use it.
import type { ProviderScan, StorageReconcile } from '@/lib/media/reconcile'

// ---------------------------------------------------------------------------
// Assembling a storage check out of its slices.
//
// A bucket too big to list inside one request's time limit is scanned as a run
// of requests, each describing an exact key range (see scanMediaStorageChunk).
// Every slice is a complete, self-consistent report about its own range, so the
// whole picture is simply their sum - which is all this file does. Pure, and
// shared by both halves: the server builds each slice from an empty report and
// the page folds the slices together as they arrive.
// ---------------------------------------------------------------------------

export function emptyReconcile(): StorageReconcile {
  return {
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
}

/**
 * One provider's line across every slice that touched it. Counts add up; a
 * provider is only "scanned" if every slice of it was, because one skipped slice
 * makes the whole provider's figures a partial count.
 */
function mergeProviders(a: ProviderScan[], b: ProviderScan[]): ProviderScan[] {
  const out = a.map((p) => ({ ...p }))
  for (const next of b) {
    const existing = out.find((p) => p.provider === next.provider)
    if (!existing) {
      out.push({ ...next })
      continue
    }
    existing.storedObjects += next.storedObjects
    existing.storedBytes += next.storedBytes
    if (!next.scanned) {
      existing.scanned = false
      existing.skippedReason = existing.skippedReason ?? next.skippedReason
    }
  }
  return out
}

/** Every list in the order an admin wants to act in: biggest first, then by key. */
export function sortReconcile(report: StorageReconcile): StorageReconcile {
  const bySizeThenKey = <T extends { sizeBytes: number; key: string }>(list: T[]) =>
    [...list].sort((x, y) => y.sizeBytes - x.sizeBytes || x.key.localeCompare(y.key))
  return {
    ...report,
    orphaned: bySizeThenKey(report.orphaned),
    claimed: bySizeThenKey(report.claimed),
    moduleOwned: bySizeThenKey(report.moduleOwned),
    missing: [...report.missing].sort((x, y) => x.key.localeCompare(y.key)),
    mismatched: [...report.mismatched].sort((x, y) => x.key.localeCompare(y.key)),
  }
}

/** The two reports as one, sorted. Neither argument is changed. */
export function mergeReconcile(a: StorageReconcile, b: StorageReconcile): StorageReconcile {
  return sortReconcile({
    providers: mergeProviders(a.providers, b.providers),
    orphaned: [...a.orphaned, ...b.orphaned],
    claimed: [...a.claimed, ...b.claimed],
    moduleOwned: [...a.moduleOwned, ...b.moduleOwned],
    missing: [...a.missing, ...b.missing],
    mismatched: [...a.mismatched, ...b.mismatched],
    orphanedBytes: a.orphanedBytes + b.orphanedBytes,
    claimedBytes: a.claimedBytes + b.claimedBytes,
    moduleOwnedBytes: a.moduleOwnedBytes + b.moduleOwnedBytes,
    partial: a.partial || b.partial,
  })
}
