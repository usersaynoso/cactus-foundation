import { prisma } from '@/lib/db/prisma'
import { SEQUENCE_DEDUPE_PREFIX, parseSequenceNotification, type SequenceJobState } from './sequence-notification'

// Scroll-sequence jobs, read back off the notifications they already write. A
// conversion has no table of its own: upsertSequenceNotification (lib/notifications
// /alerts.ts) keeps a single notification per job, keyed `sequence-job:{jobId}`,
// carrying the job's state in its title and its latest progress in reasons[0].
// The Media > Scroll sequences panel lists those, so the job list and the bell
// never tell two different stories - both read them through the shared parsers in
// ./sequence-notification.

export type { SequenceJobState }

export type SequenceJobRow = {
  // The notification's own id - used as the delete target and the React key.
  id: string
  jobId: string
  name: string
  state: SequenceJobState
  // 0-100, or null when the worker hasn't reported a figure yet.
  progress: number | null
  detail: string | null
  updatedAt: string
  createdAt: string
}

export async function listSequenceJobs(limit = 50): Promise<SequenceJobRow[]> {
  const rows = await prisma.notification.findMany({
    where: { dedupeKey: { startsWith: SEQUENCE_DEDUPE_PREFIX } },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { id: true, dedupeKey: true, title: true, reasons: true, createdAt: true, updatedAt: true },
  })

  const jobs: SequenceJobRow[] = []
  for (const row of rows) {
    const job = parseSequenceNotification(row)
    if (!job) continue
    jobs.push({
      id: row.id,
      ...job,
      updatedAt: row.updatedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })
  }
  return jobs
}
