'use client'

import { useEffect, useState } from 'react'
import type { GlobalFont } from '@/lib/design/tokens'

// Module-level cache mirroring useSiteColours: every font field shares one
// fetch instead of racing its own request whenever Puck remounts the panel.
let cache: GlobalFont[] | null = null
let inFlight: Promise<GlobalFont[]> | null = null

function fetchFonts(): Promise<GlobalFont[]> {
  if (cache) return Promise.resolve(cache)
  if (!inFlight) {
    inFlight = fetch('/api/admin/appearance')
      .then(r => r.json())
      .then((d): GlobalFont[] => d.designTokens?.designSystem?.fonts ?? [])
      .catch((): GlobalFont[] => [])
      .then(fonts => { cache = fonts; return fonts })
      .finally(() => { inFlight = null })
  }
  return inFlight
}

export function useSiteFonts(): GlobalFont[] {
  const [fonts, setFonts] = useState<GlobalFont[]>(cache ?? [])

  useEffect(() => {
    if (cache) return
    let cancelled = false
    fetchFonts().then(f => { if (!cancelled) setFonts(f) })
    return () => { cancelled = true }
  }, [])

  return fonts
}
