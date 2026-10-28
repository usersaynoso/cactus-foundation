import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { resolveVercelTeamId } from '@/lib/vercel/deploy'
import { getHostingCredentials, resolveHostingCredentials, type HostingCredentials } from '@/lib/hosting/provider'
import { getNetlifyDeploy, netlifyStateToNormalised } from '@/lib/netlify/deploy'

const VERCEL_API = 'https://api.vercel.com'

export async function GET(req: NextRequest) {
  const deploymentId = req.nextUrl.searchParams.get('deploymentId')
  if (!deploymentId) {
    return NextResponse.json({ error: 'deploymentId is required' }, { status: 400 })
  }

  // During the setup wizard the database may not exist yet — a failed query
  // means setup cannot be complete, not that the request should 500.
  let setupComplete = false
  try {
    const [cfg, userCount] = await Promise.all([
      prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { setupCompleted: true } }),
      prisma.user.count(),
    ])
    setupComplete = (cfg?.setupCompleted ?? false) && userCount > 0
  } catch {
    setupComplete = false
  }

  let creds: HostingCredentials | null
  if (setupComplete) {
    // Post-setup: this is a real admin action (viewing a redeploy triggered from
    // Settings), so require an authenticated, permitted session and never accept
    // a caller-supplied token — only the server's own hosting credential is used.
    const user = await getSessionFromCookie()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (!await hasPermission(user, 'config.manage')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    creds = getHostingCredentials()
  } else {
    // Pre-auth wizard flow: no admin account exists yet, so the connect step
    // passes the user-pasted token directly since it isn't saved to the
    // environment until later in the wizard. The project/site id rides along for
    // the same reason, and Vercel needs it to resolve a team.
    //
    // The token arrives in a header, never a query string. A live API token in a
    // URL is written to the platform's access logs, the browser's history and any
    // Referer sent onward - none of which the operator can clear afterwards.
    // `x-vercel-token` is the header's name from before Netlify was an option.
    const params = req.nextUrl.searchParams
    creds =
      getHostingCredentials() ??
      resolveHostingCredentials({
        provider: params.get('provider') ?? undefined,
        token: req.headers.get('x-host-token')?.trim() || req.headers.get('x-vercel-token')?.trim(),
        siteId: params.get('siteId') ?? params.get('projectId'),
      })
  }
  if (!creds) {
    return NextResponse.json({ error: 'Hosting credentials not configured' }, { status: 500 })
  }

  if (creds.provider === 'netlify') {
    return netlifyDeployProgress(creds, deploymentId, req.nextUrl.searchParams.get('since'))
  }

  const token = creds.token
  // Team-owned deployments need an explicit teamId on the API calls.
  const teamId = await resolveVercelTeamId(token, creds.siteId)
  const teamParam = teamId ? `teamId=${encodeURIComponent(teamId)}` : ''

  const since = req.nextUrl.searchParams.get('since')
  const eventsQuery = [since ? `since=${encodeURIComponent(since)}` : '', teamParam]
    .filter(Boolean)
    .join('&')
  const eventsUrl = `${VERCEL_API}/v2/deployments/${encodeURIComponent(deploymentId)}/events${eventsQuery ? `?${eventsQuery}` : ''}`

  try {
    const [stateRes, eventsRes] = await Promise.all([
      fetch(`${VERCEL_API}/v13/deployments/${encodeURIComponent(deploymentId)}${teamParam ? `?${teamParam}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      }),
      fetch(eventsUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      }),
    ])

    const state = stateRes.ok
      ? ((await stateRes.json()) as { readyState?: string }).readyState ?? ''
      : ''

    let logLines: string[] = []
    let latestTimestamp: number | null = null
    if (eventsRes.ok) {
      const events = (await eventsRes.json()) as Array<{
        type?: string
        payload?: { text?: string }
        created?: number
      }>
      const filtered = events.filter((e) => !!e.payload?.text)
      logLines = filtered.map((e) => e.payload!.text!)
      const lastEvent = events[events.length - 1]
      if (lastEvent?.created) latestTimestamp = lastEvent.created
    }

    return NextResponse.json({ state, logLines, latestTimestamp })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Netlify has no REST endpoint for a build's log lines (its dashboard streams them
// over a separate realtime channel), so the wizard gets the state plus a line at
// each milestone instead. `latestTimestamp` doubles as a milestone counter here so
// the client's existing `since` round-trip stops each line being sent twice:
// 1 = the opening note has been sent, 2 = the closing one has.
async function netlifyDeployProgress(
  creds: HostingCredentials,
  deploymentId: string,
  sinceRaw: string | null
): Promise<NextResponse> {
  const since = Number(sinceRaw) || 0
  const deploy = await getNetlifyDeploy(creds.token, deploymentId).catch(() => null)
  const normalised = netlifyStateToNormalised(deploy?.state)
  const state = normalised === 'UNKNOWN' ? '' : normalised
  const logLines: string[] = []
  let latestTimestamp = since

  if (since < 1) {
    logLines.push('Building on Netlify. The full build log is in your Netlify dashboard under Deploys.')
    latestTimestamp = 1
  }
  if (since < 2 && (state === 'READY' || state === 'ERROR' || state === 'CANCELED')) {
    logLines.push(
      state === 'READY'
        ? 'Deploy is live.'
        : `Deploy ${state === 'CANCELED' ? 'was cancelled' : 'failed'}${deploy?.error_message ? `: ${deploy.error_message}` : '.'}`
    )
    latestTimestamp = 2
  }

  return NextResponse.json({ state, logLines, latestTimestamp })
}
