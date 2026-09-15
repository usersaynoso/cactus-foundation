import { randomUUID } from 'crypto'
import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { getSearchSettings, setLastIndexAt } from './settings'
import { SEARCH_SOURCE_KEYS, type SearchDocument, type SearchSourceKey } from './types'
import type { SearchAdapter } from './adapters/types'
import { pagesAdapter } from './adapters/pages'
import { shopProductAdapter, shopCategoryAdapter, shopCollectionAdapter } from './adapters/shop'
import { gazettePostAdapter } from './adapters/gazette'
import { directoryEntryAdapter } from './adapters/directory'
import { boardsThreadAdapter } from './adapters/boards'
import { memberAdapter } from './adapters/members'

const ADAPTERS: SearchAdapter[] = [
  pagesAdapter,
  shopProductAdapter,
  shopCategoryAdapter,
  shopCollectionAdapter,
  gazettePostAdapter,
  directoryEntryAdapter,
  boardsThreadAdapter,
  memberAdapter,
]

const BATCH_SIZE = 50
// tsvector input is capped at ~1MB; a pathological body is truncated rather
// than aborting the whole run.
const MAX_BODY_CHARS = 100_000

async function installedModuleNames(): Promise<Set<string>> {
  const rows = await prisma.module.findMany({ where: INSTALLED_MODULE_WHERE, select: { name: true } })
  return new Set(rows.map((r) => r.name))
}

// Sources that are present in this install AND not switched off in settings.
export async function listAvailableSources(): Promise<Array<{ key: SearchSourceKey; label: string; enabled: boolean }>> {
  const [installed, settings] = await Promise.all([installedModuleNames(), getSearchSettings()])
  const out: Array<{ key: SearchSourceKey; label: string; enabled: boolean }> = []
  for (const adapter of ADAPTERS) {
    let available = false
    try {
      available = await adapter.isAvailable(installed)
    } catch {
      available = false
    }
    if (!available) continue
    out.push({ key: adapter.source, label: adapter.label, enabled: settings.sources[adapter.source] !== false })
  }
  return out
}

async function upsertDocument(doc: SearchDocument, language: string): Promise<void> {
  const body = doc.body.length > MAX_BODY_CHARS ? doc.body.slice(0, MAX_BODY_CHARS) : doc.body
  await prisma.$executeRaw`
    INSERT INTO "srch_documents" (
      "id", "source", "entity_id", "title", "excerpt", "body", "url",
      "image_url", "extra", "tier", "source_updated_at", "indexed_at", "search_vector"
    ) VALUES (
      ${`${doc.source}:${doc.entityId}`}, ${doc.source}, ${doc.entityId}, ${doc.title}, ${doc.excerpt}, ${body}, ${doc.url},
      ${doc.imageUrl}, ${doc.extra ? JSON.stringify(doc.extra) : null}::jsonb, ${doc.tier}, ${doc.sourceUpdatedAt}, NOW(),
      setweight(to_tsvector(${language}::regconfig, ${doc.title}), 'A')
        || setweight(to_tsvector(${language}::regconfig, ${doc.excerpt ?? ''}), 'B')
        || setweight(to_tsvector(${language}::regconfig, ${body}), 'C')
    )
    ON CONFLICT ("source", "entity_id") DO UPDATE SET
      "title" = EXCLUDED."title",
      "excerpt" = EXCLUDED."excerpt",
      "body" = EXCLUDED."body",
      "url" = EXCLUDED."url",
      "image_url" = EXCLUDED."image_url",
      "extra" = EXCLUDED."extra",
      "tier" = EXCLUDED."tier",
      "source_updated_at" = EXCLUDED."source_updated_at",
      "indexed_at" = NOW(),
      "search_vector" = EXCLUDED."search_vector"
  `
}

// Removes indexed rows whose entity is no longer public - unpublished pages,
// archived products, boards whose visibility flipped to PRIVATE, and so on.
async function deleteVanished(source: SearchSourceKey, publicIds: string[]): Promise<number> {
  const result = publicIds.length
    ? await prisma.$executeRaw`
        DELETE FROM "srch_documents" WHERE "source" = ${source} AND NOT ("entity_id" = ANY(${publicIds}))
      `
    : await prisma.$executeRaw`
        DELETE FROM "srch_documents" WHERE "source" = ${source}
      `
  return result
}

export type IndexCursor = { source: SearchSourceKey; offset: number }

export type IndexRunResult = {
  done: boolean
  cursor: IndexCursor | null
  processed: number
  deleted: number
  errors: string[]
}

