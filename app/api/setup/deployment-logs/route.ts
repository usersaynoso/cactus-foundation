import { NextRequest, NextResponse } from 'next/server'

const VERCEL_API = 'https://api.vercel.com'

export async function GET(req: NextRequest) {
  const deploymentId = req.nextUrl.searchParams.get('deploymentId')
  if (!deploymentId) {
    return NextResponse.json({ error: 'deploymentId is required' }, { status: 400 })
  }

  const token = process.env.VERCEL_API_TOKEN ?? req.nextUrl.searchParams.get('token') ?? ''
  if (!token) {
    return NextResponse.json({ error: 'VERCEL_API_TOKEN not configured' }, { status: 500 })
  }

  const since = req.nextUrl.searchParams.get('since')
  const eventsUrl = since
    ? `${VERCEL_API}/v2/deployments/${encodeURIComponent(deploymentId)}/events?since=${encodeURIComponent(since)}`
    : `${VERCEL_API}/v2/deployments/${encodeURIComponent(deploymentId)}/events`

  try {
    const [stateRes, eventsRes] = await Promise.all([
      fetch(`${VERCEL_API}/v13/deployments/${encodeURIComponent(deploymentId)}`, {
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
