// The page store: finished public pages held in this process, handed out without
// running a render or a single database query.
//
// Why this exists. Public pages are rendered per request (`force-dynamic` on the
// routes, a layout that reads cookies, blocks that call connection()), so the
// Cache-Control the proxy adds is advice to whatever sits downstream and nothing more.
// A CDN keeps a copy per location, so a burst spread across countries misses in every
// one, and each miss was a full render with about a hundred queries. On one
// 2026-11 morning 450 addresses in under a minute took a site down for 90 seconds.
//
// The answer sits in the proxy rather than in the routes because every other route to
// a static page would mean rewriting every module's blocks, and because here it runs
// AFTER the setup, admin, status and members gates, so a held page cannot get round
// any of them. It only runs at all where the process is long-lived and knows its own
// port: a server under cactus-host. On Vercel and Netlify it is never reached.
//
// What a request gets:
//   fresh copy                 -> that copy. No render, no queries.
//   out-of-date copy, quiet    -> waits for a new render. The next visitor after an
//                                 edit sees the edit.
//   out-of-date copy, busy     -> the old copy at once, refreshed behind them.
//   no usable copy             -> joins the render already under way for that address,
//                                 or queues for one of a few places. A full queue
//                                 answers 503 with Retry-After rather than piling on.
//
// THE PROMISE, and every number below answers to it. A write to a watched table stops
// the copy being known good within WATCH_LAG (about 20s: poll interval plus Postgres's
// reporting delay). From then on it is only ever handed out under load and for
// STALE_GRACE_MS at most. The CDN in front may hold it for SHARED_WINDOW_SECONDS more,
// and the same again while it revalidates (lib/cache/page-cache.ts). That comes to
// under five minutes end to end, the most a price, stock level or hidden product can
// be out of date. A change by the clock alone, or to a table the owner told it to
// ignore, is caught by FRESH_FOR_MS instead.

import {
  CORE_IGNORED_TABLES,
  isIgnoredTable,
  isStorablePath,
  normaliseQuery,
  pageStoreKey,
  parseIgnoredTables,
  parsePathPatterns,
} from './policy'
import { isPrivatePath } from '@/lib/cache/page-cache'
import { GateRefusedError, RenderGate } from './gate'
import { PageStore, type StoredPage } from './store'
import { RenderTimeoutError, RenderUnavailableError, renderPage, unzipForClient, type RenderedPage } from './render'
import { changedTables, TABLE_WRITES_SQL, toTableWrites, type TableWrites, type WatcherRow } from './watcher'
import { registerPageStore, type PageStoreHandle } from './signal'
import { moduleAddressBases } from '@/lib/modules/cache-cookies'
import { prisma } from '@/lib/db/prisma'

const MEGABYTE = 1024 * 1024

export const FRESH_FOR_MS = 60 * 60 * 1000
export const STALE_GRACE_MS = 150 * 1000
const WATCH_INTERVAL_MS = 10 * 1000

const MAX_BYTES = 256 * MEGABYTE
const MAX_ENTRIES = 5000

// See the load test figures in wiki/Page-store.md for how these were arrived at.
const MAX_ACTIVE_RENDERS = 4
const MAX_QUEUED_RENDERS = 400
const MAX_QUEUE_WAIT_MS = 60 * 1000
const MAX_BACKGROUND_RENDERS = 2

// Warming and upkeep: one page at a time, only while nothing else is rendering, with
// a breath between. About a page a second at most, a fraction of one core.
const UPKEEP_TICK_MS = 500
const UPKEEP_GAP_MS = 500
const WARM_START_DELAY_MS = 20 * 1000
const WARM_MAX_PAGES = 1500
// Refreshed ahead of the freshness limit so a quiet page is warm when a burst lands.
const REFRESH_AHEAD_MS = 45 * 60 * 1000
// A variation address only earns upkeep if somebody came for it recently. Plain
// addresses always do: they are the ones a burst lands on.
const QUERY_UPKEEP_RECENT_MS = 60 * 60 * 1000
// After a refused connection, how long to leave the store out of it.
const SIT_OUT_MS = 60 * 1000

export type PageStoreSettings = { paths: string | null | undefined; ignoreTables: string | null | undefined }

export type PageStoreRequest = {
  method: string
  host: string
  path: string
  search: string
}

export type PageStoreAnswer = {
  state: 'HIT' | 'STALE' | 'MISS' | 'JOINED' | 'BUSY'
  status: number
  headers: Array<[string, string]>
  // Plain, never compressed. Next drops a proxy response's Content-Encoding and gzips
  // the body itself on the way out (next-server.js, then router-server.js), so a
  // compressed body here reaches the browser compressed twice and reads as garbage.
  body: Buffer | null
  retryAfterSeconds?: number
}

