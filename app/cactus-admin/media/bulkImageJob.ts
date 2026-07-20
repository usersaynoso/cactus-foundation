// Shared driver for the bulk image jobs - optimise, change ratio, resize.
//
// Each of those re-encodes a picture server-side: pull the blob out of storage,
// run it through sharp, put the result back, repoint the row. Seconds apiece.
// Handing a whole selection to one request meant those seconds ran end to end
// inside a single serverless call, so a few hundred images took an age, and past
// a certain count the request ran out of time before it reached the last of them
// - reporting a cheerful tally for the ones it had managed and quietly dropping
// the rest.
//
// So the selection is driven from here instead: one image per request, six
// requests in flight, each landing in its own serverless call. Six re-encodes
// run at once rather than one, no single request carries more than one image's
// worth of work so the time limit stops being a cliff, and the count can be
// reported as it goes rather than after a long silence.
//
// The endpoints are the existing bulk routes handed a list of one. They already
// tally per item and already survive an item failing, so the tallies merge
// straight back together and the server keeps its one code path - including the
// per-file naming that 'save as new copies' relies on.

/** Six at a time, as with uploads: browsers hold about six connections per host. */
export const BULK_CONCURRENCY = 6

export type BulkTally = {
  /** Ids the server reported as actually changed. */
  changed: string[]
  skipped: { id: string; reason: string }[]
  failed: { id: string; error: string }[]
  bytesSaved: number
}

type Options = {
  /** Key the route reports its successes under - bulk-optimise says 'optimised'. */
  changedKey?: 'changed' | 'optimised'
  onProgress?: (done: number, total: number) => void
}

export async function runBulkImageJob(
  endpoint: string,
  ids: string[],
  body: Record<string, unknown>,
  options: Options = {},
): Promise<BulkTally> {
  const { changedKey = 'changed', onProgress } = options
  const tally: BulkTally = { changed: [], skipped: [], failed: [], bytesSaved: 0 }

  let next = 0
  let done = 0
  // Set when a reply says the request itself was refused rather than one image
  // having gone wrong. Read after the workers drain, so a plain object keeps the
  // value obvious across the closure boundary.
  const fatal: { error: Error | null } = { error: null }

  async function worker() {
    while (next < ids.length && fatal.error === null) {
      const id = ids[next++]
      if (!id) return
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, ids: [id] }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          const message = typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`
          // A 4xx is the request being turned away - signed out, no permission, a
          // ratio that doesn't parse - and it would be turned away identically for
          // every other id. Stop and say it once rather than marching on to report
          // four hundred failures with a single cause. A 404 is about that one
          // item, so it counts as that item failing and the rest carry on.
          if (res.status >= 400 && res.status < 500 && res.status !== 404) {
            fatal.error = new Error(message)
            return
          }
          throw new Error(message)
        }
        const changed: unknown = data?.[changedKey]
        if (Array.isArray(changed)) tally.changed.push(...(changed as string[]))
        if (Array.isArray(data?.skipped)) tally.skipped.push(...data.skipped)
        if (Array.isArray(data?.failed)) tally.failed.push(...data.failed)
        if (typeof data?.bytesSaved === 'number') tally.bytesSaved += data.bytesSaved
      } catch (err) {
        // One image failing - a corrupt file, a storage hiccup - costs that image
        // and nothing else. The other five lanes keep draining.
        tally.failed.push({ id, error: err instanceof Error ? err.message : 'Unknown error' })
      }
      done++
      onProgress?.(done, ids.length)
    }
  }

  await Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, ids.length) }, worker))
  if (fatal.error) throw fatal.error
  return tally
}
