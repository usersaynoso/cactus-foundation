// The decision-making half of a bulk media upload, split out of MediaLibrary so
// it can be tested without a browser. Two phases, matching what a person sees:
//
//   1. planUploadJobs - every name clash is answered before anything is sent,
//      one dialog at a time, in file order. A "cancel" here still means
//      "nothing happened", and the parallel phase never has to pause a
//      half-finished pool to ask a question.
//   2. runUploadPool - a fixed-width worker pool drains the answered jobs.
//      Each worker pulls the next job off a shared cursor, so a slow file
//      never blocks the ones behind it - the other lanes keep draining.
//
// Neither phase knows about fetch, React or the upload bell: the caller passes
// in the ask/upload/report functions, which is exactly what makes the dialog
// ordering and pool behaviour testable.

/** What the person chose when told an upload's name was already taken. */
export type UploadChoice = 'replace' | 'suffix' | 'skip' | 'cancel'

export type ClashInfo = { existingId: string; suggestedName: string }

/** One file entering the batch. `blocked` marks tasks that failed preflight. */
export type BatchEntry<F> = {
  file: F
  taskId: string
  name: string
  blocked: boolean
}

/** A file with its clash answered, ready for the pool. */
export type UploadJob<F> = {
  file: F
  taskId: string
  clash: ClashInfo | null
  choice: UploadChoice
}

/**
 * Answer every clash in file order and return the jobs that should upload.
 * `ask` shows the dialog and resolves with the person's answer; it is only
 * called while no bulk answer is in force, so a hundred same-named files never
 * mean a hundred identical dialogs. `onSkip` reports tasks that will not run
 * (skipped, or everything after a cancel).
 *
 * If `ask` throws (the dialog plumbing failed), the whole remainder is skipped
 * rather than left hanging - a batch must always end with every task settled.
 */
export async function planUploadJobs<F>(
  entries: BatchEntry<F>[],
  clashes: Map<string, ClashInfo>,
  ask: (clash: ClashInfo & { name: string }, remaining: number) => Promise<{ choice: UploadChoice; applyToAll: boolean }>,
  onSkip: (taskId: string) => void,
): Promise<UploadJob<F>[]> {
  // How many entries clash, so the dialog can offer "do the same for the rest"
  // only when there is a rest to apply it to.
  const totalClashes = entries.filter((e) => !e.blocked && clashes.has(e.name)).length

  const jobs: UploadJob<F>[] = []
  let cancelled = false
  // Set once a dialog is answered with "do the same for the rest" ticked.
  let bulkChoice: UploadChoice | null = null
  let clashesHandled = 0
  for (const entry of entries) {
    if (entry.blocked) continue
    if (cancelled) { onSkip(entry.taskId); continue }

    let choice: UploadChoice = 'suffix'
    const clash = clashes.get(entry.name) ?? null
    if (clash) {
      if (bulkChoice) {
        choice = bulkChoice
      } else {
        let answer: { choice: UploadChoice; applyToAll: boolean }
        try {
          answer = await ask({ ...clash, name: entry.name }, totalClashes - clashesHandled)
        } catch {
          // The dialog never resolved - treat it as cancel so every remaining
          // task settles instead of the batch hanging forever.
          answer = { choice: 'cancel', applyToAll: false }
        }
        choice = answer.choice
        // Cancel stops the whole batch anyway, so there's nothing to carry.
        if (answer.applyToAll && choice !== 'cancel') bulkChoice = choice
      }
      clashesHandled++
      if (choice === 'cancel') { cancelled = true; onSkip(entry.taskId); continue }
      if (choice === 'skip') { onSkip(entry.taskId); continue }
    }
    jobs.push({ file: entry.file, taskId: entry.taskId, clash, choice })
  }
  return jobs
}

/**
 * Drain `jobs` through `width` concurrent workers. Every job ends in exactly
 * one of `report.done` / `report.fail` - a throwing upload fails its own job
 * and nothing else. Returns how many finished successfully.
 */
export async function runUploadPool<F>(
  jobs: UploadJob<F>[],
  width: number,
  upload: (job: UploadJob<F>) => Promise<void>,
  report: {
    start: (taskId: string) => void
    done: (taskId: string) => void
    fail: (taskId: string, message: string) => void
  },
): Promise<number> {
  let uploaded = 0
  let next = 0
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++]
      if (!job) return
      report.start(job.taskId)
      try {
        await upload(job)
        report.done(job.taskId)
        uploaded++
      } catch (err) {
        report.fail(job.taskId, err instanceof Error ? err.message : 'Upload failed')
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, jobs.length) }, worker))
  return uploaded
}