type Shared = { page: RenderedPage; key: string }

class Engine implements PageStoreHandle {
  readonly secret = crypto.randomUUID()
  private readonly store = new PageStore({
    maxBytes: MAX_BYTES,
    maxEntries: MAX_ENTRIES,
    freshForMs: FRESH_FOR_MS,
    staleGraceMs: STALE_GRACE_MS,
  })
  private readonly gate = new RenderGate({
    maxActive: MAX_ACTIVE_RENDERS,
    maxQueued: MAX_QUEUED_RENDERS,
    maxWaitMs: MAX_QUEUE_WAIT_MS,
  })
  private readonly inFlight = new Map<string, Promise<Shared>>()
  private readonly port: number

  private counters = { hits: 0, stale: 0, misses: 0, refused: 0, invalidations: 0 }
  private lastInvalidatedAt: number | null = null
  private lastInvalidatedBy: string[] = []
  private generation = 0
  private sitOutUntil = 0

  private settings: PageStoreSettings = { paths: '', ignoreTables: '' }
  private tableWrites: TableWrites | null = null
  private warmQueue: Array<{ host: string; path: string }> = []
  private warmLoaded = false
  private upkeepBusy = false
  private lastUpkeepAt = 0
  private readonly startedAt = Date.now()

  constructor(port: number) {
    this.port = port
    setInterval(() => void this.watch(), WATCH_INTERVAL_MS).unref?.()
    setInterval(() => void this.upkeep(), UPKEEP_TICK_MS).unref?.()
  }

  useSettings(settings: PageStoreSettings): void {
    this.settings = settings
  }

  // ── The handle the rest of the app reaches through ./signal.ts ─────────────
  invalidate(reason: string): void {
    this.markChanged([reason])
  }

  clear(): void {
    this.generation += 1
    this.store.clear()
  }

  stats() {
    return {
      entries: this.store.size,
      megabytes: Math.round((this.store.usedBytes / MEGABYTE) * 10) / 10,
      rendering: this.gate.activeCount,
      waiting: this.gate.queuedCount,
      ...this.counters,
      lastInvalidatedAt: this.lastInvalidatedAt,
      lastInvalidatedBy: this.lastInvalidatedBy,
    }
  }

  // ── Answering a request ────────────────────────────────────────────────────

  /** Null means "not for the store": the request carries on to a normal render. */
  async answer(req: PageStoreRequest): Promise<PageStoreAnswer | null> {
    if (Date.now() < this.sitOutUntil) return null
    const query = normaliseQuery(req.search)
    if (query === null) return null
    const key = pageStoreKey(req.host, req.path, query)
    const now = Date.now()

    const held = this.store.peek(key)
    if (held) {
      const state = this.store.stateOf(held, now)
      if (state === 'fresh') {
        this.counters.hits += 1
        this.store.touch(held, now)
        return this.fromPage(req, held, 'HIT')
      }
      // A quiet site makes the visitor wait a moment and shows the edit. A busy one
      // cannot afford that, and the grace period is what makes it acceptable.
      if (state === 'stale' && !this.gate.hasRoom) {
        this.counters.stale += 1
        this.store.touch(held, now)
        this.refreshInBackground(held)
        return this.fromPage(req, held, 'STALE')
      }
    }

    const joined = this.inFlight.has(key)
    try {
      const { page } = await this.renderShared(key, req.host, req.path, query)
      this.counters.misses += joined ? 0 : 1
      // Somebody else's cookie must not be handed to the visitors who queued alongside.
      if (page.setsCookie) return null
      return this.fromRendered(req, page, joined ? 'JOINED' : 'MISS')
    } catch (err) {
      if (err instanceof RenderUnavailableError) {
        // Nothing is listening where this process thought it was. Never let the store
        // be the reason a page is down: step aside and let requests through as normal.
        this.sitOutUntil = Date.now() + SIT_OUT_MS
        console.warn('[page-store] could not reach this server, standing aside for a minute:', err.message)
        return null
      }
      if (err instanceof GateRefusedError || err instanceof RenderTimeoutError) {
        this.counters.refused += 1
        const fallback = this.store.peek(key)
        if (fallback && this.store.stateOf(fallback, Date.now()) !== 'expired') return this.fromPage(req, fallback, 'STALE')
        return {
          state: 'BUSY',
          status: 503,
          headers: [['content-type', 'text/html; charset=utf-8'], ['cache-control', 'no-store']],
          body: req.method === 'HEAD' ? null : Buffer.from(BUSY_PAGE),
          retryAfterSeconds: 15,
        }
      }
      throw err
    }
  }