// One bounded indexing pass. Module API routes have an un-overridable 60s
// ceiling, so the runner stops cleanly at the deadline and returns a cursor;
// the caller (admin rebuild loop, cron) re-invokes with it until done: true.
export async function runIndex(opts: {
  full?: boolean
  sources?: SearchSourceKey[]
  cursor?: IndexCursor | null
  deadlineMs?: number
} = {}): Promise<IndexRunResult> {
  const startedAt = Date.now()
  const deadlineMs = opts.deadlineMs ?? 45_000
  const settings = await getSearchSettings()
  const installed = await installedModuleNames()
  const since = opts.full ? null : settings.lastIndexAt

  const wanted = opts.sources?.length
    ? SEARCH_SOURCE_KEYS.filter((k) => opts.sources?.includes(k))
    : [...SEARCH_SOURCE_KEYS]

  let processed = 0
  let deleted = 0
  const errors: string[] = []
  let resuming = Boolean(opts.cursor)

  for (const adapter of ADAPTERS) {
    if (!wanted.includes(adapter.source)) continue
    if (resuming && adapter.source !== opts.cursor?.source) continue

    try {
      const available = await adapter.isAvailable(installed)
      const enabled = settings.sources[adapter.source] !== false
      if (!available || !enabled) {
        // A disabled or absent source keeps nothing in the index.
        deleted += await deleteVanished(adapter.source, [])
        resuming = false
        continue
      }

      const ids = opts.full || !since ? await adapter.listIds() : await adapter.listChangedSince(since)
      let offset = resuming ? (opts.cursor?.offset ?? 0) : 0
      resuming = false

      while (offset < ids.length) {
        if (Date.now() - startedAt > deadlineMs) {
          return { done: false, cursor: { source: adapter.source, offset }, processed, deleted, errors }
        }
        const batch = ids.slice(offset, offset + BATCH_SIZE)
        const docs = await adapter.fetchDocuments(batch, { excerptLength: settings.excerptLength })
        for (const doc of docs) {
          await upsertDocument(doc, settings.language)
          processed += 1
        }
        offset += batch.length
      }

      // Source fully processed this run: reconcile deletions against the
      // complete current public id set (cheap ids-only query).
      const publicIds = opts.full || !since ? ids : await adapter.listIds()
      deleted += await deleteVanished(adapter.source, publicIds)
    } catch (err) {
      errors.push(`${adapter.source}: ${err instanceof Error ? err.message : String(err)}`)
      resuming = false
    }
  }

  // Only a run that made it through every wanted source moves the high-water
  // mark - a partial (cursored) run must not hide unprocessed changes.
  if (!opts.sources?.length) {
    await setLastIndexAt(new Date(startedAt))
  }
  return { done: true, cursor: null, processed, deleted, errors }
}

export type IndexStatus = {
  sources: Array<{
    key: SearchSourceKey
    label: string
    available: boolean
    enabled: boolean
    documentCount: number
    lastIndexedAt: string | null
  }>
  totalDocuments: number
  lastRunAt: string | null
}

export async function getIndexStatus(): Promise<IndexStatus> {
  const [settings, installed, counts] = await Promise.all([
    getSearchSettings(),
    installedModuleNames(),
    prisma.$queryRaw<Array<{ source: string; count: bigint; last_indexed: Date | null }>>`
      SELECT "source", COUNT(*) AS count, MAX("indexed_at") AS last_indexed
      FROM "srch_documents" GROUP BY "source"
    `,
  ])
  const bySource = new Map(counts.map((c) => [c.source, c]))
  const sources: IndexStatus['sources'] = []
  for (const adapter of ADAPTERS) {
    let available = false
    try {
      available = await adapter.isAvailable(installed)
    } catch {
      available = false
    }
    const row = bySource.get(adapter.source)
    sources.push({
      key: adapter.source,
      label: adapter.label,
      available,
      enabled: settings.sources[adapter.source] !== false,
      documentCount: row ? Number(row.count) : 0,
      lastIndexedAt: row?.last_indexed ? row.last_indexed.toISOString() : null,
    })
  }
  return {
    sources,
    totalDocuments: sources.reduce((sum, s) => sum + s.documentCount, 0),
    lastRunAt: settings.lastIndexAt ? settings.lastIndexAt.toISOString() : null,
  }
}

export async function logQuery(query: string, resultCount: number, sources: string | null): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "srch_queries" ("id", "query", "normalized", "result_count", "sources")
    VALUES (${randomUUID()}, ${query.slice(0, 200)}, ${query.trim().toLowerCase().slice(0, 200)}, ${resultCount}, ${sources})
  `
}

// ::int4 is load-bearing. Prisma sends a JS integer as bigint, and there is no
// make_interval(days => bigint) - Postgres answers 42883 and the nightly cron that
// calls this returns a 500. Every named make_interval argument except `secs` is int4.
export async function purgeOldQueries(retentionDays: number): Promise<number> {
  return prisma.$executeRaw`
    DELETE FROM "srch_queries" WHERE "created_at" < NOW() - make_interval(days => ${retentionDays}::int4)
  `
}
