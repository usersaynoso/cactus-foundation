// Resilience helpers for the GitHub Git Data API (createBlob → createTree →
// createCommit → updateRef), shared by the core-update sync and the module
// registry push.
//
// The Git Data API is eventually consistent: an object (blob, tree, commit) or a
// ref created moments earlier is not always visible to the very next call, which
// surfaces as GitRPC::BadObjectState, a transient 5xx, a "Reference does not
// exist" read, or a spurious "not a fast forward" on updateRef. Right after a
// fresh release push the replication window can run to tens of seconds. Left
// unguarded, any of these fails the user's update outright - which is exactly
// what "update failed after a failed update" looked like: the retry pushes the
// full delta from the last-good build, a larger delta, a wider window.
//
// Two tools close the gap:
//   1. retryTransient - wrap a whole write transaction (re-reading HEAD each
//      attempt) so replication lag and HEAD races are absorbed, not surfaced.
//   2. createReplicatedBlob - after creating a blob, confirm it reads back before
//      it is referenced in a tree, so createTree never points at an unreplicated
//      object. The tree write is still retried underneath as the real guarantee;
//      this just turns the common case into a fast, deterministic path.

import type { getGithubClient } from '@/lib/github/client'

type OctokitClient = Awaited<ReturnType<typeof getGithubClient>>

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// True for errors that are worth waiting out rather than surfacing. Deliberately
// narrow: genuine 4xx (missing repo, bad auth, absent branch) are NOT retried, so
// a real misconfiguration still fails fast instead of stalling for minutes.
export function isTransientGitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const status = (err as { status?: number }).status
  if (typeof status === 'number' && status >= 500) return true // 500/502/503 backend blips
  const msg = err.message
  return (
    msg.includes('BadObjectState') || // unreplicated object referenced by createTree
    msg.includes('not a fast forward') || // HEAD moved under us between read and updateRef
    msg.includes('Reference does not exist') || // heads/main exists, so this read is a replication lag
    msg.includes('secondary rate limit') ||
    msg.includes('exceeded a secondary rate limit') ||
    msg.includes('retry your request')
  )
}

export interface RetryOpts {
  attempts?: number
  baseMs?: number
  capMs?: number
}

// Exponential backoff with equal jitter (guaranteed half + random half), so
// concurrent callers don't resynchronise onto the same retry beat. Defaults of 8
// attempts / 1s base / 60s cap give a total budget of a few minutes - comfortably
// past the post-release replication lag - while a non-transient error throws on
// the first try.
export async function retryTransient<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const attempts = opts.attempts ?? 8
  const baseMs = opts.baseMs ?? 1000
  const capMs = opts.capMs ?? 60_000
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isTransientGitError(err) || i === attempts - 1) throw err
      const ceil = Math.min(capMs, baseMs * 2 ** i)
      await sleep(Math.floor(ceil / 2 + Math.random() * (ceil / 2)))
    }
  }
  throw lastErr
}

// Create a blob, then wait (best-effort) until it reads back before returning its
// sha. A blob that reads back has replicated, so a following createTree cannot
// reference an unreplicated object - the createBlob→createTree BadObjectState race
// is closed at the source. If confirmation never lands, we still return the sha:
// the caller's createTree is itself wrapped in retryTransient, which remains the
// hard guarantee.
export async function createReplicatedBlob(
  octokit: OctokitClient,
  params: { owner: string; repo: string; content: string; encoding: 'utf-8' | 'base64' },
): Promise<string> {
  const { data: blob } = await retryTransient(() => octokit.rest.git.createBlob(params))
  for (let i = 0; i < 8; i++) {
    try {
      await octokit.rest.git.getBlob({ owner: params.owner, repo: params.repo, file_sha: blob.sha })
      break
    } catch {
      await sleep(Math.min(4000, 500 * 2 ** i))
    }
  }
  return blob.sha
}
