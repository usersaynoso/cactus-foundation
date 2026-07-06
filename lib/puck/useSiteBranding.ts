'use client'

import { useEffect, useState } from 'react'

export type SiteBranding = { logoUrl: string | null; logoDarkUrl: string | null; siteName: string }

const EMPTY: SiteBranding = { logoUrl: null, logoDarkUrl: null, siteName: '' }

// Module-level cache, same reasoning as useSiteColours: the Puck Fields panel
// can remount custom-preview components on selection/history changes, so a
// shared cache stops every remount re-fetching (and briefly showing the
// Cactus placeholder logo) mid-session.
let cache: SiteBranding | null = null
let inFlight: Promise<SiteBranding> | null = null

function fetchBranding(): Promise<SiteBranding> {
  if (cache) return Promise.resolve(cache)
  if (!inFlight) {
    inFlight = fetch('/api/admin/config')
      .then(r => r.json())
      .then(d => {
        cache = {
          logoUrl: d.logoUrl ?? null,
          logoDarkUrl: d.logoDarkUrl ?? null,
          siteName: d.siteName ?? '',
        }
        return cache
      })
      .catch(() => EMPTY)
      .finally(() => { inFlight = null })
  }
  return inFlight
}

export function useSiteBranding(): SiteBranding {
  const [branding, setBranding] = useState<SiteBranding>(cache ?? EMPTY)

  useEffect(() => {
    if (cache) return
    let cancelled = false
    fetchBranding().then(b => { if (!cancelled) setBranding(b) })
    return () => { cancelled = true }
  }, [])

  return branding
}
