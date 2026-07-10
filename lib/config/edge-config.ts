import type { SiteStatus } from '@prisma/client'

// Edge Config holds two values for ultra-fast reads on every request in proxy.ts:
//   - adminPath: the secret admin URL prefix
//   - siteStatus: 'live' | 'comingSoon' | 'maintenance'
//
// Reads use the EDGE_CONFIG connection string (@vercel/edge-config).
// Writes use the Vercel REST API (VERCEL_API_TOKEN + VERCEL_EDGE_CONFIG_ID).
// If write credentials aren't present, callers fall back to a direct Prisma read.

type EdgeConfigData = {
  adminPath: string | null
  siteStatus: SiteStatus | null
}

async function readFromEdgeConfig(): Promise<EdgeConfigData> {
  try {
    // Dynamic import so the module isn't bundled when EDGE_CONFIG is absent
    const { get } = await import('@vercel/edge-config')
    const [adminPath, siteStatus] = await Promise.all([
      get<string>('adminPath'),
      get<SiteStatus>('siteStatus'),
    ])
    return {
      adminPath: adminPath ?? null,
      siteStatus: siteStatus ?? null,
    }
  } catch {
    return { adminPath: null, siteStatus: null }
  }
}

export async function getAdminPathFromEdgeConfig(): Promise<string | null> {
  if (!process.env.EDGE_CONFIG) return null
  const { adminPath } = await readFromEdgeConfig()
  return adminPath
}

export async function getSiteStatusFromEdgeConfig(): Promise<SiteStatus | null> {
  if (!process.env.EDGE_CONFIG) return null
  const { siteStatus } = await readFromEdgeConfig()
  return siteStatus
}

// Write both values to Edge Config via the Vercel REST API.
// Called whenever adminPath or status changes in SiteConfig.
export async function syncToEdgeConfig(updates: {
  adminPath?: string
  siteStatus?: SiteStatus
}): Promise<boolean> {
  if (!process.env.VERCEL_API_TOKEN || !process.env.VERCEL_EDGE_CONFIG_ID) {
    return false
  }

  const items = Object.entries(updates).map(([key, value]) => ({
    operation: 'upsert' as const,
    key: key === 'siteStatus' ? 'siteStatus' : key,
    value,
  }))

  try {
    const res = await fetch(
      `https://api.vercel.com/v1/edge-config/${process.env.VERCEL_EDGE_CONFIG_ID}/items`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items }),
      }
    )
    return res.ok
  } catch {
    return false
  }
}

// The Edge Config write API can return success before the new value has
// propagated to every edge region. proxy.ts reads adminPath on every request
// to gate the admin prefix, so a caller that redirects a user to a new
// adminPath right after saving can send them into a 404 against a still-stale
// read. Poll the same read path until it reflects the expected value (or give
// up after maxWaitMs) so the caller can hold the response until it's safe to redirect.
export async function waitForAdminPathPropagation(expected: string, maxWaitMs = 3000): Promise<void> {
  if (!process.env.EDGE_CONFIG) return
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    const { adminPath } = await readFromEdgeConfig()
    if (adminPath === expected) return
    await new Promise((r) => setTimeout(r, 300))
  }
}
