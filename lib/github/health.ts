/**
 * Live read of GitHub's own status page.
 *
 * Every install/update pushes through the GitHub API, so when GitHub is degraded the
 * update fails in ways that look like the site's fault: timeouts, 502s, or - worst of
 * all - a function killed mid-push that leaves no error message at all. Asking GitHub
 * whether GitHub is broken turns that into a sentence the site owner can act on.
 *
 * Strictly best effort. The status page being unreachable, slow, or a different shape
 * than expected must never block or fail an update: every failure path here reports
 * "no known problem" and lets the real work speak for itself.
 */

const SUMMARY_URL = 'https://www.githubstatus.com/api/v2/summary.json'

// The components an update actually depends on: the REST API for reads and writes,
// Git Operations for the push, Webhooks for the deploy notification coming back.
const RELEVANT_COMPONENTS = ['api requests', 'git operations', 'webhooks']

// A status page read is worth ~2.5s at most - it is a diagnostic, not the job.
const FETCH_TIMEOUT_MS = 2500

// Re-checking on every poll would hammer a third party for no benefit; GitHub's own
// status changes on the order of minutes.
const CACHE_MS = 60 * 1000

export type GitHubHealth = {
  degraded: boolean
  /** Plain-English summary, e.g. "Git Operations (major outage)". Null when healthy. */
  detail: string | null
}

const HEALTHY: GitHubHealth = { degraded: false, detail: null }

let cached: { at: number; value: GitHubHealth } | null = null

type StatusComponent = { name?: unknown; status?: unknown }
type StatusSummary = { components?: unknown; status?: { description?: unknown } }

function prettyStatus(status: string): string {
  return status.replace(/_/g, ' ')
}

/**
 * Returns whether GitHub is currently reporting a problem with the parts an update
 * needs. Cached for a minute; never throws.
 */
export async function checkGitHubHealth(): Promise<GitHubHealth> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value

  let value = HEALTHY
  try {
    const res = await fetch(SUMMARY_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    })
    if (res.ok) {
      const data = (await res.json()) as StatusSummary
      const components = Array.isArray(data.components) ? (data.components as StatusComponent[]) : []
      const affected = components
        .filter((c) => {
          const name = typeof c.name === 'string' ? c.name.toLowerCase() : ''
          const status = typeof c.status === 'string' ? c.status : ''
          return RELEVANT_COMPONENTS.includes(name) && status !== '' && status !== 'operational'
        })
        .map((c) => `${String(c.name)} (${prettyStatus(String(c.status))})`)

      if (affected.length > 0) {
        value = { degraded: true, detail: affected.join(', ') }
      }
    }
  } catch {
    // Unreachable status page, timeout, or unexpected shape: assume GitHub is fine and
    // let the update's own outcome be the evidence.
    value = HEALTHY
  }

  cached = { at: Date.now(), value }
  return value
}

/** One line for the site owner. Empty string when GitHub reports nothing wrong. */
export async function gitHubOutageNote(): Promise<string> {
  const health = await checkGitHubHealth()
  if (!health.degraded) return ''
  return `GitHub is currently reporting problems with ${health.detail}. Updates are pushed through GitHub, so they cannot go through until that settles.`
}

/** Test seam - drops the cached reading so a fresh check runs. */
export function resetGitHubHealthCache(): void {
  cached = null
}
