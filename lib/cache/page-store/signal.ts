// How the rest of the app tells the page store that something changed, without
// importing it.
//
// proxy.ts and a route handler are separate bundles with their own copy of every
// module, so the only thing they share is the process. The engine leaves itself on
// globalThis and this file is the one place that reaches for it. No imports, so any
// route can use it and it costs nothing on a site not using the store.

export type PageStoreStats = {
  entries: number
  megabytes: number
  rendering: number
  waiting: number
  hits: number
  stale: number
  misses: number
  refused: number
  invalidations: number
  lastInvalidatedAt: number | null
  lastInvalidatedBy: string[]
}

export type PageStoreHandle = {
  invalidate: (reason: string) => void
  clear: () => void
  stats: () => PageStoreStats
}

const HANDLE_KEY = '__cactusPageStore'

type WithHandle = typeof globalThis & { [HANDLE_KEY]?: PageStoreHandle }

export function registerPageStore(handle: PageStoreHandle): void {
  ;(globalThis as WithHandle)[HANDLE_KEY] = handle
}

/** Every held page stops being known good. Safe to call on a site without the store. */
export function invalidatePageStore(reason: string): void {
  ;(globalThis as WithHandle)[HANDLE_KEY]?.invalidate(reason)
}

/** Throws every held page away. For the owner's own "purge everything" button. */
export function clearPageStore(): void {
  ;(globalThis as WithHandle)[HANDLE_KEY]?.clear()
}

/** What the store is doing, or null when it has not started in this process. */
export function pageStoreStats(): PageStoreStats | null {
  return (globalThis as WithHandle)[HANDLE_KEY]?.stats() ?? null
}