  private async fromPage(req: PageStoreRequest, page: StoredPage, state: 'HIT' | 'STALE'): Promise<PageStoreAnswer> {
    return this.encoded(req, page.status, page.headers, page.body, page.gzipped, state)
  }

  private async fromRendered(req: PageStoreRequest, page: RenderedPage, state: 'MISS' | 'JOINED'): Promise<PageStoreAnswer> {
    return this.encoded(req, page.status, page.headers, page.body, page.gzipped, state)
  }

  private async encoded(
    req: PageStoreRequest,
    status: number,
    headers: Array<[string, string]>,
    body: Buffer,
    gzipped: boolean,
    state: PageStoreAnswer['state'],
  ): Promise<PageStoreAnswer> {
    if (req.method === 'HEAD') return { state, status, headers, body: null }
    return { state, status, headers, body: gzipped ? await unzipForClient(body) : body }
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  // One render per address however many ask. Everyone arriving meanwhile awaits the
  // same promise, and the entry goes in the store before any of them resolve.
  private renderShared(key: string, host: string, path: string, query: string): Promise<Shared> {
    const existing = this.inFlight.get(key)
    if (existing) return existing
    const started = (async () => {
      await this.gate.acquire()
      try {
        return await this.renderAndHold(key, host, path, query)
      } finally {
        this.gate.release()
      }
    })().finally(() => this.inFlight.delete(key))
    this.inFlight.set(key, started)
    return started
  }

  private async renderAndHold(key: string, host: string, path: string, query: string): Promise<Shared> {
    const generationAtStart = this.generation
    const page = await renderPage({ port: this.port, secret: this.secret, host, path, query })
    const now = Date.now()
    if (page.unstorable === null) {
      this.store.set({
        key,
        host,
        path,
        query,
        status: page.status,
        headers: page.headers,
        body: page.body,
        gzipped: page.gzipped,
        renderedAt: now,
        // A write seen while this was rendering may have landed after it read the
        // data. It cannot be known good, so it goes in already out of date.
        staleSince: this.generation === generationAtStart ? null : now,
        lastHitAt: now,
      })
    } else {
      // An old copy of an address that now answers differently must not outlive it.
      this.store.delete(key)
      if (page.status >= 500 || page.setsCookie) console.warn(`[page-store] not holding ${path}${query}: ${page.unstorable}`)
    }
    return { page, key }
  }

  private refreshInBackground(page: StoredPage): void {
    if (this.inFlight.has(page.key)) return
    if (!this.gate.tryAcquireBackground(MAX_BACKGROUND_RENDERS)) return
    const started = this.renderAndHold(page.key, page.host, page.path, page.query)
      .finally(() => {
        this.gate.release()
        this.inFlight.delete(page.key)
      })
    this.inFlight.set(page.key, started)
    started.catch(() => undefined)
  }

  // ── Noticing changes ───────────────────────────────────────────────────────

  private markChanged(reasons: string[]): void {
    const now = Date.now()
    this.generation += 1
    this.counters.invalidations += 1
    this.lastInvalidatedAt = now
    this.lastInvalidatedBy = reasons.slice(0, 12)
    this.store.markAllStale(now)
  }

  private async watch(): Promise<void> {
    try {
      const rows = await prisma.$queryRawUnsafe<WatcherRow[]>(TABLE_WRITES_SQL)
      const after = toTableWrites(rows)
      const before = this.tableWrites
      this.tableWrites = after
      if (!before) return
      const ignored = [...CORE_IGNORED_TABLES, ...parseIgnoredTables(this.settings.ignoreTables)]
      const changed = changedTables(before, after, (table) => isIgnoredTable(table, ignored))
      if (changed.length > 0) this.markChanged(changed)
    } catch {
      // A failed look is not a change, and a blip must not throw out every held page.
      // The freshness limit still stands behind it.
    }
  }

  // ── Warming and upkeep ─────────────────────────────────────────────────────

  // Cold after every deploy (a held page names that build's script files, so nothing
  // may survive one), and the plain pages go quiet between visits, so a slow loop
  // keeps them ready. It stands aside whenever a visitor needs a render.
  private async upkeep(): Promise<void> {
    const now = Date.now()
    if (this.upkeepBusy || now - this.lastUpkeepAt < UPKEEP_GAP_MS || !this.gate.hasRoom || this.gate.activeCount > 0) return
    if (now < this.sitOutUntil || now - this.startedAt < WARM_START_DELAY_MS) return

    this.upkeepBusy = true
    try {
      if (!this.warmLoaded) {
        this.warmLoaded = true
        await this.loadWarmList()
      }
      const next = this.nextUpkeepTarget(Date.now())
      if (!next) return
      if (!this.gate.tryAcquireBackground(1)) return
      const key = pageStoreKey(next.host, next.path, next.query)
      try {
        await this.renderAndHold(key, next.host, next.path, next.query)
      } finally {
        this.gate.release()
      }
    } catch {
      // Upkeep is a nicety. A page that fails here is rendered when somebody asks.
    } finally {
      this.lastUpkeepAt = Date.now()
      this.upkeepBusy = false
    }
  }

  private nextUpkeepTarget(now: number): { host: string; path: string; query: string } | null {
    while (this.warmQueue.length > 0) {
      const next = this.warmQueue.shift()
      if (!next) break
      if (!this.store.peek(pageStoreKey(next.host, next.path, ''))) return { ...next, query: '' }
    }
    // Out-of-date copies first, oldest first; then whatever is coming up to its limit.
    let best: StoredPage | null = null
    let bestRank = Infinity
    for (const page of this.store.all()) {
      if (page.status !== 200) continue
      if (page.query !== '' && now - page.lastHitAt > QUERY_UPKEEP_RECENT_MS) continue
      const outOfDate = page.staleSince !== null
      if (!outOfDate && now - page.renderedAt < REFRESH_AHEAD_MS) continue
      const rank = outOfDate ? (page.staleSince ?? 0) - FRESH_FOR_MS : page.renderedAt
      if (rank < bestRank) {
        best = page
        bestRank = rank
      }
    }
    return best
  }

  // The site's own sitemap says which plain addresses matter, in the order it cares
  // about. Addresses with a query (one per buyable combination) are left to demand.
  private async loadWarmList(): Promise<void> {
    const origin = siteOrigin()
    if (!origin) return
    const rules = { paths: parsePathPatterns(this.settings.paths), moduleBases: moduleAddressBases }
    const sitemap = await renderPage({ port: this.port, secret: this.secret, host: origin.host, path: '/sitemap.xml', query: '' })
    if (sitemap.status !== 200) return
    const xml = (sitemap.gzipped ? await unzipForClient(sitemap.body) : sitemap.body).toString('utf8')
    const seen = new Set<string>()
    for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const address = parseAddress(match[1] ?? '')
      if (!address || address.host !== origin.host || address.search !== '') continue
      if (seen.has(address.path) || !isStorablePath(address.path, rules, isPrivatePath)) continue
      seen.add(address.path)
      this.warmQueue.push({ host: origin.host, path: address.path })
      if (this.warmQueue.length >= WARM_MAX_PAGES) break
    }
  }
}

