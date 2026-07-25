import { prisma } from '@/lib/db/prisma'

// Scroll-sequence jobs, read back off the notifications they already write. A
// conversion has no table of its own: upsertSequenceNotification (lib/notifications
// /alerts.ts) keeps a single notification per job, keyed `sequence-job:{jobId}`,
// carrying the job's state in its title and its latest progress in reasons[0].
// The Media > Scroll sequences panel lists those, so the job list and the bell
// never tell two different stories.

export type SequenceJobState = 'queued' | 'running' | 'done' | 'error'

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

const DEDUPE_PREFIX = 'sequence-job:'

type ReasonRow = { label?: unknown; detail?: unknown }

// Title prefixes upsertSequenceNotification writes. "in progress" covers both the
// queued and running phases (the title doesn't distinguish them); reasons[0].label
// does, so we read the finer state from there and fall back to the title.
function stateFromNotification(title: string, label: string | null): SequenceJobState {
  if (title.startsWith('Scroll sequence complete:') || label === 'Finished') return 'done'
  if (title.startsWith('Scroll sequence failed:') || label === 'Failed') return 'error'
  if (label === 'Building') return 'running'
  return 'queued'
}

function nameFromTitle(title: string): string {
  return title.replace(/^Scroll sequence (?:in progress|complete|failed): /, '')
}

// Pull the "NN%" a progress detail leads with back into a number, tolerating the
// "NN% - detail" shape upsertSequenceNotification writes when it has both.
function progressFromDetail(detail: string | null): number | null {
  if (!detail) return null
  const m = detail.match(/^(\d+)%/)
  if (!m) return null
  const n = parseInt(m[1] ?? '', 10)
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null
}

export async function listSequenceJobs(limit = 50): Promise<SequenceJobRow[]> {
  const rows = await prisma.notification.findMany({
    where: { dedupeKey: { startsWith: DEDUPE_PREFIX } },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { id: true, dedupeKey: true, title: true, reasons: true, createdAt: true, updatedAt: true },
  })

  return rows.map((row) => {
    const reason = (Array.isArray(row.reasons) ? (row.reasons[0] as ReasonRow | undefined) : undefined) ?? undefined
    const label = reason && typeof reason.label === 'string' ? reason.label : null
    const detail = reason && typeof reason.detail === 'string' ? reason.detail : null
    return {
      id: row.id,
      jobId: (row.dedupeKey ?? '').slice(DEDUPE_PREFIX.length),
      name: nameFromTitle(row.title),
      state: stateFromNotification(row.title, label),
      progress: progressFromDetail(detail),
      detail,
      updatedAt: row.updatedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }
  })
}
