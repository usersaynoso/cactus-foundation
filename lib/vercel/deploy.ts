const VERCEL_API = 'https://api.vercel.com'

// Triggers a new Vercel production deployment based on the latest existing deployment
// for the project. This picks up any env var changes written since the last deploy.
// Best-effort — if the API call fails, the caller should surface a manual-redeploy message.
export async function triggerVercelRedeploy(
  token: string,
  projectId: string
): Promise<{ triggered: boolean; error?: string }> {
  try {
    // Find the most recent production deployment (any state — we just need the source).
    const listRes = await fetch(
      `${VERCEL_API}/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=5&target=production`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      }
    )
    if (!listRes.ok) {
      return { triggered: false, error: `Could not list deployments (${listRes.status})` }
    }

    const listData = (await listRes.json()) as {
      deployments?: Array<{ uid: string; name: string; state: string }>
    }

    const latest = listData.deployments?.[0]
    if (!latest) {
      return { triggered: false, error: 'No existing deployments found to redeploy from' }
    }

    // Create a new deployment based on the existing one. Vercel picks up the
    // latest project env vars for the new deployment.
    const deployRes = await fetch(`${VERCEL_API}/v13/deployments?forceNew=1`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deploymentId: latest.uid,
        name: latest.name,
        target: 'production',
      }),
      signal: AbortSignal.timeout(20_000),
    })

    if (!deployRes.ok) {
      const body = await deployRes.text()
      return { triggered: false, error: `Redeploy API error (${deployRes.status}): ${body}` }
    }

    return { triggered: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { triggered: false, error: message }
  }
}
