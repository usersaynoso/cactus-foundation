import { getSiteUrlOrNull } from '@/lib/config/env'

// Calling one scheduled job and saying honestly what came back.
//
// Shared by the dispatcher's own tick and by the Run now button on Settings >
// Schedules, because a job run by hand has to be the same job run the same way:
// a second calling path is a second set of behaviours, and the one nobody
// exercises is the one that is wrong when it matters.

// How much of a failing job's own answer to keep. `HTTP 500` on its own tells
// the owner only that something broke; the route's error message is the whole
// difference between a job somebody can fix and one nobody can.
const MAX_DETAIL_CHARS = 300

/** What a failing job actually said, as a suffix for the recorded status. Cron
 *  routes answer with `{ error }` or `{ message }` by convention; anything else
 *  is kept as trimmed text, because an HTML error page's first line still beats
 *  nothing.
 *
 *  This is only ever as good as the route's own error handling: an uncaught
 *  throw is masked by the framework into a bare "Internal Server Error" before
 *  it ever reaches us, which is why a cron route should catch its own failures
 *  and say what went wrong.
 *
 *  Never throws itself - a job that failed has already been recorded as failed,
 *  and losing that to a malformed body would be the worse bug. */
export async function describeFailure(res: Response): Promise<string> {
  try {
    const text = (await res.text()).trim()
    if (!text) return ''
    let message = text
    try {
      const parsed: unknown = JSON.parse(text)
      if (parsed && typeof parsed === 'object') {
        const record = parsed as Record<string, unknown>
        const field = record.error ?? record.message
        if (typeof field === 'string' && field.trim()) message = field.trim()
      }
    } catch {
      // Not JSON. The raw text is still the best answer available.
    }
    message = message.replace(/\s+/g, ' ')
    if (message.length > MAX_DETAIL_CHARS) message = `${message.slice(0, MAX_DETAIL_CHARS)}...`
    return ` - ${message}`
  } catch {
    return ''
  }
}

export interface CronCallResult {
  status: 'ran' | 'failed'
  detail?: string
}

/** Call one job on this site, with the same bearer token Vercel's own cron
 *  requests carry, and report what happened. Records nothing: stamping the run
 *  is the caller's business, and both callers stamp it BEFORE this is called so
 *  a job that hangs has still had its turn. */
export async function callCronJob(
  path: string,
  options: { siteUrl: string; secret: string; timeoutMs: number }
): Promise<CronCallResult> {
  try {
    const res = await fetch(`${options.siteUrl}${path}`, {
      headers: { Authorization: `Bearer ${options.secret}` },
      signal: AbortSignal.timeout(options.timeoutMs),
      cache: 'no-store',
    })
    if (!res.ok) return { status: 'failed', detail: `HTTP ${res.status}${await describeFailure(res)}` }
    // Nothing here reads a successful job's body, and an unread one holds its
    // connection open until the runtime gets round to collecting it.
    await res.body?.cancel().catch(() => {})
    return { status: 'ran' }
  } catch (err) {
    return { status: 'failed', detail: err instanceof Error ? err.message : String(err) }
  }
}

/** The two things a job cannot be called without, or the reason it cannot be.
 *  Both are deployment facts rather than anything the owner typed, so the
 *  message says which one is missing rather than "something went wrong". */
export function cronCallEnvironment(): { siteUrl: string; secret: string } | { error: string } {
  const secret = process.env.CRON_SECRET
  if (!secret) return { error: 'CRON_SECRET is not configured' }
  const siteUrl = getSiteUrlOrNull()
  if (!siteUrl) return { error: 'SITE_URL is not configured' }
  return { siteUrl, secret }
}
