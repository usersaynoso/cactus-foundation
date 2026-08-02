import { prisma } from '@/lib/db/prisma'
import { VIDEO_JOB_DEDUPE_PREFIX, parseVideoJobNotification, type VideoJobState } from './video-job-notification'

// Video-optimise jobs, read back off the notifications they already write. A job
// has no table of its own: upsertVideoJobNotification (lib/notifications/alerts.ts)
// keeps a single notification per job, keyed `video-job:{jobRef}`, carrying the
// job's state in its title and its latest progress in reasons[0]. The Media >
// Video panel lists those, so the job list and the bell never tell two different
// stories - both read them through the shared parsers in ./video-job-notification.

export type { VideoJobState }

export type VideoJobRow = {
  // The notification's own id - used as the delete target and the React key.
  id: string
  jobId: string
  name: string
  state: VideoJobState
  /** 0-100, or null when the worker hasn't reported a figure yet. */
  progress: number | null
  detail: string | null
  updatedAt: string
  createdAt: string
}

export async function listVideoJobs(limit = 50): Promise<VideoJobRow[]> {
  const rows = await prisma.notification.findMany({
    where: { dedupeKey: { startsWith: VIDEO_JOB_DEDUPE_PREFIX } },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { id: true, dedupeKey: true, title: true, reasons: true, createdAt: true, updatedAt: true },
  })

  const jobs: VideoJobRow[] = []
  for (const row of rows) {
    const job = parseVideoJobNotification(row)
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
