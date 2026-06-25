// Media migration: moves every Media row not already on the active provider onto
// it, in small batches. Exactly one job runs at a time (enforced by querying for
// an active job rather than a separate lock row). Batches are triggered by repeated
// client-side calls while the admin keeps the migration screen open — never a Cron.

import type { MediaProviderType, MediaMigrationJob } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { downloadMedia, uploadMedia, deleteMedia } from '@/lib/media/upload'

export const ACTIVE_STATUSES = ['pending', 'running']
export const BATCH_SIZE = 15

export type FailedItem = { id: string; error: string }

function parseFailed(json: unknown): FailedItem[] {
  if (Array.isArray(json)) return json as FailedItem[]
  return []
}

// The single active job, if any.
export async function getActiveJob(): Promise<MediaMigrationJob | null> {
  return prisma.mediaMigrationJob.findFirst({
    where: { status: { in: ACTIVE_STATUSES } },
    orderBy: { startedAt: 'desc' },
  })
}

// Most recent job of any status (for the status endpoint).
export async function getLatestJob(): Promise<MediaMigrationJob | null> {
  return prisma.mediaMigrationJob.findFirst({ orderBy: { startedAt: 'desc' } })
}

// Count of rows that still need migrating onto `toProvider`.
export async function countPending(toProvider: MediaProviderType): Promise<number> {
  return prisma.media.count({ where: { provider: { not: toProvider } } })
}

// Per-provider row count.
export async function providerBreakdown(): Promise<Record<string, number>> {
  const grouped = await prisma.media.groupBy({ by: ['provider'], _count: { _all: true } })
  const breakdown: Record<string, number> = {}
  for (const g of grouped) breakdown[g.provider] = g._count._all
  return breakdown
}

// Start a job targeting `toProvider`. Returns null if one is already active.
export async function startJob(toProvider: MediaProviderType): Promise<MediaMigrationJob | null> {
  const existing = await getActiveJob()
  if (existing) return null
  const total = await countPending(toProvider)
  return prisma.mediaMigrationJob.create({
    data: { toProvider, status: 'pending', totalItems: total },
  })
}

export async function cancelJob(): Promise<boolean> {
  const job = await getActiveJob()
  if (!job) return false
  await prisma.mediaMigrationJob.update({
    where: { id: job.id },
    data: { status: 'cancelled', completedAt: new Date() },
  })
  return true
}

export type BatchResult = {
  done: boolean
  migratedItems: number
  failedItemIds: FailedItem[]
  cursor: string | null
  status: string
}

// Process one batch of the active job. Per item: download original bytes from the
// current provider, upload to the destination, then (only after a confirmed upload)
// update the row's provider/key/url in a single write, then best-effort delete the
// original. A failed item is recorded and the run continues.
export async function processBatch(): Promise<BatchResult> {
  const job = await getActiveJob()
  if (!job) {
    return { done: true, migratedItems: 0, failedItemIds: [], cursor: null, status: 'none' }
  }

  // Mark running on first batch.
  if (job.status === 'pending') {
    await prisma.mediaMigrationJob.update({ where: { id: job.id }, data: { status: 'running' } })
  }

  const toProvider = job.toProvider
  const failed = parseFailed(job.failedItemIds)
  const failedIds = new Set(failed.map((f) => f.id))

  // Fetch the next batch: rows not on the destination, after the cursor, excluding
  // already-failed ids so a failing item doesn't block the rest forever.
  const batch = await prisma.media.findMany({
    where: {
      provider: { not: toProvider },
      ...(job.cursor ? { id: { gt: job.cursor } } : {}),
      ...(failedIds.size ? { id: { notIn: [...failedIds] } } : {}),
    },
    orderBy: { id: 'asc' },
    take: BATCH_SIZE,
  })

  if (batch.length === 0) {
    // Nothing left to process (everything migrated or only failed items remain).
    const remaining = await prisma.media.count({
      where: { provider: { not: toProvider }, id: { notIn: failed.length ? [...failedIds] : ['__none__'] } },
    })
    const status = remaining > 0 ? 'running' : failed.length > 0 ? 'failed' : 'completed'
    const updated = await prisma.mediaMigrationJob.update({
      where: { id: job.id },
      data: status === 'running' ? {} : { status, completedAt: new Date() },
    })
    return {
      done: status !== 'running',
      migratedItems: updated.migratedItems,
      failedItemIds: failed,
      cursor: updated.cursor,
      status,
    }
  }

  let migrated = job.migratedItems
  let cursor = job.cursor

  for (const item of batch) {
    try {
      const bytes = await downloadMedia(item.provider, item.key, item.url)
      const result = await uploadMedia(bytes, item.mimeType, toProvider)
      // Confirmed upload: update the row in a single write.
      await prisma.media.update({
        where: { id: item.id },
        data: { provider: toProvider, key: result.key, url: result.url },
      })
      migrated += 1
      cursor = item.id
      // Best-effort delete of the original; an orphan costs storage, doing this
      // before the row update would risk real data loss.
      try {
        await deleteMedia(item.provider, item.key)
      } catch (delErr) {
        console.error(`[media-migration] failed to delete original ${item.id}:`, delErr)
      }
    } catch (err) {
      failed.push({ id: item.id, error: err instanceof Error ? err.message : 'Unknown error' })
      // Advance the cursor past this item too so the next batch moves on; the item
      // stays recorded in failedItemIds for a later "retry just these" run.
      cursor = item.id
    }
  }

  const remainingAfter = await prisma.media.count({
    where: {
      provider: { not: toProvider },
      id: { notIn: failed.length ? failed.map((f) => f.id) : ['__none__'] },
    },
  })
  const done = remainingAfter === 0
  const status = done ? (failed.length > 0 ? 'failed' : 'completed') : 'running'

  const updated = await prisma.mediaMigrationJob.update({
    where: { id: job.id },
    data: {
      migratedItems: migrated,
      cursor,
      failedItemIds: failed,
      lastError: failed.length ? (failed[failed.length - 1]?.error ?? job.lastError) : job.lastError,
      ...(done ? { status, completedAt: new Date() } : {}),
    },
  })

  return { done, migratedItems: updated.migratedItems, failedItemIds: failed, cursor: updated.cursor, status }
}

// Reset the failed list so the next batches retry just those items. Re-opens the
// job if it had finished as 'failed'.
export async function retryFailed(): Promise<MediaMigrationJob | null> {
  const job = await getLatestJob()
  if (!job) return null
  return prisma.mediaMigrationJob.update({
    where: { id: job.id },
    data: { status: 'running', failedItemIds: [], cursor: null, completedAt: null, lastError: null },
  })
}
