import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { resolveVercelTeamId } from '@/lib/vercel/deploy'

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

  let token: string
  if (setupComplete) {
    // Post-setup: this is a real admin action (viewing a redeploy triggered from
    // Settings), so require an authenticated, permitted session and never accept
    // a caller-supplied token — only the server's own Vercel credential is used.
    const user = await getSessionFromCookie()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (!await hasPermission(user, 'config.manage')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    token = process.env.VERCEL_API_TOKEN ?? ''
  } else {
    // Pre-auth wizard flow: no admin account exists yet, so the "Connect Vercel"
    // step passes the user-pasted token directly since VERCEL_API_TOKEN isn't
    // saved to the environment until later in the wizard.
    token = process.env.VERCEL_API_TOKEN ?? req.nextUrl.searchParams.get('token') ?? ''
  }
  if (!token) {
    return NextResponse.json({ error: 'VERCEL_API_TOKEN not configured' }, { status: 500 })
  }

  // Team-owned deployments need an explicit teamId on the API calls. In the
  // pre-setup wizard flow VERCEL_PROJECT_ID isn't in the runtime env yet, so
  // the client passes the selected project ID alongside its token.
  const vercelProjectId =
    process.env.VERCEL_PROJECT_ID ?? req.nextUrl.searchParams.get('projectId') ?? undefined
  const teamId = vercelProjectId ? await resolveVercelTeamId(token, vercelProjectId) : null
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
