import { NextRequest, NextResponse } from 'next/server'

const VERCEL_API = 'https://api.vercel.com'

export async function GET(req: NextRequest) {
  const deploymentId = req.nextUrl.searchParams.get('deploymentId')
  if (!deploymentId) {
    return NextResponse.json({ error: 'deploymentId is required' }, { status: 400 })
  }

  const token = process.env.VERCEL_API_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'VERCEL_API_TOKEN not configured' }, { status: 500 })
  }

  try {
    const [stateRes, eventsRes] = await Promise.all([
      fetch(`${VERCEL_API}/v13/deployments/${encodeURIComponent(deploymentId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      }),
      fetch(`${VERCEL_API}/v2/deployments/${encodeURIComponent(deploymentId)}/events`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      }),
    ])

    const state = stateRes.ok
      ? ((await stateRes.json()) as { readyState?: string }).readyState ?? ''
      : ''

    let logLines: string[] = []
    if (eventsRes.ok) {
      const events = (await eventsRes.json()) as Array<{
        type?: string
        payload?: { text?: string }
      }>
      logLines = events
        .filter((e) =>
          (e.type === 'stdout' || e.type === 'stderr' || e.type === 'command') &&
          !!e.payload?.text
        )
        .map((e) => e.payload!.text!)
        .slice(-3)
    }

    return NextResponse.json({ state, logLines })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
