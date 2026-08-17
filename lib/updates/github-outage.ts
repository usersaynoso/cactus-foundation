/**
 * Update pushes go through GitHub, so a GitHub-side wobble surfaces here as a raw
 * API error the site owner cannot act on. When the failure carries one of the
 * signatures below, the update UI adds a line pointing at GitHub's status page
 * rather than leaving the owner staring at "Resource not accessible by integration".
 *
 * "Resource not accessible by integration" is the awkward one: normally it means the
 * GitHub App genuinely lacks write access, but GitHub also returns it while their
 * App auth or permissions service is degraded. The hint is worded to cover both.
 */
export const GITHUB_STATUS_URL = 'https://www.githubstatus.com/'

const OUTAGE_SIGNATURES = [
  'resource not accessible by integration',
  'bad gateway',
  'service unavailable',
  'internal server error',
  'server error',
  'badobjectstate',
  'was submitted too quickly',
  'rate limit',
  'socket hang up',
  'econnreset',
  'etimedout',
  'enotfound',
  'fetch failed',
  'network error',
  // Raised by this codebase rather than by GitHub: a run abandoned at its own deadline,
  // a function killed at the platform's ceiling, or a live reading off GitHub's status
  // page. All three want the same "check GitHub, try again shortly" line underneath.
  'timed out',
  'ran out of time',
  'responding slowly',
  'github is currently reporting problems',
]

const STATUS_CODE_SIGNATURES = [
  'http 500',
  'http 502',
  'http 503',
  'http 504',
  'status: 500',
  'status: 502',
  'status: 503',
  'status: 504',
]

/** True when an update failure looks like it came from GitHub's end, not the install's. */
export function looksLikeGitHubProblem(message: string | null | undefined): boolean {
  if (!message) return false
  const text = message.toLowerCase()
  return (
    OUTAGE_SIGNATURES.some((s) => text.includes(s)) ||
    STATUS_CODE_SIGNATURES.some((s) => text.includes(s))
  )
}

/** Plain-English hint shown under the raw error. No jargon - site owners read this. */
export const GITHUB_OUTAGE_HINT =
  'This one usually comes from GitHub rather than your site. If GitHub is having a wobble, updates cannot go through until it settles - check their status page, then try again in a few minutes.'
