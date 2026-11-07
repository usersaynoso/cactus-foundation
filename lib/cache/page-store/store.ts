// The bounded in-memory half of the page store: entries, what state each is in, and
// which one goes when there is no room. No I/O, and the clock is passed in, so every
// rule here is tested without waiting for anything.

export type StoredPage = {
  key: string
  // The address to re-render it from, tracking tags already gone.
  host: string
  path: string
  query: string
  status: number
  headers: Array<[string, string]>
  // Gzipped when `gzipped`; compressed bodies are the whole reason a page is cheap to hold.
  body: Buffer
  gzipped: boolean
  renderedAt: number
  // When this copy first stopped being known good. Null while it still is.
  staleSince: number | null
  lastHitAt: number
}

export type PageState = 'fresh' | 'stale' | 'expired'

export type StoreLimits = {
  maxBytes: number
  maxEntries: number
  // How long a copy is trusted with no write seen at all. The only thing this catches
  // is content that changes by the clock alone, and writes the watcher cannot see.
  freshForMs: number
  // How long a copy may still be handed out after it stopped being known good. This
  // is the number the "how out of date can a page get" promise rests on.
  staleGraceMs: number
}

// Pages the store would rather lose first: every buyable combination of a product
// and every unknown address can each fill it on their own, and neither should push
// out the pages people actually land on.
function isExpendable(page: StoredPage): boolean {
  return page.query !== '' || page.status !== 200
}

export class PageStore {
  private readonly pages = new Map<string, StoredPage>()
  private bytes = 0

  constructor(private readonly limits: StoreLimits) {}

  get size(): number {
    return this.pages.size
  }

  get usedBytes(): number {
    return this.bytes
  }

  /** The entry for a key, with no opinion on whether it may be served. See stateOf. */
  peek(key: string): StoredPage | undefined {
    return this.pages.get(key)
  }

  stateOf(page: StoredPage, now: number): PageState {
    const staleSince = Math.min(page.staleSince ?? Infinity, page.renderedAt + this.limits.freshForMs)
    if (now < staleSince) return 'fresh'
    return now - staleSince <= this.limits.staleGraceMs ? 'stale' : 'expired'
  }

  /** Records a serve: moves the entry to the safe end of the eviction order. */
  touch(page: StoredPage, now: number): void {
    page.lastHitAt = now
    this.pages.delete(page.key)
    this.pages.set(page.key, page)
  }

  set(page: StoredPage): void {
    const existing = this.pages.get(page.key)
    if (existing) {
      this.bytes -= existing.body.length
      this.pages.delete(page.key)
    }
    // Bigger than the whole budget: holding it would mean evicting everything else.
    if (page.body.length > this.limits.maxBytes) return
    this.pages.set(page.key, page)
    this.bytes += page.body.length
    this.evict(page.key)
  }

  delete(key: string): void {
    const existing = this.pages.get(key)
    if (!existing) return
    this.bytes -= existing.body.length
    this.pages.delete(key)
  }

  clear(): void {
    this.pages.clear()
    this.bytes = 0
  }

  /** Something changed: every copy that was still known good stops being, from now. */
  markAllStale(now: number): void {
    for (const page of this.pages.values()) {
      if (page.staleSince === null) page.staleSince = now
    }
  }

  all(): IterableIterator<StoredPage> {
    return this.pages.values()
  }

  private evict(justAdded: string): void {
    while (this.bytes > this.limits.maxBytes || this.pages.size > this.limits.maxEntries) {
      const victim = this.pickVictim(justAdded)
      if (!victim) return
      this.bytes -= victim.body.length
      this.pages.delete(victim.key)
    }
  }

  // Oldest-served expendable page, else oldest-served page. Map order is serve order.
  private pickVictim(justAdded: string): StoredPage | undefined {
    let oldest: StoredPage | undefined
    for (const page of this.pages.values()) {
      if (page.key === justAdded) continue
      if (isExpendable(page)) return page
      oldest ??= page
    }
    return oldest
  }
}