function parseAddress(raw: string): { host: string; path: string; search: string } | null {
  try {
    const url = new URL(raw.trim())
    return { host: url.host, path: url.pathname, search: url.search }
  } catch {
    return null
  }
}

function siteOrigin(): { host: string } | null {
  const raw = process.env.SITE_URL?.trim()
  if (!raw) return null
  const address = parseAddress(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  return address ? { host: address.host } : null
}

const BUSY_PAGE = `<!doctype html><meta charset="utf-8"><title>Back in a moment</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:20vh auto;max-width:32rem;padding:0 1rem;text-align:center}</style><h1>Back in a moment</h1><p>We are a little busy just now. This page will be ready if you try again shortly.</p>`

// proxy.ts and everything else in the process share this one instance.
const ENGINE_KEY = '__cactusPageStoreEngine'
type WithEngine = typeof globalThis & { [ENGINE_KEY]?: Engine }

function engine(port: number): Engine {
  const scope = globalThis as WithEngine
  if (!scope[ENGINE_KEY]) {
    scope[ENGINE_KEY] = new Engine(port)
    registerPageStore(scope[ENGINE_KEY])
  }
  return scope[ENGINE_KEY]
}

function serverPort(): number | null {
  const port = Number(process.env.PORT)
  return Number.isInteger(port) && port > 0 ? port : null
}

/** True for the request this process made of itself to render a page for the store. */
export function isOwnRender(secretHeader: string | null): boolean {
  const running = (globalThis as WithEngine)[ENGINE_KEY]
  return !!secretHeader && !!running && secretHeader === running.secret
}

/** The whole of the store's public face, reached from the proxy through lib/proxy/data. */
export async function answerFromPageStore(req: PageStoreRequest, settings: PageStoreSettings): Promise<PageStoreAnswer | null> {
  const port = serverPort()
  if (port === null) return null
  const rules = { paths: parsePathPatterns(settings.paths), moduleBases: moduleAddressBases }
  if (!isStorablePath(req.path, rules, isPrivatePath)) return null
  const running = engine(port)
  running.useSettings(settings)
  return running.answer(req)
}
